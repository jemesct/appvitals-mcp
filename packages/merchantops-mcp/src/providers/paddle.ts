// Paddle Billing API: https://developer.paddle.com/api-reference/overview
// Base https://api.paddle.com (sandbox https://sandbox-api.paddle.com), Bearer API key,
// cursor pagination via per_page and meta.pagination.next / has_more.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { requestJson, type FetchLike } from "../http.js";
import type { Discount, DiscountInput, FailedPayment, Interval, Provider, Refund, Subscription, WriteRequest } from "../types.js";

export const PADDLE_BASE = { production: "https://api.paddle.com", sandbox: "https://sandbox-api.paddle.com" };

const STATUS: Record<string, Subscription["normalisedStatus"]> = {
  active: "active", trialing: "trialing", past_due: "past_due", paused: "paused", canceled: "cancelled",
};

export class PaddleProvider implements Provider {
  name = "paddle" as const;
  capabilities = {
    subscriptions: true, mrr: true, churn: true, failedPayments: "transactions with status past_due, plus past_due subscriptions",
    refundsList: "GET /adjustments?action=refund", refundIssue: "POST /adjustments (action refund, type full). Live refunds usually wait for Paddle approval",
    licenseKeysList: "not available: Paddle Billing has no native license keys (use a fulfilment webhook or a licensing service)",
    licenseKeyRevoke: "not available: Paddle Billing has no native license keys",
    licenseKeyIssue: "not available: Paddle Billing has no native license keys",
    discountsList: true, discountCreate: true,
  };
  private base: string;
  constructor(private apiKey: string, env: "sandbox" | "production" = "sandbox", private fetchFn: FetchLike = fetch) {
    this.base = PADDLE_BASE[env];
  }

  private headers(): Record<string, string> {
    return { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` };
  }

  private async listAll(path: string, params: Record<string, string> = {}): Promise<any[]> {
    let url: string | null = `${this.base}${path}?${new URLSearchParams({ per_page: "200", ...params })}`;
    const out: any[] = [];
    for (let i = 0; url && i < 100; i++) {
      const json: any = await requestJson(this.fetchFn, url, { headers: this.headers() });
      out.push(...(json.data ?? []));
      const p = json.meta?.pagination;
      url = p?.has_more && p?.next ? p.next : null;
    }
    return out;
  }

  async listSubscriptions(): Promise<Subscription[]> {
    const rows = await this.listAll("/subscriptions");
    return rows.map((s) => {
      const amount = (s.items ?? []).reduce((t: number, it: any) => t + Number(it.price?.unit_price?.amount ?? 0) * (it.quantity ?? 1), 0);
      return {
        id: s.id, provider: "paddle", status: s.status, normalisedStatus: STATUS[s.status] ?? "other",
        customer: s.customer_id ?? null, product: s.items?.[0]?.price?.description ?? s.items?.[0]?.product?.name ?? null,
        amountMinor: amount, currency: s.currency_code,
        interval: (s.billing_cycle?.interval ?? "month") as Interval, intervalCount: s.billing_cycle?.frequency ?? 1,
        createdAt: s.created_at, cancelledAt: s.canceled_at ?? null, endsAt: s.canceled_at ?? null,
      } satisfies Subscription;
    });
  }

  async failedPayments(): Promise<FailedPayment[]> {
    const txns = await this.listAll("/transactions", { status: "past_due" });
    const subs = await this.listAll("/subscriptions", { status: "past_due" });
    return [
      ...txns.map((t): FailedPayment => ({ id: t.id, kind: "transaction", status: t.status, customer: t.customer_id ?? null, amountMinor: Number(t.details?.totals?.grand_total ?? t.details?.totals?.total ?? 0), currency: t.currency_code, at: t.billed_at ?? t.created_at })),
      ...subs.map((s): FailedPayment => ({ id: s.id, kind: "subscription", status: s.status, customer: s.customer_id ?? null, amountMinor: null, currency: s.currency_code, at: s.updated_at ?? null })),
    ];
  }

  async refunds(): Promise<Refund[]> {
    const rows = await this.listAll("/adjustments", { action: "refund" });
    return rows.map((a) => ({ id: a.id, orderOrTransactionId: a.transaction_id, status: a.status, amountMinor: Number(a.totals?.total ?? 0), currency: a.currency_code, at: a.created_at }));
  }

  async listDiscounts(): Promise<Discount[]> {
    const rows = await this.listAll("/discounts");
    return rows.map((d) => ({
      id: d.id, code: d.code ?? null, name: d.description, status: d.status,
      amountType: d.type === "percentage" ? "percent" : "fixed", amount: Number(d.amount), currency: d.currency_code ?? null,
    }));
  }

  planCreateDiscount(input: DiscountInput): WriteRequest {
    if (input.amountType === "fixed" && !input.currency) throw new Error("Paddle fixed discounts need a currency (for example AUD).");
    const body: Record<string, unknown> = {
      description: input.name, code: input.code, enabled_for_checkout: true,
      type: input.amountType === "percent" ? "percentage" : "flat", amount: String(input.amount),
    };
    if (input.amountType === "fixed") body.currency_code = input.currency;
    return { method: "POST", path: "/discounts", body };
  }

  planRefund(id: string, amountMinor?: number, reason = "Refund requested via merchantops-mcp"): WriteRequest {
    if (amountMinor != null) throw new Error("Partial Paddle refunds need per-item amounts; this tool only issues full refunds for Paddle.");
    return { method: "POST", path: "/adjustments", body: { action: "refund", type: "full", transaction_id: id, reason } };
  }

  async execute(req: WriteRequest): Promise<unknown> {
    return requestJson(this.fetchFn, `${this.base}${req.path}`, { method: req.method, headers: this.headers(), body: JSON.stringify(req.body) });
  }
}
