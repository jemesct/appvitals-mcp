import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildProviders, loadConfig, type Config } from "./config.js";
import type { FetchLike } from "./http.js";
import { summariseMrr } from "./mrr.js";
import type { Provider, ProviderName, WriteRequest } from "./types.js";

export const VERSION = "0.1.0";

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };
const ok = (data: unknown): Result => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const fail = (message: string): Result => ({ content: [{ type: "text", text: message }], isError: true });

const providerArg = z.enum(["lemonsqueezy", "paddle"]).describe("Which provider to query: lemonsqueezy or paddle");
const confirmArg = z.boolean().optional().describe("Set true to actually perform the write. Also needs MERCHANTOPS_ALLOW_WRITES=1. Otherwise this is a dry run.");

export interface StoreConnection {
  id: string;
  config: Config;
  fetchFn?: FetchLike;
}

type StoreArg = { store?: string };

/** Optional named stores keep the self-host API unchanged while hosted callers select a saved store. */
export function createServer(cfg: Config = loadConfig(), fetchFn?: FetchLike, stores?: StoreConnection[]): McpServer {
  const providers = stores ? {} : buildProviders(cfg, fetchFn);
  const connections = stores?.map((store) => ({ id: store.id, config: store.config, providers: buildProviders(store.config, store.fetchFn ?? fetchFn) }));
  const storeArg = z.string().optional().describe("Saved store id from providers_status. Required when more than one store uses this provider.");
  const server = new McpServer({ name: "merchantops-mcp", version: VERSION });

  const get = (name: ProviderName, store?: string): Provider => {
    const matches = connections?.filter((c) => (!store || c.id === store) && c.providers[name]);
    if (matches && matches.length !== 1) throw new Error("Choose a saved store id from providers_status for this provider.");
    const p = matches ? matches[0].providers[name] : providers[name];
    if (!p) throw new Error(`${name} is not configured. Set ${name === "paddle" ? "PADDLE_API_KEY" : "LEMONSQUEEZY_API_KEY"}, or run with --mock.`);
    return p;
  };
  const wrap = <A>(fn: (a: A) => Promise<unknown>) => async (a: A): Promise<Result> => {
    try { return ok(await fn(a)); } catch (e) { return fail(`Error: ${(e as Error).message}`); }
  };

  async function gatedWrite(p: Provider, action: string, plan: () => WriteRequest, confirm?: boolean) {
    const config = connections?.find((c) => c.providers[p.name] === p)?.config ?? cfg;
    const request = plan();
    if (!config.allowWrites || confirm !== true) {
      return {
        dryRun: true, provider: p.name, action, request,
        reason: !config.allowWrites
          ? "Writes are off. Set MERCHANTOPS_ALLOW_WRITES=1 and call again with confirm: true to run this."
          : "Dry run. Call again with confirm: true to run this.",
      };
    }
    const response = await p.execute(request);
    return { dryRun: false, provider: p.name, action, mock: config.mock, response };
  }

  server.registerTool("providers_status", {
    description: "Show which providers are configured, whether mock mode and writes are on, and what each provider supports.",
    inputSchema: {},
  }, wrap(async () => ({
    mock: cfg.mock, writesEnabled: cfg.allowWrites,
    ...(connections ? { stores: connections.map((c) => ({ id: c.id, providers: Object.keys(c.providers) })) } : {}),
    providers: Object.fromEntries((["lemonsqueezy", "paddle"] as const).map((name) => {
      const provider = providers[name] ?? connections?.find((c) => c.providers[name])?.providers[name];
      return [name, provider ? { configured: true, capabilities: provider.capabilities } : { configured: false }];
    })),
  })));

  server.registerTool("mrr_summary", {
    description: "Monthly recurring revenue and ARR per currency, plus subscription counts by status.",
    inputSchema: { provider: providerArg, store: storeArg, include_trials: z.boolean().optional().describe("Count trialling subscriptions towards MRR (default false)") },
  }, wrap(async ({ provider, include_trials, store }: { provider: ProviderName; include_trials?: boolean } & StoreArg) =>
    ({ provider, ...summariseMrr(await get(provider, store).listSubscriptions(), include_trials ?? false) })));

  server.registerTool("subscriptions_list", {
    description: "List subscriptions (normalised), optionally filtered by normalised status.",
    inputSchema: { provider: providerArg, store: storeArg, status: z.enum(["active", "trialing", "past_due", "paused", "cancelled", "expired", "other"]).optional() },
  }, wrap(async ({ provider, status, store }: { provider: ProviderName; status?: string } & StoreArg) => {
    const subs = await get(provider, store).listSubscriptions();
    return status ? subs.filter((s) => s.normalisedStatus === status) : subs;
  }));

  server.registerTool("churned_subscriptions", {
    description: "Cancelled or expired subscriptions in the last N days, with lost MRR per currency.",
    inputSchema: { provider: providerArg, store: storeArg, since_days: z.number().int().positive().max(3650).optional().describe("Look-back window in days (default 30)") },
  }, wrap(async ({ provider, since_days, store }: { provider: ProviderName; since_days?: number } & StoreArg) => {
    const days = since_days ?? 30;
    const cutoff = Date.now() - days * 86400000;
    const subs = await get(provider, store).listSubscriptions();
    const churned = subs.filter((s) => (s.normalisedStatus === "cancelled" || s.normalisedStatus === "expired") &&
      Date.parse(s.cancelledAt ?? s.endsAt ?? s.createdAt) >= cutoff);
    const lost = summariseMrr(churned.map((s) => ({ ...s, normalisedStatus: "active" as const })));
    return { provider, sinceDays: days, count: churned.length, lostMrrByCurrency: lost.byCurrency, subscriptions: churned };
  }));

  server.registerTool("failed_payments", {
    description: "Failed or overdue payments: past due subscriptions and failed orders or transactions.",
    inputSchema: { provider: providerArg, store: storeArg },
  }, wrap(async ({ provider, store }: { provider: ProviderName } & StoreArg) => get(provider, store).failedPayments()));

  server.registerTool("refunds_list", {
    description: "Refunds issued (Lemon Squeezy refunded orders, Paddle refund adjustments).",
    inputSchema: { provider: providerArg, store: storeArg },
  }, wrap(async ({ provider, store }: { provider: ProviderName } & StoreArg) => get(provider, store).refunds()));

  server.registerTool("refund_issue", {
    description: "WRITE. Refund a Lemon Squeezy order (full or partial) or a Paddle transaction (full only). Dry run unless writes are on and confirm is true.",
    inputSchema: {
      provider: providerArg, store: storeArg,
      id: z.string().min(1).describe("Lemon Squeezy order id, or Paddle transaction id (txn_...)"),
      amount_minor: z.number().int().positive().optional().describe("Lemon Squeezy only: partial amount in cents. Omit for a full refund."),
      reason: z.string().optional().describe("Paddle only: reason shown in the dashboard"),
      confirm: confirmArg,
    },
  }, wrap(async (a: { provider: ProviderName; id: string; amount_minor?: number; reason?: string; confirm?: boolean } & StoreArg) => {
    const p = get(a.provider, a.store);
    return gatedWrite(p, "refund_issue", () => p.planRefund(a.id, a.amount_minor, a.reason), a.confirm);
  }));

  server.registerTool("license_keys_list", {
    description: "List license keys (Lemon Squeezy only; Paddle Billing has no native license keys).",
    inputSchema: { provider: providerArg, store: storeArg },
  }, wrap(async ({ provider, store }: { provider: ProviderName } & StoreArg) => {
    const p = get(provider, store);
    if (!p.listLicenseKeys) throw new Error(String(p.capabilities.licenseKeysList));
    return p.listLicenseKeys();
  }));

  server.registerTool("license_key_issue", {
    description: "Explains license key issuing. Neither API can mint a key on demand: Lemon Squeezy creates keys on purchase, and Paddle Billing has no license keys.",
    inputSchema: { provider: providerArg, store: storeArg },
  }, async ({ provider }: { provider: ProviderName } & StoreArg) => fail(provider === "lemonsqueezy"
    ? "Not supported: the Lemon Squeezy API has no endpoint to create a license key. Keys are generated when an order for a licensed product is placed. To give someone a key, create a 100% discount or a free order in the dashboard, then use license_keys_list."
    : "Not supported: Paddle Billing has no native license keys. Issue keys from your own fulfilment webhook or a licensing service."));

  server.registerTool("license_key_revoke", {
    description: "WRITE. Disable a Lemon Squeezy license key. Dry run unless writes are on and confirm is true.",
    inputSchema: { provider: providerArg, store: storeArg, id: z.string().min(1).describe("License key id (not the key itself)"), confirm: confirmArg },
  }, wrap(async (a: { provider: ProviderName; id: string; confirm?: boolean } & StoreArg) => {
    const p = get(a.provider, a.store);
    if (!p.planRevokeLicenseKey) throw new Error(String(p.capabilities.licenseKeyRevoke));
    return gatedWrite(p, "license_key_revoke", () => p.planRevokeLicenseKey!(a.id), a.confirm);
  }));

  server.registerTool("discounts_list", {
    description: "List discount codes.",
    inputSchema: { provider: providerArg, store: storeArg },
  }, wrap(async ({ provider, store }: { provider: ProviderName } & StoreArg) => get(provider, store).listDiscounts()));

  server.registerTool("discount_create", {
    description: "WRITE. Create a discount code. Dry run unless writes are on and confirm is true.",
    inputSchema: {
      provider: providerArg, store: storeArg,
      name: z.string().min(1).describe("Internal name or description"),
      code: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/).describe("Customer-facing code, 3 to 32 letters, digits, _ or -"),
      amount_type: z.enum(["percent", "fixed"]),
      amount: z.number().int().positive().describe("Percent (1 to 100) or fixed amount in cents"),
      currency: z.string().length(3).optional().describe("Paddle fixed discounts only, for example AUD"),
      confirm: confirmArg,
    },
  }, wrap(async (a: { provider: ProviderName; name: string; code: string; amount_type: "percent" | "fixed"; amount: number; currency?: string; confirm?: boolean } & StoreArg) => {
    if (a.amount_type === "percent" && a.amount > 100) throw new Error("A percent discount can't be over 100.");
    const p = get(a.provider, a.store);
    return gatedWrite(p, "discount_create", () => p.planCreateDiscount({ name: a.name, code: a.code, amountType: a.amount_type, amount: a.amount, currency: a.currency }), a.confirm);
  }));

  return server;
}
