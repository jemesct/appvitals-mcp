import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { authenticateApiKey } from "../lib/auth";
import { MemoryEmailSender } from "../lib/email";
import { generateApiKey } from "../lib/keys";
import { handleCheckoutRequest, handleLemonEvent } from "../lib/lemonsqueezy";
import { merchantStoresFromForm, readStoredMerchantCredentials, saveCustomerMerchantCredentials, type MerchantStore } from "../lib/merchant-connect";
import { MemoryRepository } from "../lib/memory-repo";
import { openHostedMerchantOps, scopedMerchantFetch } from "../lib/merchantops-host";
import type { PlanId } from "../lib/products";
import { POST } from "../app/api/mcp/merchantops/route";

let routeRepo: MemoryRepository;
vi.mock("../lib/runtime", () => ({ getRepo: async () => routeRepo }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const now = new Date("2026-11-05T00:00:00Z");
const ls: MerchantStore = { id: "store-1", provider: "lemonsqueezy", apiKey: "lemon-customer-secret", storeId: "42" };
const pd: MerchantStore = { id: "store-2", provider: "paddle", apiKey: "paddle-customer-secret", environment: "sandbox" };
const keyEnv = () => ({ NODE_ENV: "test" as const, MERCHANTOPS_CREDENTIALS_KEY: randomBytes(32).toString("base64") });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const accessFetch: typeof fetch = async (url) => {
  if (String(url).includes("lemonsqueezy")) return json({ data: { id: new URL(String(url)).pathname.split("/").pop() } });
  return json({ data: [] });
};

async function account(repo = new MemoryRepository(), plan: PlanId = "solo", email = "merchant@example.com", productId = "merchantops") {
  const customer = await repo.upsertCustomerByEmail(email);
  const key = generateApiKey();
  await repo.insertApiKey({ customerId: customer.id, keyHash: key.keyHash, keyPrefix: key.keyPrefix });
  await repo.upsertSubscription({ customerId: customer.id, productId, plan, status: "active", trialEndsAt: null, lsSubscriptionId: `ls-${customer.id}` });
  return { repo, customer, key };
}
async function connect(server: NonNullable<ReturnType<typeof openHostedMerchantOps>["server"]>) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "merchant-test", version: "1" });
  await server.connect(b);
  await client.connect(a);
  return client;
}
async function save(a: Awaited<ReturnType<typeof account>>, env: NodeJS.ProcessEnv, stores: unknown, fetchImpl = accessFetch) {
  return saveCustomerMerchantCredentials({ repo: a.repo, token: a.key.token, now, env, stores, fetchImpl });
}

describe("MerchantOps encrypted customer keys and plans", () => {
  it("encrypts the whole set and returns counts only; wrong keys, tampering, and swapped accounts fail closed", async () => {
    const a = await account();
    const env = keyEnv();
    const saved = await save(a, env, [ls]);
    expect(saved).toEqual({ ok: true, storeCount: 1 });
    const row = (await a.repo.getMerchantCredentials(a.customer.id))!;
    expect(JSON.stringify(row)).not.toContain(ls.apiKey);
    expect(readStoredMerchantCredentials(row, a.customer.id, env)).toEqual([ls]);
    expect(() => readStoredMerchantCredentials(row, "another-customer", env)).toThrow(/Could not read/);
    expect(() => readStoredMerchantCredentials({ ...row, customerId: "another-customer" }, "another-customer", env)).toThrow(/Could not read/);
    expect(() => readStoredMerchantCredentials(row, a.customer.id, keyEnv())).toThrow(/Could not read/);
    expect(() => readStoredMerchantCredentials({ ...row, authTag: randomBytes(16).toString("base64") }, a.customer.id, env)).toThrow(/Could not read/);
    await save(a, env, [pd]);
    expect(a.repo.merchantCredentials).toHaveLength(1);
    expect(readStoredMerchantCredentials((await a.repo.getMerchantCredentials(a.customer.id))!, a.customer.id, env)).toEqual([pd]);
  });

  it("rejects missing/invalid encryption config, invalid keys and failed provider checks without saving or echoing secrets", async () => {
    const a = await account();
    const env = keyEnv();
    await save(a, env, [ls]);
    const before = JSON.stringify(a.repo.merchantCredentials);
    for (const badEnv of [{ NODE_ENV: "test" as const }, { NODE_ENV: "test" as const, MERCHANTOPS_CREDENTIALS_KEY: "short" }]) {
      expect(await save(a, badEnv, [ls])).toMatchObject({ ok: false, status: 503 });
    }
    expect(await save(a, env, [{ ...ls, apiKey: "" }])).toMatchObject({ ok: false, status: 400 });
    expect(await save(a, env, [{ ...ls, storeId: "not-numeric" }])).toMatchObject({ ok: false, status: 400 });
    const rejected = await save(a, env, [ls], async () => json({ error: ls.apiKey }, 401));
    expect(rejected).toMatchObject({ ok: false, status: 400 });
    expect(JSON.stringify(rejected)).not.toContain(ls.apiKey);
    expect(await save(a, env, [ls], async () => { throw new Error(ls.apiKey); })).toMatchObject({ ok: false });
    expect(JSON.stringify(a.repo.merchantCredentials)).toBe(before);
  });

  it("allows one key on Solo, multiple keys and both providers on Team, and blocks stale Team credentials after downgrade", async () => {
    const a = await account();
    const env = keyEnv();
    expect(await save(a, env, [ls, pd])).toMatchObject({ ok: false, status: 403 });
    expect(await save(a, env, [ls, { ...ls, id: "store-2", storeId: "43" }])).toMatchObject({ ok: false, status: 403 });
    const sub = (await a.repo.findSubscription(a.customer.id, "merchantops"))!;
    sub.plan = "unlimited";
    expect(await save(a, env, [ls, pd, { ...ls, id: "store-3", storeId: "43" }])).toEqual({ ok: true, storeCount: 3 });
    const record = await a.repo.getMerchantCredentials(a.customer.id);
    const opened = openHostedMerchantOps({ env, customerId: a.customer.id, plan: "solo", record });
    expect(opened).toMatchObject({ ok: false, status: 403 });
    await save(a, env, [ls]);
    expect(openHostedMerchantOps({ env, customerId: a.customer.id, plan: "solo", record: await a.repo.getMerchantCredentials(a.customer.id) }).ok).toBe(true);
  });

  it.each(["cancelled", "expired", "past_due", "trialing"] as const)("rejects %s subscriptions on save", async (status) => {
    const a = await account();
    Object.assign((await a.repo.findSubscription(a.customer.id, "merchantops"))!, { status, trialEndsAt: "2026-11-01T00:00:00Z" });
    expect(await save(a, keyEnv(), [ls])).toMatchObject({ ok: false, status: 403 });
    expect(a.repo.merchantCredentials).toHaveLength(0);
  });

  it("requires MerchantOps entitlement and never falls back to environment billing, Paddle, or mock keys", async () => {
    const a = await account(undefined, "solo", undefined, "shipvitals");
    expect(await save(a, keyEnv(), [ls])).toMatchObject({ ok: false, status: 403 });
    expect(await saveCustomerMerchantCredentials({ repo: a.repo, token: "av_unknown", now, env: keyEnv(), stores: [ls] })).toMatchObject({ ok: false, status: 401 });
    expect(openHostedMerchantOps({ env: { NODE_ENV: "test", LEMONSQUEEZY_API_KEY: "billing-key", PADDLE_API_KEY: "shared-paddle", MERCHANTOPS_MOCK: "1" }, customerId: a.customer.id, plan: "unlimited", record: null })).toMatchObject({ ok: false, status: 403 });
  });

  it("parses repeated form rows without mixing providers, keys, store ids, or environments", () => {
    const form = new FormData();
    for (const store of [ls, pd]) {
      form.append("provider", store.provider);
      form.append("storeKey", store.apiKey);
      form.append("storeId", store.provider === "lemonsqueezy" ? store.storeId : "");
      form.append("environment", store.provider === "paddle" ? store.environment : "production");
    }
    expect(merchantStoresFromForm(form)).toEqual([
      { ...ls, environment: "production" }, { ...pd, storeId: "" },
    ]);
  });
});

describe("MerchantOps tools reuse and request isolation", () => {
  it("routes multiple stores to their own key and environment, requires store selection, and leaves writes as dry runs", async () => {
    const a = await account(undefined, "unlimited");
    const env = { ...keyEnv(), LEMONSQUEEZY_API_KEY: "billing-secret", PADDLE_ENV: "production" };
    await save(a, env, [ls, pd, { ...ls, id: "store-3", apiKey: "second-lemon-key", storeId: "43" }]);
    const calls: Array<{ url: string; key: string | null; method: string }> = [];
    const opened = openHostedMerchantOps({ env, customerId: a.customer.id, plan: "unlimited", record: await a.repo.getMerchantCredentials(a.customer.id), fetchImpl: async (url, init) => {
      calls.push({ url: String(url), key: new Headers(init?.headers).get("Authorization"), method: init?.method ?? "GET" });
      return json({ data: [] });
    } });
    if (!opened.ok) throw new Error(opened.message);
    const client = await connect(opened.server);
    try {
      expect((await client.listTools()).tools).toHaveLength(12);
      const status = await client.callTool({ name: "providers_status", arguments: {} });
      expect(JSON.stringify(status)).toContain("store-3");
      expect(JSON.stringify(status)).not.toContain(ls.apiKey);
      expect((await client.callTool({ name: "discounts_list", arguments: { provider: "lemonsqueezy" } })).isError).toBe(true);
      expect((await client.callTool({ name: "discounts_list", arguments: { provider: "lemonsqueezy", store: "unknown" } })).isError).toBe(true);
      expect(calls).toHaveLength(0);
      await client.callTool({ name: "discounts_list", arguments: { provider: "lemonsqueezy", store: "store-3" } });
      await client.callTool({ name: "discounts_list", arguments: { provider: "paddle" } });
      expect(calls[0].key).toBe("Bearer second-lemon-key");
      expect(new URL(calls[0].url).searchParams.get("filter[store_id]")).toBe("43");
      expect(calls[1].key).toBe(`Bearer ${pd.apiKey}`);
      expect(calls[1].url).toContain("https://sandbox-api.paddle.com/");
      const dry = await client.callTool({ name: "refund_issue", arguments: { provider: "lemonsqueezy", store: "store-1", id: "1", confirm: true } });
      expect(JSON.stringify(dry)).toContain('\\"dryRun\\": true');
      expect(calls).toHaveLength(2);
    } finally { await client.close(); await opened.server.close(); }
  });

  it("performs only confirmed writes on the saved store when hosted writes are enabled", async () => {
    const a = await account();
    const env = { ...keyEnv(), MERCHANTOPS_ALLOW_WRITES: "true" };
    await save(a, env, [ls]);
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    const opened = openHostedMerchantOps({ env, customerId: a.customer.id, plan: "solo", record: await a.repo.getMerchantCredentials(a.customer.id), fetchImpl: async (url, init) => {
      expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${ls.apiKey}`);
      calls.push({ method: init?.method ?? "GET", url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return json({ data: { id: "99", attributes: { store_id: ls.storeId } } });
    } });
    if (!opened.ok) throw new Error(opened.message);
    const client = await connect(opened.server);
    try {
      await client.callTool({ name: "license_key_revoke", arguments: { provider: "lemonsqueezy", id: "99" } });
      expect(calls).toHaveLength(0);
      const written = await client.callTool({ name: "license_key_revoke", arguments: { provider: "lemonsqueezy", id: "99", confirm: true } });
      expect(written.isError).not.toBe(true);
      expect(calls.map((call) => call.method)).toEqual(["GET", "PATCH"]);
      await client.callTool({ name: "discount_create", arguments: { provider: "lemonsqueezy", name: "Test", code: "TEST10", amount_type: "percent", amount: 10, confirm: true } });
      expect(calls[2]).toMatchObject({ method: "POST", body: { data: { relationships: { store: { data: { id: ls.storeId } } } } } });
    } finally { await client.close(); await opened.server.close(); }
  });

  it("blocks foreign pagination hosts, scopes every list page, and hides upstream errors containing keys", async () => {
    const calls: string[] = [];
    const fetcher = scopedMerchantFetch(ls, async (url) => { calls.push(String(url)); return json({ error: ls.apiKey }, 403); });
    await expect(fetcher("https://example.com/steal")).rejects.toThrow(/unexpected API URL/);
    expect(calls).toHaveLength(0);
    await expect(fetcher("https://api.lemonsqueezy.com/v1/subscriptions?page[number]=2")).rejects.toThrow(/HTTP 403/);
    expect(new URL(calls[0]).searchParams.get("filter[store_id]")).toBe(ls.storeId);
    try { await fetcher("https://api.lemonsqueezy.com/v1/orders"); } catch (err) { expect(String(err)).not.toContain(ls.apiKey); }
  });

  it.each(["orders/99/refund", "license-keys/99"])("checks store ownership before a direct write to %s", async (path) => {
    const calls: string[] = [];
    const fetcher = scopedMerchantFetch(ls, async (_url, init) => {
      calls.push(init?.method ?? "GET");
      return json({ data: { attributes: { store_id: "other-store" } } });
    });
    await expect(fetcher(`https://api.lemonsqueezy.com/v1/${path}`, { method: path.includes("refund") ? "POST" : "PATCH" })).rejects.toThrow(/does not belong/);
    expect(calls).toEqual(["GET"]);
  });

  it("serves actual HTTP MCP calls using only the bearer customer's keys and logs metadata only", async () => {
    const a = await account();
    const b = await account(a.repo, "solo", "second@example.com");
    const env = keyEnv();
    await save(a, env, [ls]);
    await save(b, env, [{ ...pd, id: "store-1" }]);
    routeRepo = a.repo;
    vi.stubEnv("MERCHANTOPS_CREDENTIALS_KEY", env.MERCHANTOPS_CREDENTIALS_KEY);
    vi.stubEnv("LEMONSQUEEZY_API_KEY", "hub-billing-secret");
    vi.stubEnv("MERCHANTOPS_ALLOW_WRITES", "");
    const used: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
      used.push(new Headers(init?.headers).get("Authorization")!);
      return json({ data: [] });
    });
    const request = (token: string, provider = "lemonsqueezy") => new Request("https://hostedmcp.dev/api/mcp/merchantops", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "discounts_list", arguments: { provider } } }),
    });
    const denied = await POST(request("av_unknown"));
    expect(denied.status).toBe(401);
    expect(used).toHaveLength(0);
    for (const [customer, provider] of [[a, "lemonsqueezy"], [b, "paddle"]] as const) {
      const response = await POST(request(customer.key.token, provider));
      expect(response.status).toBe(200);
      expect((await response.json()).result.isError).not.toBe(true);
    }
    expect(used).toEqual([`Bearer ${ls.apiKey}`, `Bearer ${pd.apiKey}`]);
    const events = await a.repo.listToolEvents({ productId: "merchantops" });
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.toolName === "discounts_list" && event.ok)).toBe(true);
    expect(new Set(events.map((event) => event.customerId))).toEqual(new Set([a.customer.id, b.customer.id]));
    expect(JSON.stringify(events)).not.toContain(ls.apiKey);
    expect(JSON.stringify(events)).not.toContain(a.key.token);
    (await a.repo.findSubscription(a.customer.id, "merchantops"))!.status = "cancelled";
    expect((await POST(request(a.key.token))).status).toBe(403);
    expect(used).toHaveLength(2);
  });
});

const billingEnv = {
  NODE_ENV: "test" as const,
  LEMONSQUEEZY_API_KEY: "hub-billing-secret", LEMONSQUEEZY_STORE_ID: "9",
  LEMONSQUEEZY_VARIANT_MERCHANTOPS_SOLO: "501", LEMONSQUEEZY_VARIANT_MERCHANTOPS_UNLIMITED: "502",
};
describe("MerchantOps checkout and subscription lifecycle", () => {
  it.each(["solo", "unlimited"] as const)("uses the %s variant and product metadata", async (plan) => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.data.relationships.variant.data.id).toBe(plan === "solo" ? "501" : "502");
      expect(body.data.attributes.checkout_data.custom).toEqual({ product_id: "merchantops", plan });
      return json({ data: { attributes: { url: "https://checkout.example/merchant" } } });
    }) as unknown as typeof fetch;
    expect(await handleCheckoutRequest({ requestUrl: `https://hostedmcp.dev/api/checkout?product=merchantops&plan=${plan}`, env: billingEnv, fetchImpl })).toEqual({ status: 302, redirect: "https://checkout.example/merchant" });
    const missing = await handleCheckoutRequest({ requestUrl: `https://hostedmcp.dev/api/checkout?product=merchantops&plan=${plan}`, env: { NODE_ENV: "test" }, fetchImpl });
    expect(missing).toMatchObject({ status: 503 });
    expect(JSON.stringify(missing)).toContain("LEMONSQUEEZY_VARIANT_MERCHANTOPS_SOLO");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("emails the hub key and connect URL, updates plans using variants, and cancels without custom metadata", async () => {
    const repo = new MemoryRepository();
    const email = new MemoryEmailSender();
    const send = (event: Parameters<typeof handleLemonEvent>[0]["event"]) => handleLemonEvent({ repo, email, env: billingEnv, now, event });
    const created = await send({ meta: { event_name: "subscription_created", custom_data: { product_id: "merchantops", plan: "solo" } }, data: { id: "sub_merchant", attributes: { user_email: "new@example.com", status: "on_trial", variant_id: 501 } } });
    if (!created.ok || !created.apiKey) throw new Error("Expected emailed key");
    expect(email.sent[0].text).toContain("https://hostedmcp.dev/merchantops/connect");
    expect(email.sent[0].text).toContain("https://hostedmcp.dev/api/mcp/merchantops");
    expect(email.sent[0].text).toContain(created.apiKey);
    expect((await repo.findSubscriptionByLsId("sub_merchant"))?.trialEndsAt).toBe("2026-11-12T00:00:00.000Z");
    expect((await authenticateApiKey(repo, created.apiKey, "shipvitals", now)).ok).toBe(false);
    await send({ meta: { event_name: "subscription_updated", custom_data: { plan: "solo" } }, data: { id: "sub_merchant", attributes: { user_email: "new@example.com", status: "active", variant_id: 502 } } });
    expect((await repo.findSubscriptionByLsId("sub_merchant"))?.plan).toBe("unlimited");
    await send({ meta: { event_name: "subscription_cancelled" }, data: { id: "sub_merchant", attributes: { user_email: "new@example.com" } } });
    expect((await repo.findSubscriptionByLsId("sub_merchant"))?.status).toBe("cancelled");
    expect((await authenticateApiKey(repo, created.apiKey, "merchantops", now)).ok).toBe(false);
    expect(repo.apiKeys).toHaveLength(1);
    expect(email.sent).toHaveLength(1);
  });

  it("reuses an existing hub key and sends MerchantOps setup instructions once", async () => {
    const a = await account(undefined, "solo", "existing@example.com", "shipvitals");
    const email = new MemoryEmailSender();
    const opts = { repo: a.repo, email, env: billingEnv, now, event: { meta: { event_name: "subscription_created" }, data: { id: "new-merchant-sub", attributes: { user_email: a.customer.email, status: "active", variant_id: 501 } } } };
    await handleLemonEvent(opts);
    await handleLemonEvent(opts);
    expect(a.repo.apiKeys).toHaveLength(1);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].text).toContain("original email");
    expect(email.sent[0].text).not.toContain(a.key.token);
  });
});
