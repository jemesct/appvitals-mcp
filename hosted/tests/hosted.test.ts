import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MockPlayClient } from "appvitals-mcp";
import { addCustomerApps } from "../lib/apps";
import { runAlerts } from "../lib/alerts";
import { authenticateApiKey, entitledPackages, subscriptionAllowsAccess } from "../lib/auth";
import { schemaSql } from "../db/schema";
import { MemoryEmailSender } from "../lib/email";
import { generateApiKey, sha256 } from "../lib/keys";
import { recordAuthenticatedToolCall, toolCallOk, toolNamesFromMcpBody } from "../lib/mcp-usage";
import { handleCheckoutRequest, handleLemonEvent, signLemonBody, verifyLemonSignature } from "../lib/lemonsqueezy";
import { MemoryRepository } from "../lib/memory-repo";
import { cronAuthorised } from "../lib/runtime";
import { snapshotPackage } from "../lib/snapshot";
import { detectSpike } from "../lib/spike";
import type { Subscription } from "../lib/repo";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function sub(partial: Partial<Subscription> = {}): Subscription {
  return {
    id: "sub-1",
    customerId: "cust-1",
    productId: "appvitals",
    plan: "solo",
    trialEndsAt: null,
    lsSubscriptionId: "ls-1",
    status: "active",
    alertFrequency: "daily",
    lastAlertAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    ...partial,
  };
}

describe("hosted", () => {
  it("keeps schema.sql and the embedded schema in sync", () => {
    const file = readFileSync(path.join(root, "hosted/db/schema.sql"), "utf8").trim();
    expect(schemaSql.trim()).toBe(file);
  });

  it("verifies Lemon Squeezy signatures and rejects a bad one", () => {
    const body = JSON.stringify({ meta: { event_name: "subscription_created" } });
    const signature = signLemonBody(body, "secret");
    expect(verifyLemonSignature(body, signature, "secret")).toBe(true);
    expect(verifyLemonSignature(body, signature.toUpperCase(), "secret")).toBe(true);
    expect(verifyLemonSignature(body, "deadbeef", "secret")).toBe(false);
    expect(verifyLemonSignature(body, null, "secret")).toBe(false);
  });

  it("issues one hub API key on subscription_created and updates status later", async () => {
    const repo = new MemoryRepository();
    const email = new MemoryEmailSender();
    const now = new Date("2026-11-04T00:00:00.000Z");
    const created = await handleLemonEvent({
      repo,
      email,
      now,
      env: { ...process.env, LEMONSQUEEZY_VARIANT_SOLO: "111", LEMONSQUEEZY_VARIANT_UNLIMITED: "222" },
      event: {
        meta: { event_name: "subscription_created", custom_data: { product_id: "appvitals", plan: "solo" } },
        data: {
          id: "sub_1",
          attributes: { status: "on_trial", user_email: "Dev@Example.com", trial_ends_at: "2026-11-11T00:00:00.000Z" },
        },
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.apiKey?.startsWith("av_")).toBe(true);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]?.text).toContain(created.apiKey);
    const stored = await repo.findApiKeyByHash(sha256(created.apiKey ?? ""));
    expect(stored?.customer.email).toBe("dev@example.com");
    expect(JSON.stringify(repo.apiKeys)).not.toContain(created.apiKey);

    const again = await handleLemonEvent({
      repo,
      email,
      now,
      env: process.env,
      event: {
        meta: { event_name: "subscription_updated", custom_data: { plan: "unlimited", product_id: "appvitals" } },
        data: { id: "sub_1", attributes: { status: "active", user_email: "dev@example.com" } },
      },
    });
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.apiKey).toBeUndefined();
    expect(email.sent).toHaveLength(1);
    const subscription = await repo.findSubscriptionByLsId("sub_1");
    expect(subscription?.plan).toBe("unlimited");
    expect(subscription?.status).toBe("active");

    await handleLemonEvent({
      repo,
      email,
      now,
      env: process.env,
      event: {
        meta: { event_name: "subscription_cancelled", custom_data: { plan: "unlimited" } },
        data: { id: "sub_1", attributes: { user_email: "dev@example.com", status: "cancelled" } },
      },
    });
    expect((await repo.findSubscriptionByLsId("sub_1"))?.status).toBe("cancelled");
  });

  it("authenticates API keys and enforces trial expiry and the solo app limit", async () => {
    const repo = new MemoryRepository();
    const customer = await repo.upsertCustomerByEmail("a@b.c");
    const key = generateApiKey();
    await repo.insertApiKey({ customerId: customer.id, keyHash: key.keyHash, keyPrefix: key.keyPrefix });
    await repo.upsertSubscription({
      customerId: customer.id,
      productId: "appvitals",
      plan: "solo",
      status: "trialing",
      trialEndsAt: "2026-11-01T00:00:00.000Z",
      lsSubscriptionId: "ls",
    });
    const expired = await authenticateApiKey(repo, key.token, "appvitals", new Date("2026-11-04T00:00:00.000Z"));
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.message).toContain("trial");

    const subscription = await repo.findSubscription(customer.id, "appvitals");
    if (!subscription) throw new Error("missing subscription");
    subscription.status = "active";
    subscription.trialEndsAt = null;
    const unknown = await authenticateApiKey(repo, "av_nope", "appvitals", new Date());
    expect(unknown.ok).toBe(false);

    const apps = [
      await repo.addApp({ customerId: customer.id, productId: "appvitals", packageName: "com.first" }),
      await repo.addApp({ customerId: customer.id, productId: "appvitals", packageName: "com.second" }),
    ];
    expect(entitledPackages(apps, "appvitals", "solo")).toEqual(["com.first"]);

    const allowed = await authenticateApiKey(repo, key.token, "appvitals", new Date("2026-11-04T00:00:00.000Z"));
    expect(allowed.ok).toBe(true);
    if (allowed.ok) expect(allowed.entitlement.packages).toEqual(["com.first"]);

    const second = await addCustomerApps({
      repo,
      token: key.token,
      productId: "appvitals",
      packageNames: ["com.third"],
      now: new Date("2026-11-04T00:00:00.000Z"),
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.status).toBe(403);

    expect(subscriptionAllowsAccess(sub({ status: "cancelled" }), new Date()).ok).toBe(false);
  });

  it("detects threshold breaches and 50% baseline spikes", () => {
    expect(detectSpike(0.02, [0.02], 0.0109).spike).toBe(true);
    expect(detectSpike(0.006, [0.002, 0.002], 0.0109).reason).toContain("50%");
    expect(detectSpike(0.006, [0.005, 0.005], 0.0109).spike).toBe(false);
    expect(detectSpike(null, [0.1], 0.0109).spike).toBe(false);
    expect(detectSpike(0.008, [0.001], 0.0047).spike).toBe(true);
  });

  it("dedupes review snapshots", async () => {
    const repo = new MemoryRepository();
    const client = new MockPlayClient();
    const now = new Date("2026-11-04T00:00:00.000Z");
    const first = await snapshotPackage(repo, client, "com.example.app", now);
    const second = await snapshotPackage(repo, client, "com.example.app", now);
    expect(first.insertedReviews).toBe(2);
    expect(second.insertedReviews).toBe(0);
    expect(await repo.countReviews("com.example.app")).toBe(2);
    const rows = await repo.listReviewSnapshots({ packageName: "com.example.app" });
    expect(rows).toHaveLength(2);
    expect(await repo.listVitals("com.example.app", "2026-01-01")).toHaveLength(1);
  });

  it("emails new 1-2 star reviews and vitals spikes, and respects weekly cadence", async () => {
    const repo = new MemoryRepository();
    const email = new MemoryEmailSender();
    const customer = await repo.upsertCustomerByEmail("alerts@example.com");
    const subscription = await repo.upsertSubscription({
      customerId: customer.id,
      productId: "appvitals",
      plan: "unlimited",
      status: "active",
      trialEndsAt: null,
      lsSubscriptionId: null,
      alertFrequency: "daily",
    });
    await repo.addApp({ customerId: customer.id, productId: "appvitals", packageName: "com.example.app" });
    await repo.upsertReview({
      packageName: "com.example.app",
      reviewId: "rev-low",
      stars: 1,
      text: "Broken",
      author: "Pat",
      lastModified: "2026-11-03T00:00:00.000Z",
      capturedAt: "2026-11-03T00:00:00.000Z",
    });
    await repo.upsertReview({
      packageName: "com.example.app",
      reviewId: "rev-high",
      stars: 5,
      text: "Nice",
      author: "Sam",
      lastModified: "2026-11-03T00:00:00.000Z",
      capturedAt: "2026-11-03T00:00:00.000Z",
    });
    await repo.upsertVitals({
      packageName: "com.example.app",
      date: "2026-10-01",
      crashRate: 0.002,
      userPerceivedCrashRate: 0.002,
      anrRate: 0.001,
      userPerceivedAnrRate: 0.001,
      distinctUsers: 100,
      slowStartRate: null,
      excessiveWakeupRate: null,
      capturedAt: "2026-10-01T00:00:00.000Z",
    });
    await repo.upsertVitals({
      packageName: "com.example.app",
      date: "2026-11-03",
      crashRate: 0.02,
      userPerceivedCrashRate: 0.02,
      anrRate: 0.001,
      userPerceivedAnrRate: 0.001,
      distinctUsers: 100,
      slowStartRate: null,
      excessiveWakeupRate: null,
      capturedAt: "2026-11-03T00:00:00.000Z",
    });
    const now = new Date("2026-11-04T00:00:00.000Z");
    const first = await runAlerts({ repo, email, now, productId: "appvitals" });
    expect(first.sent).toBe(1);
    expect(email.sent[0]?.text).toContain("Broken");
    expect(email.sent[0]?.text).not.toContain("Nice");
    expect(email.sent[0]?.text).toContain("bad-behaviour");
    const second = await runAlerts({ repo, email, now: new Date(now.getTime() + 60_000), productId: "appvitals" });
    expect(second.sent).toBe(0);

    subscription.alertFrequency = "weekly";
    subscription.lastAlertAt = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const weekly = await runAlerts({ repo, email, now, productId: "appvitals" });
    expect(weekly.considered).toBe(0);
  });

  it("returns 503 from checkout when Lemon Squeezy is unset", async () => {
    const result = await handleCheckoutRequest({
      requestUrl: "https://hostedmcp.dev/api/checkout?plan=solo&product=appvitals",
      env: process.env,
    });
    expect(result.status).toBe(503);
    if ("body" in result) expect(result.body.error).toContain("LEMONSQUEEZY_API_KEY");
  });

  it("checks the cron bearer with a constant-time compare", () => {
    expect(cronAuthorised("Bearer secret", "secret")).toBe(true);
    expect(cronAuthorised("Bearer other", "secret")).toBe(false);
    expect(cronAuthorised(null, "secret")).toBe(false);
    expect(cronAuthorised("Bearer secret", undefined)).toBe(false);
  });

  it("registers ShipVitals beside AppVitals and keeps their subscriptions apart", async () => {
    const ship = (await import("../lib/products")).getProduct("shipvitals");
    expect(ship?.path).toBe("/shipvitals");
    expect(ship?.mcpPath).toBe("/api/mcp/shipvitals");
    expect(ship?.plans.map((plan) => plan.priceUsdMonthly)).toEqual([9, 19]);

    const repo = new MemoryRepository();
    const customer = await repo.upsertCustomerByEmail("ios@example.com");
    const key = generateApiKey();
    await repo.insertApiKey({ customerId: customer.id, keyHash: key.keyHash, keyPrefix: key.keyPrefix });
    await repo.upsertSubscription({
      customerId: customer.id,
      productId: "shipvitals",
      plan: "solo",
      status: "active",
      trialEndsAt: null,
      lsSubscriptionId: "ls-ship",
    });
    const shipAuth = await authenticateApiKey(repo, key.token, "shipvitals", new Date("2026-11-04T00:00:00.000Z"));
    expect(shipAuth.ok).toBe(true);
    const playAuth = await authenticateApiKey(repo, key.token, "appvitals", new Date("2026-11-04T00:00:00.000Z"));
    expect(playAuth.ok).toBe(false);

    const saved = await addCustomerApps({
      repo,
      token: key.token,
      productId: "shipvitals",
      packageNames: ["1234567890"],
      now: new Date("2026-11-04T00:00:00.000Z"),
    });
    expect(saved.ok).toBe(true);
    const bundle = await addCustomerApps({
      repo,
      token: key.token,
      productId: "shipvitals",
      packageNames: ["com.example.ios"],
      now: new Date("2026-11-04T00:00:00.000Z"),
    });
    expect(bundle.ok).toBe(false);
    if (!bundle.ok) expect(bundle.message).toContain("Apple app id");
  });

  it("checks out ShipVitals against its own Lemon Squeezy variants", async () => {
    const missing = await handleCheckoutRequest({
      requestUrl: "https://hostedmcp.dev/api/checkout?plan=solo&product=shipvitals",
      env: {
        ...process.env,
        LEMONSQUEEZY_API_KEY: "key",
        LEMONSQUEEZY_STORE_ID: "1",
        LEMONSQUEEZY_VARIANT_SOLO: "111",
        LEMONSQUEEZY_VARIANT_UNLIMITED: "222",
        LEMONSQUEEZY_VARIANT_SHIPVITALS_SOLO: "",
        LEMONSQUEEZY_VARIANT_SHIPVITALS_UNLIMITED: "",
      },
    });
    expect(missing.status).toBe(503);
    if ("body" in missing) {
      expect(missing.body.error).toContain("LEMONSQUEEZY_VARIANT_SHIPVITALS_SOLO");
      expect(missing.body.error).not.toContain("LEMONSQUEEZY_VARIANT_SOLO,");
    }

    let seen = "";
    const ready = await handleCheckoutRequest({
      requestUrl: "https://hostedmcp.dev/api/checkout?plan=unlimited&product=shipvitals",
      env: {
        ...process.env,
        LEMONSQUEEZY_API_KEY: "key",
        LEMONSQUEEZY_STORE_ID: "9",
        LEMONSQUEEZY_VARIANT_SHIPVITALS_SOLO: "333",
        LEMONSQUEEZY_VARIANT_SHIPVITALS_UNLIMITED: "444",
      },
      fetchImpl: async (_url, init) => {
        seen = String(init?.body ?? "");
        return new Response(JSON.stringify({ data: { attributes: { url: "https://checkout.example/ship" } } }), {
          status: 200,
        });
      },
    });
    expect(ready).toEqual({ status: 302, redirect: "https://checkout.example/ship" });
    expect(seen).toContain('"id":"444"');
    expect(seen).toContain("shipvitals");
  });

  it("issues the hub key email for a ShipVitals subscription", async () => {
    const repo = new MemoryRepository();
    const email = new MemoryEmailSender();
    const created = await handleLemonEvent({
      repo,
      email,
      now: new Date("2026-11-04T00:00:00.000Z"),
      env: {
        ...process.env,
        LEMONSQUEEZY_VARIANT_SHIPVITALS_SOLO: "333",
        LEMONSQUEEZY_VARIANT_SHIPVITALS_UNLIMITED: "444",
      },
      event: {
        meta: { event_name: "subscription_created", custom_data: { product_id: "shipvitals" } },
        data: {
          id: "sub_ship",
          attributes: { status: "active", user_email: "ios@example.com", variant_id: 333 },
        },
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(email.sent[0]?.text).toContain("https://hostedmcp.dev/api/mcp/shipvitals");
    expect(email.sent[0]?.text).toContain("ShipVitals");
    const subscription = await repo.findSubscriptionByLsId("sub_ship");
    expect(subscription?.productId).toBe("shipvitals");
    expect(subscription?.plan).toBe("solo");
  });

  it("records hosted tool calls as metadata and can query them", async () => {
    const repo = new MemoryRepository();
    const customer = await repo.upsertCustomerByEmail("usage@example.com");
    const key = generateApiKey();
    const secretTail = key.token.slice(8);
    const reviewText = "The app crashed and lost my streak of 140 days.";
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "get_recent_reviews",
        arguments: { packageName: "com.example.app", replyText: reviewText, apiKey: key.token },
      },
    });
    expect(toolNamesFromMcpBody(body)).toEqual(["get_recent_reviews"]);
    expect(toolNamesFromMcpBody(JSON.stringify({ jsonrpc: "2.0", method: "tools/list" }))).toEqual([]);

    const started = Date.now() - 25;
    await recordAuthenticatedToolCall({
      repo,
      productId: "appvitals",
      customerId: customer.id,
      keyPrefix: key.token,
      body,
      response: new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: { content: [{ type: "text", text: reviewText }], isError: false },
        }),
        { status: 200 },
      ),
      startedAt: started,
      failed: false,
    });
    await recordAuthenticatedToolCall({
      repo,
      productId: "appvitals",
      customerId: customer.id,
      keyPrefix: key.keyPrefix,
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_vitals" } }),
      response: new Response(
        JSON.stringify({ jsonrpc: "2.0", id: 2, result: { isError: true, content: [{ type: "text", text: "nope" }] } }),
        { status: 200 },
      ),
      startedAt: Date.now(),
      failed: false,
    });
    await repo.recordToolEvent({
      productId: "shipvitals",
      customerId: customer.id,
      keyPrefix: key.keyPrefix,
      toolName: "list_reviews",
      ok: true,
      latencyMs: 5,
      createdAt: "2026-11-01T00:00:00.000Z",
    });

    const rows = await repo.listToolEvents({ customerId: customer.id, productId: "appvitals" });
    expect(rows).toHaveLength(2);
    const reviews = rows.find((row) => row.toolName === "get_recent_reviews");
    const vitals = rows.find((row) => row.toolName === "get_vitals");
    expect(reviews?.ok).toBe(true);
    expect(vitals?.ok).toBe(false);
    expect(reviews?.keyPrefix).toBe(key.keyPrefix);
    expect(reviews?.keyPrefix).toHaveLength(8);
    expect(reviews?.latencyMs).toBeGreaterThanOrEqual(20);
    expect(rows.every((row) => row.customerId === customer.id)).toBe(true);

    await repo.recordToolEvent({
      productId: "order-check",
      customerId: customer.id,
      keyPrefix: "av_order1",
      toolName: "older",
      ok: true,
      latencyMs: 1,
      createdAt: "2026-11-03T00:00:00.000Z",
    });
    await repo.recordToolEvent({
      productId: "order-check",
      customerId: customer.id,
      keyPrefix: "av_order1",
      toolName: "newer",
      ok: true,
      latencyMs: 2,
      createdAt: "2026-11-04T00:00:00.000Z",
    });
    const ordered = await repo.listToolEvents({ productId: "order-check" });
    expect(ordered.map((row) => row.toolName)).toEqual(["newer", "older"]);
    expect(ordered[0]?.keyPrefix).toBe("av_order");
    expect((await repo.listToolEvents({ productId: "order-check", limit: 1 }))[0]?.toolName).toBe("newer");

    const stored = JSON.stringify(repo.toolEvents);
    expect(stored).not.toContain(secretTail);
    expect(stored).not.toContain(reviewText);
    expect(stored).not.toContain("com.example.app");
    expect(await repo.listToolEvents({ productId: "shipvitals" })).toHaveLength(1);
    expect(await toolCallOk(Response.json({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "nope" } }))).toBe(
      false,
    );
  });

  it("links privacy and terms from the footer", () => {
    const layout = readFileSync(path.join(root, "hosted/app/layout.tsx"), "utf8");
    expect(layout).toContain('href="/privacy"');
    expect(layout).toContain('href="/terms"');
  });

  it("keeps user-facing copy free of em dashes", () => {
    const files = [
      "README.md",
      "packages/mcp/README.md",
      "packages/shipvitals-mcp/README.md",
      "hosted/app/page.tsx",
      "hosted/app/layout.tsx",
      "hosted/app/appvitals/page.tsx",
      "hosted/app/appvitals/connect/page.tsx",
      "hosted/app/shipvitals/page.tsx",
      "hosted/app/shipvitals/connect/page.tsx",
      "hosted/components/ShipExamples.tsx",
      "hosted/app/account/page.tsx",
      "hosted/app/privacy/page.tsx",
      "hosted/app/terms/page.tsx",
      "hosted/README.md",
    ];
    for (const file of files) {
      expect(readFileSync(path.join(root, file), "utf8"), file).not.toContain("\u2014");
    }
  });
});
