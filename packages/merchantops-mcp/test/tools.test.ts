import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { connect } from "./helpers.js";
import { loadConfig, buildProviders } from "../src/config.js";

beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-05T01:00:00Z")); });
afterAll(() => vi.useRealTimers());

describe("tool list and provider switch", () => {
  it("registers every tool", async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["churned_subscriptions", "discount_create", "discounts_list", "failed_payments", "license_key_issue", "license_key_revoke", "license_keys_list", "mrr_summary", "providers_status", "refund_issue", "refunds_list", "subscriptions_list"]);
  });
  it("routes to the right API host per provider", async () => {
    const { call, calls } = await connect();
    await call("discounts_list", { provider: "lemonsqueezy" });
    expect(calls.every((c) => c.url.startsWith("https://api.lemonsqueezy.com/v1/"))).toBe(true);
    calls.length = 0;
    await call("discounts_list", { provider: "paddle" });
    expect(calls.every((c) => c.url.startsWith("https://sandbox-api.paddle.com/"))).toBe(true);
  });
  it("uses Paddle production host when PADDLE_ENV=production", async () => {
    const { call, calls } = await connect({ PADDLE_ENV: "production" });
    await call("discounts_list", { provider: "paddle" });
    expect(calls[0].url.startsWith("https://api.paddle.com/")).toBe(true);
  });
  it("rejects an unknown provider", async () => {
    const { call } = await connect();
    expect((await call("mrr_summary", { provider: "stripe" })).isError).toBe(true);
  });
  it("reports an unconfigured provider cleanly", async () => {
    const providers = buildProviders(loadConfig({ LEMONSQUEEZY_API_KEY: "k" }, []));
    expect(Object.keys(providers)).toEqual(["lemonsqueezy"]);
  });
  it("providers_status shows capabilities and flags", async () => {
    const { call } = await connect();
    const { data } = await call("providers_status");
    expect(data.mock).toBe(true);
    expect(data.writesEnabled).toBe(false);
    expect(data.providers.paddle.capabilities.licenseKeysList).toMatch(/not available/);
    expect(data.providers.lemonsqueezy.capabilities.licenseKeysList).toBe(true);
  });
  it("--mock flag turns on mock mode", () => {
    expect(loadConfig({}, ["node", "x", "--mock"]).mock).toBe(true);
    expect(loadConfig({ MOCK: "1" }, []).mock).toBe(true);
    expect(loadConfig({}, []).mock).toBe(false);
  });
});

describe("read tools in mock mode", () => {
  it("mrr_summary Lemon Squeezy follows pagination and prices", async () => {
    const { call, calls } = await connect();
    const { data } = await call("mrr_summary", { provider: "lemonsqueezy" });
    expect(data.byCurrency.AUD).toMatchObject({ mrrMinor: 9100, mrr: "91.00", arr: "1092.00", subscriptions: 3 });
    expect(calls.filter((c) => c.url.includes("/v1/subscriptions")).length).toBe(2);
    expect(calls.filter((c) => c.url.includes("/v1/prices/")).length).toBe(2);
    const t = await call("mrr_summary", { provider: "lemonsqueezy", include_trials: true });
    expect(t.data.byCurrency.AUD.mrrMinor).toBe(11000);
  });
  it("mrr_summary Paddle sums quantities and handles quarterly and yearly", async () => {
    const { data } = (await (await connect()).call("mrr_summary", { provider: "paddle" }));
    expect(data.byCurrency.USD).toMatchObject({ mrrMinor: 10717, subscriptions: 3 });
  });
  it("subscriptions_list filters by status", async () => {
    const { call } = await connect();
    expect((await call("subscriptions_list", { provider: "lemonsqueezy" })).data).toHaveLength(6);
    const t = await call("subscriptions_list", { provider: "paddle", status: "trialing" });
    expect(t.data.map((s: { id: string }) => s.id)).toEqual(["sub_01cccccccccccccccccccccccc"]);
  });
  it("churned_subscriptions respects the window", async () => {
    const { call } = await connect();
    const ls = await call("churned_subscriptions", { provider: "lemonsqueezy" });
    expect(ls.data.count).toBe(1);
    expect(ls.data.lostMrrByCurrency.AUD.mrrMinor).toBe(1900);
    expect((await call("churned_subscriptions", { provider: "lemonsqueezy", since_days: 90 })).data.count).toBe(2);
    const pd = await call("churned_subscriptions", { provider: "paddle" });
    expect(pd.data.count).toBe(1);
    expect(pd.data.lostMrrByCurrency.USD.mrrMinor).toBe(2900);
  });
  it("failed_payments for both providers", async () => {
    const { call } = await connect();
    const ls = (await call("failed_payments", { provider: "lemonsqueezy" })).data;
    expect(ls.map((f: { kind: string; id: string }) => `${f.kind}:${f.id}`)).toEqual(["subscription:1004", "order:2004"]);
    const pd = (await call("failed_payments", { provider: "paddle" })).data;
    expect(pd[0]).toMatchObject({ kind: "transaction", amountMinor: 7500, currency: "USD" });
    expect(pd).toHaveLength(2);
  });
  it("refunds_list for both providers", async () => {
    const { call } = await connect();
    const ls = (await call("refunds_list", { provider: "lemonsqueezy" })).data;
    expect(ls.map((r: { amountMinor: number }) => r.amountMinor)).toEqual([1900, 5000]);
    const pd = (await call("refunds_list", { provider: "paddle" })).data;
    expect(pd.map((r: { status: string }) => r.status)).toEqual(["approved", "pending_approval"]);
  });
  it("license_keys_list works for Lemon Squeezy and explains Paddle", async () => {
    const { call } = await connect();
    const ls = await call("license_keys_list", { provider: "lemonsqueezy" });
    expect(ls.data).toHaveLength(3);
    expect(ls.data[0]).toMatchObject({ keyShort: "XXXX-7A1C", activationLimit: 3 });
    const pd = await call("license_keys_list", { provider: "paddle" });
    expect(pd.isError).toBe(true);
    expect(pd.text).toMatch(/no native license keys/);
  });
  it("license_key_issue is unsupported on both, with a clear reason", async () => {
    const { call } = await connect();
    const ls = await call("license_key_issue", { provider: "lemonsqueezy" });
    expect(ls.isError).toBe(true);
    expect(ls.text).toMatch(/no endpoint to create a license key/);
    expect((await call("license_key_issue", { provider: "paddle" })).text).toMatch(/Paddle Billing has no native license keys/);
  });
  it("discounts_list maps types", async () => {
    const { call } = await connect();
    expect((await call("discounts_list", { provider: "lemonsqueezy" })).data[0]).toMatchObject({ code: "LAUNCH20", amountType: "percent", amount: 20 });
    expect((await call("discounts_list", { provider: "paddle" })).data[1]).toMatchObject({ code: "TENOFF", amountType: "fixed", amount: 1000, currency: "USD" });
  });
});

describe("write gating", () => {
  const writes = (calls: { method: string; body?: unknown }[]) => calls.filter((c) => c.method !== "GET");

  it("is a dry run when writes are off, even with confirm", async () => {
    const { call, calls } = await connect();
    const r = await call("license_key_revoke", { provider: "lemonsqueezy", id: "3001", confirm: true });
    expect(r.data.dryRun).toBe(true);
    expect(r.data.reason).toMatch(/MERCHANTOPS_ALLOW_WRITES=1/);
    expect(r.data.request).toMatchObject({ method: "PATCH", path: "/v1/license-keys/3001", body: { data: { attributes: { disabled: true } } } });
    expect(writes(calls)).toHaveLength(0);
  });
  it("is a dry run when writes are on but confirm is missing", async () => {
    const { call, calls } = await connect({ MERCHANTOPS_ALLOW_WRITES: "1" });
    const r = await call("discount_create", { provider: "paddle", name: "Spring", code: "SPRING10", amount_type: "percent", amount: 10 });
    expect(r.data.dryRun).toBe(true);
    expect(r.data.reason).toMatch(/confirm: true/);
    expect(writes(calls)).toHaveLength(0);
  });
  it("performs the write only with both the flag and confirm", async () => {
    const { call, calls } = await connect({ MERCHANTOPS_ALLOW_WRITES: "1" });
    const r = await call("license_key_revoke", { provider: "lemonsqueezy", id: "3001", confirm: true });
    expect(r.data.dryRun).toBe(false);
    expect(writes(calls)).toEqual([expect.objectContaining({ method: "PATCH", url: "https://api.lemonsqueezy.com/v1/license-keys/3001" })]);
  });
  it("Lemon Squeezy discount body includes the store relationship", async () => {
    const { call, calls } = await connect({ MERCHANTOPS_ALLOW_WRITES: "1" });
    await call("discount_create", { provider: "lemonsqueezy", name: "Spring", code: "SPRING10", amount_type: "percent", amount: 10, confirm: true });
    expect(writes(calls)[0].body).toMatchObject({ data: { type: "discounts", attributes: { code: "SPRING10", amount_type: "percent" }, relationships: { store: { data: { id: "1" } } } } });
  });
  it("Paddle fixed discount needs a currency and sends a flat type", async () => {
    const { call } = await connect();
    expect((await call("discount_create", { provider: "paddle", name: "x", code: "FLAT5", amount_type: "fixed", amount: 500 })).isError).toBe(true);
    const r = await call("discount_create", { provider: "paddle", name: "x", code: "FLAT5", amount_type: "fixed", amount: 500, currency: "AUD" });
    expect(r.data.request.body).toMatchObject({ type: "flat", amount: "500", currency_code: "AUD" });
  });
  it("rejects a percent over 100 and a bad code", async () => {
    const { call } = await connect();
    expect((await call("discount_create", { provider: "paddle", name: "x", code: "BIG", amount_type: "percent", amount: 150 })).isError).toBe(true);
    expect((await call("discount_create", { provider: "paddle", name: "x", code: "no spaces", amount_type: "percent", amount: 5 })).isError).toBe(true);
  });
  it("refund_issue plans the right request per provider", async () => {
    const { call } = await connect();
    const ls = await call("refund_issue", { provider: "lemonsqueezy", id: "2001", amount_minor: 500 });
    expect(ls.data.request).toMatchObject({ method: "POST", path: "/v1/orders/2001/refund", body: { data: { attributes: { amount: 500 } } } });
    const pd = await call("refund_issue", { provider: "paddle", id: "txn_01x", reason: "Duplicate" });
    expect(pd.data.request).toMatchObject({ path: "/adjustments", body: { action: "refund", type: "full", transaction_id: "txn_01x", reason: "Duplicate" } });
    expect((await call("refund_issue", { provider: "paddle", id: "txn_01x", amount_minor: 5 })).isError).toBe(true);
  });
  it("refund_issue writes with flag and confirm", async () => {
    const { call, calls } = await connect({ MERCHANTOPS_ALLOW_WRITES: "1" });
    const r = await call("refund_issue", { provider: "paddle", id: "txn_01x", confirm: true });
    expect(r.data.dryRun).toBe(false);
    expect(writes(calls)[0]).toMatchObject({ method: "POST", url: "https://sandbox-api.paddle.com/adjustments" });
  });
  it("license_key_revoke is unsupported on Paddle", async () => {
    const { call } = await connect({ MERCHANTOPS_ALLOW_WRITES: "1" });
    expect((await call("license_key_revoke", { provider: "paddle", id: "x", confirm: true })).isError).toBe(true);
  });
});

describe("HTTP errors", () => {
  it("surfaces API errors as tool errors without leaking the key", async () => {
    const { createServer } = await import("../src/server.js");
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");
    const server = createServer(loadConfig({ PADDLE_API_KEY: "pdl_secret" }, []), async () => new Response('{"error":{"code":"forbidden"}}', { status: 403 }));
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "t", version: "0" });
    await Promise.all([server.connect(a), client.connect(b)]);
    const r = (await client.callTool({ name: "discounts_list", arguments: { provider: "paddle" } })) as { isError: boolean; content: { text: string }[] };
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/HTTP 403/);
    expect(r.content[0].text).not.toMatch(/pdl_secret/);
  });
});
