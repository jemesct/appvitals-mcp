// Lemon Squeezy API v1: https://docs.lemonsqueezy.com/api
// Base https://api.lemonsqueezy.com/v1, Bearer API key, JSON:API media type,
// pagination via page[number]/page[size] (max 100) and links.next.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { requestJson, type FetchLike } from "../http.js";
import type { Discount, DiscountInput, FailedPayment, Interval, LicenseKey, Provider, Refund, Subscription, WriteRequest } from "../types.js";

export const LS_BASE = "https://api.lemonsqueezy.com";
const JSONAPI = "application/vnd.api+json";

const STATUS: Record<string, Subscription["normalisedStatus"]> = {
  active: "active", on_trial: "trialing", past_due: "past_due", unpaid: "past_due",
  paused: "paused", cancelled: "cancelled", expired: "expired",
};

export class LemonSqueezyProvider implements Provider {
  name = "lemonsqueezy" as const;
  capabilities = {
    subscriptions: true, mrr: true, churn: true, failedPayments: "subscriptions in past_due or unpaid, plus orders with status failed",
    refundsList: true, refundIssue: "POST /v1/orders/:id/refund (full or partial)",
    licenseKeysList: true, licenseKeyRevoke: "PATCH /v1/license-keys/:id with disabled: true",
    licenseKeyIssue: "not available: Lemon Squeezy generates keys on purchase; the API has no create endpoint",
    discountsList: true, discountCreate: true,
  };
  constructor(private apiKey: string, private fetchFn: FetchLike = fetch, private storeId?: string) {}

  private headers(): Record<string, string> {
    return { Accept: JSONAPI, "Content-Type": JSONAPI, Authorization: `Bearer ${this.apiKey}` };
  }

  private async listAll(path: string, params: Record<string, string> = {}): Promise<any[]> {
    const q = new URLSearchParams({ "page[size]": "100", ...params });
    if (this.storeId && !path.startsWith("/v1/prices")) q.set("filter[store_id]", this.storeId);
    let url: string | null = `${LS_BASE}${path}?${q}`;
    const out: any[] = [];
    for (let i = 0; url && i < 100; i++) {
      const json: any = await requestJson(this.fetchFn, url, { headers: this.headers() });
      out.push(...(json.data ?? []));
      url = json.links?.next ?? null;
    }
    return out;
  }

  async listSubscriptions(): Promise<Subscription[]> {
    const rows = await this.listAll("/v1/subscriptions");
    const priceCache = new Map<string, any>();
    const subs: Subscription[] = [];
    for (const r of rows) {
      const a = r.attributes;
      const item = a.first_subscription_item ?? {};
      let price: any = null;
      if (item.price_id != null) {
        const pid = String(item.price_id);
        if (!priceCache.has(pid)) {
          const j = await requestJson(this.fetchFn, `${LS_BASE}/v1/prices/${pid}`, { headers: this.headers() });
          priceCache.set(pid, j.data?.attributes ?? null);
        }
        price = priceCache.get(pid);
      }
      subs.push({
        id: String(r.id), provider: "lemonsqueezy", status: a.status,
        normalisedStatus: STATUS[a.status] ?? "other",
        customer: a.user_email ?? null,
        product: [a.product_name, a.variant_name].filter(Boolean).join(" / ") || null,
        amountMinor: (price?.unit_price ?? 0) * (item.quantity ?? 1),
        currency: price?.currency ?? a.currency ?? "USD",
        interval: (price?.renewal_interval_unit ?? "month") as Interval,
        intervalCount: price?.renewal_interval_quantity ?? 1,
        createdAt: a.created_at, cancelledAt: a.cancelled ? a.updated_at : null, endsAt: a.ends_at ?? null,
      });
    }
    return subs;
  }

  async failedPayments(): Promise<FailedPayment[]> {
    const subs = (await this.listAll("/v1/subscriptions")).filter((r) => ["past_due", "unpaid"].includes(r.attributes.status));
    const orders = (await this.listAll("/v1/orders")).filter((r) => r.attributes.status === "failed");
    return [
      ...subs.map((r): FailedPayment => ({ id: String(r.id), kind: "subscription", status: r.attributes.status, customer: r.attributes.user_email ?? null, amountMinor: null, currency: null, at: r.attributes.updated_at ?? null })),
      ...orders.map((r): FailedPayment => ({ id: String(r.id), kind: "order", status: "failed", customer: r.attributes.user_email ?? null, amountMinor: r.attributes.total, currency: r.attributes.currency, at: r.attributes.created_at })),
    ];
  }

  async refunds(): Promise<Refund[]> {
    const orders = await this.listAll("/v1/orders");
    return orders.filter((r) => r.attributes.refunded || ["refunded", "partial_refund"].includes(r.attributes.status)).map((r) => ({
      id: String(r.id), orderOrTransactionId: String(r.id), status: r.attributes.status,
      amountMinor: r.attributes.refunded_amount ?? 0, currency: r.attributes.currency, at: r.attributes.refunded_at ?? null,
    }));
  }

  async listLicenseKeys(): Promise<LicenseKey[]> {
    const rows = await this.listAll("/v1/license-keys");
    return rows.map((r) => ({
      id: String(r.id), keyShort: r.attributes.key_short, status: r.attributes.status,
      customer: r.attributes.user_email ?? null, activationUsage: r.attributes.activation_usage ?? 0,
      activationLimit: r.attributes.activation_limit ?? null, expiresAt: r.attributes.expires_at ?? null,
    }));
  }

  async listDiscounts(): Promise<Discount[]> {
    const rows = await this.listAll("/v1/discounts");
    return rows.map((r) => ({
      id: String(r.id), code: r.attributes.code, name: r.attributes.name, status: r.attributes.status,
      amountType: r.attributes.amount_type === "percent" ? "percent" : "fixed", amount: r.attributes.amount, currency: null,
    }));
  }

  planRevokeLicenseKey(id: string): WriteRequest {
    return { method: "PATCH", path: `/v1/license-keys/${encodeURIComponent(id)}`, body: { data: { type: "license-keys", id: String(id), attributes: { disabled: true } } } };
  }

  planCreateDiscount(input: DiscountInput): WriteRequest {
    if (!this.storeId) throw new Error("LEMONSQUEEZY_STORE_ID is required to create a discount.");
    return {
      method: "POST", path: "/v1/discounts",
      body: { data: { type: "discounts", attributes: { name: input.name, code: input.code, amount: input.amount, amount_type: input.amountType },
        relationships: { store: { data: { type: "stores", id: this.storeId } } } } },
    };
  }

  planRefund(id: string, amountMinor?: number): WriteRequest {
    const attributes: Record<string, number> = {};
    if (amountMinor != null) attributes.amount = amountMinor;
    return { method: "POST", path: `/v1/orders/${encodeURIComponent(id)}/refund`, body: { data: { type: "orders", id: String(id), attributes } } };
  }

  async execute(req: WriteRequest): Promise<unknown> {
    return requestJson(this.fetchFn, `${LS_BASE}${req.path}`, { method: req.method, headers: this.headers(), body: JSON.stringify(req.body) });
  }
}
