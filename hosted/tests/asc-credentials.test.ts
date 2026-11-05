import { generateKeyPairSync, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createShipVitalsServer } from "shipvitals-mcp";
import { saveCustomerAscCredentials } from "../lib/asc-connect";
import { decryptJson, encryptJson, parseCredentialsKey } from "../lib/credentials";
import { generateApiKey } from "../lib/keys";
import { MemoryRepository } from "../lib/memory-repo";
import { openHostedShipVitals, scopeShipAppIds } from "../lib/shipvitals-host";

const ISSUER = "11111111-1111-1111-1111-111111111111";

function pem(): string {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

function masterKey(): string {
  return randomBytes(32).toString("base64");
}

function env(partial: Record<string, string>): NodeJS.ProcessEnv {
  return { ...process.env, SHIPVITALS_MOCK: "", SHIPVITALS_VENDOR_NUMBER: "", ...partial };
}

async function subscribedRepo() {
  const repo = new MemoryRepository();
  const customer = await repo.upsertCustomerByEmail("ios@example.com");
  const other = await repo.upsertCustomerByEmail("other@example.com");
  const key = generateApiKey();
  const otherKey = generateApiKey();
  await repo.insertApiKey({ customerId: customer.id, keyHash: key.keyHash, keyPrefix: key.keyPrefix });
  await repo.insertApiKey({ customerId: other.id, keyHash: otherKey.keyHash, keyPrefix: otherKey.keyPrefix });
  await repo.upsertSubscription({
    customerId: customer.id,
    productId: "shipvitals",
    plan: "solo",
    status: "active",
    trialEndsAt: null,
    lsSubscriptionId: "ls-a",
  });
  await repo.upsertSubscription({
    customerId: other.id,
    productId: "shipvitals",
    plan: "unlimited",
    status: "active",
    trialEndsAt: null,
    lsSubscriptionId: "ls-b",
  });
  return { repo, customer, other, key, otherKey };
}

describe("per-customer App Store Connect keys", () => {
  it("round-trips AES-GCM and rejects a short master key", () => {
    const key = parseCredentialsKey(masterKey());
    const blob = encryptJson({ privateKeyPem: "secret-pem" }, key);
    expect(blob.ciphertext).not.toContain("secret-pem");
    expect(decryptJson(blob, key)).toEqual({ privateKeyPem: "secret-pem" });
    expect(() => parseCredentialsKey(Buffer.from("short").toString("base64"))).toThrow(/32 bytes/);
  });

  it("saves an encrypted key and does not echo the .p8", async () => {
    const { repo, key } = await subscribedRepo();
    const privateKeyPem = pem();
    const keyEnv = env({ SHIPVITALS_CREDENTIALS_KEY: masterKey() });
    const bad = await saveCustomerAscCredentials({
      repo,
      token: key.token,
      now: new Date("2026-11-05T00:00:00.000Z"),
      env: keyEnv,
      keyId: "ABCD123456",
      issuerId: ISSUER,
      privateKeyPem: "-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----",
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.message).not.toContain("not-a-real-key");
    expect(repo.ascCredentials).toHaveLength(0);

    const saved = await saveCustomerAscCredentials({
      repo,
      token: key.token,
      now: new Date("2026-11-05T00:00:00.000Z"),
      env: keyEnv,
      keyId: "ABCD123456",
      issuerId: ISSUER,
      privateKeyPem,
      vendorNumber: "80012345",
      appIds: ["1234567890"],
    });
    expect(saved.ok).toBe(true);
    const packed = JSON.stringify(saved);
    expect(packed).not.toContain("BEGIN PRIVATE KEY");
    expect(packed).not.toContain(privateKeyPem.slice(40, 80));
    const row = repo.ascCredentials[0];
    expect(row?.ciphertext).not.toContain("BEGIN PRIVATE KEY");
    expect(row?.ciphertext).not.toContain(privateKeyPem.slice(40, 80));
    const decoded = decryptJson<{ privateKeyPem: string; vendorNumber: string }>(
      { iv: row!.iv, authTag: row!.authTag, ciphertext: row!.ciphertext },
      parseCredentialsKey(keyEnv.SHIPVITALS_CREDENTIALS_KEY),
    );
    expect(decoded.privateKeyPem).toBe(privateKeyPem.trim());
    expect(decoded.vendorNumber).toBe("80012345");
  });

  it("uses each customer's key and vendor number, and drops apps that key cannot see", async () => {
    const { repo, customer, other, key, otherKey } = await subscribedRepo();
    const keyEnv = env({ SHIPVITALS_CREDENTIALS_KEY: masterKey(), SHIPVITALS_VENDOR_NUMBER: "99999999" });
    const pemA = pem();
    const pemB = pem();
    await saveCustomerAscCredentials({
      repo,
      token: key.token,
      now: new Date("2026-11-05T00:00:00.000Z"),
      env: keyEnv,
      keyId: "KEYAAAAAAA",
      issuerId: ISSUER,
      privateKeyPem: pemA,
      vendorNumber: "80011111",
      appIds: ["2222222222", "3333333333"],
    });
    await saveCustomerAscCredentials({
      repo,
      token: otherKey.token,
      now: new Date("2026-11-05T00:00:00.000Z"),
      env: keyEnv,
      keyId: "KEYBBBBBBB",
      issuerId: "22222222-2222-2222-2222-222222222222",
      privateKeyPem: pemB,
      appIds: ["4444444444"],
    });

    const openedA = await openHostedShipVitals({
      env: keyEnv,
      customerId: customer.id,
      plan: "solo",
      registeredAppIds: ["2222222222", "3333333333"],
      record: await repo.getAscCredentials(customer.id),
      listApps: async () => ["2222222222"],
    });
    expect(openedA.ok).toBe(true);
    if (!openedA.ok) return;
    expect(openedA.session.source).toBe("customer");
    expect(openedA.session.keyId).toBe("KEYAAAAAAA");
    expect(openedA.session.appIds).toEqual(["2222222222"]);
    expect(openedA.session.vendorNumber).toBe("80011111");
    expect(openedA.session.salesReports).toBe(true);
    expect(openedA.session.vendorNumber).not.toBe("99999999");

    const openedB = await openHostedShipVitals({
      env: keyEnv,
      customerId: other.id,
      plan: "unlimited",
      registeredAppIds: ["4444444444"],
      record: await repo.getAscCredentials(other.id),
      listApps: async () => ["4444444444"],
    });
    expect(openedB.ok).toBe(true);
    if (!openedB.ok) return;
    expect(openedB.session.keyId).toBe("KEYBBBBBBB");
    expect(openedB.session.appIds).toEqual(["4444444444"]);
    expect(openedB.session.salesReports).toBe(false);
    expect(openedB.session.vendorNumber).toBeNull();

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createShipVitalsServer({
      client: openedA.session.client,
      appIds: openedA.session.appIds,
      allowWrites: false,
      vendorNumber: openedA.session.vendorNumber,
      salesReports: openedA.session.salesReports,
    });
    await server.connect(serverTransport);
    const mcp = new Client({ name: "ship-iso", version: "0.0.0" });
    await mcp.connect(clientTransport);
    const names = (await mcp.listTools()).tools.map((tool) => tool.name);
    expect(names).toContain("get_sales_summary");
    const listed = await mcp.callTool({ name: "list_apps", arguments: {} });
    const body = Array.isArray(listed.content)
      ? listed.content.map((item) => ("text" in item ? item.text : "")).join("\n")
      : "";
    expect(body).toContain("2222222222");
    expect(body).not.toContain("3333333333");
    expect(body).not.toContain("4444444444");
    await mcp.close();
    await server.close();
  });

  it("does not give a paying customer the operator allowlist or the shared vendor number", async () => {
    const { customer, other } = await subscribedRepo();
    const stranger = await openHostedShipVitals({
      env: env({
        SHIPVITALS_ALLOWED_APP_IDS: "1234567890",
        SHIPVITALS_OPERATOR_CUSTOMER_ID: customer.id,
        SHIPVITALS_VENDOR_NUMBER: "80012345",
      }),
      customerId: other.id,
      plan: "unlimited",
      registeredAppIds: ["9999999999"],
      record: null,
    });
    expect(stranger.ok).toBe(false);

    const operator = await openHostedShipVitals({
      env: env({
        SHIPVITALS_ALLOWED_APP_IDS: "1234567890",
        SHIPVITALS_APP_IDS: "9999999999",
        SHIPVITALS_OPERATOR_CUSTOMER_ID: customer.id,
        SHIPVITALS_VENDOR_NUMBER: "80012345",
      }),
      customerId: customer.id,
      plan: "solo",
      registeredAppIds: [],
      record: null,
    });
    expect(operator.ok).toBe(true);
    if (!operator.ok) return;
    expect(operator.session.source).toBe("operator");
    expect(operator.session.appIds).toEqual(["1234567890"]);
    expect(operator.session.salesReports).toBe(true);

    const mock = await openHostedShipVitals({
      env: env({ SHIPVITALS_MOCK: "1", SHIPVITALS_VENDOR_NUMBER: "80012345" }),
      customerId: other.id,
      plan: "solo",
      registeredAppIds: [],
      record: null,
    });
    expect(mock.ok).toBe(true);
    if (!mock.ok) return;
    expect(mock.session.source).toBe("mock");
    expect(mock.session.salesReports).toBe(false);
    expect(mock.session.vendorNumber).toBeNull();
    expect(scopeShipAppIds({ registered: ["2222222222", "3333333333"], accessible: ["2222222222"], limit: 1 })).toEqual([
      "2222222222",
    ]);
  });
});
