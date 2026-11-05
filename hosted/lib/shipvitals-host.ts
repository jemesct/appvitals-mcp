import { AppleAscClient, MockAscClient, createAscClientFromEnv, readableAscError, type AscClient } from "shipvitals-mcp";
import { readStoredAscCredentials, type StoredAscCredentials } from "./asc-connect";
import { appLimitFor, type PlanId } from "./products";
import type { AscCredentialRecord } from "./repo";

const APPLE_APP_ID = /^\d{6,20}$/;

export interface HostedShipSession {
  client: AscClient;
  appIds: string[];
  vendorNumber: string | null;
  salesReports: boolean;
  allowWrites: boolean;
  /** Which key the session is using. Tests use this to prove customers are not mixed. */
  source: "customer" | "mock" | "operator";
  keyId: string | null;
}

/**
 * Paying customers use their own encrypted App Store Connect key.
 * A deployment `.p8` is only for the operator customer id, and only when that
 * account has not saved a key. Per-customer encrypted `.p8` is this file.
 */
export async function openHostedShipVitals(opts: {
  env: NodeJS.ProcessEnv;
  customerId: string;
  plan: PlanId;
  registeredAppIds: string[];
  record: AscCredentialRecord | null;
  listApps?: (client: AscClient) => Promise<string[]>;
}): Promise<{ ok: true; session: HostedShipSession } | { ok: false; status: number; message: string }> {
  if (opts.record) {
    return openCustomerKey(opts);
  }
  if (opts.env.SHIPVITALS_MOCK === "1" || opts.env.SHIPVITALS_MOCK === "true") {
    return {
      ok: true,
      session: {
        client: new MockAscClient(),
        appIds: mockAppIds(opts.env),
        vendorNumber: null,
        salesReports: false,
        allowWrites: false,
        source: "mock",
        keyId: null,
      },
    };
  }
  if (opts.env.SHIPVITALS_OPERATOR_CUSTOMER_ID?.trim() === opts.customerId) {
    return openOperator(opts.env);
  }
  return {
    ok: false,
    status: 403,
    message:
      "Save your own App Store Connect key on the ShipVitals connect page. Hosted ShipVitals does not use a shared key.",
  };
}

export function scopeShipAppIds(opts: { registered: string[]; accessible: string[]; limit: number | null }): string[] {
  const accessible = new Set(opts.accessible.filter((id) => APPLE_APP_ID.test(id)));
  const source =
    opts.registered.length > 0
      ? opts.registered.filter((id) => accessible.has(id))
      : [...accessible];
  const unique = [...new Set(source)];
  if (opts.limit == null) return unique;
  return unique.slice(0, opts.limit);
}

async function openCustomerKey(opts: {
  env: NodeJS.ProcessEnv;
  customerId: string;
  plan: PlanId;
  registeredAppIds: string[];
  record: AscCredentialRecord | null;
  listApps?: (client: AscClient) => Promise<string[]>;
}): Promise<{ ok: true; session: HostedShipSession } | { ok: false; status: number; message: string }> {
  let stored: StoredAscCredentials;
  try {
    stored = readStoredAscCredentials(opts.record as AscCredentialRecord, opts.env);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read the App Store Connect key.";
    return { ok: false, status: 500, message };
  }
  if (stored.customerId !== opts.customerId) {
    return { ok: false, status: 403, message: "Those App Store Connect credentials belong to another account." };
  }
  const client = new AppleAscClient({
    issuerId: stored.issuerId,
    keyId: stored.keyId,
    privateKeyPem: stored.privateKeyPem,
  });
  let accessible: string[];
  try {
    accessible = opts.listApps ? await opts.listApps(client) : (await client.listApps()).map((app) => app.id);
  } catch (err) {
    return { ok: false, status: 502, message: readableAscError(err) };
  }
  const appIds = scopeShipAppIds({
    registered: opts.registeredAppIds,
    accessible,
    limit: appLimitFor("shipvitals", opts.plan),
  });
  return {
    ok: true,
    session: {
      client,
      appIds,
      vendorNumber: stored.vendorNumber,
      salesReports: stored.vendorNumber != null,
      allowWrites: opts.env.SHIPVITALS_ALLOW_WRITES === "true" || opts.env.SHIPVITALS_ALLOW_WRITES === "1",
      source: "customer",
      keyId: stored.keyId,
    },
  };
}

function openOperator(
  env: NodeJS.ProcessEnv,
): { ok: true; session: HostedShipSession } | { ok: false; status: number; message: string } {
  const appIds = parseAppIds(env.SHIPVITALS_ALLOWED_APP_IDS);
  if (appIds.length === 0) {
    return {
      ok: false,
      status: 403,
      message: "The operator allowlist is empty. Set SHIPVITALS_ALLOWED_APP_IDS or save a customer key.",
    };
  }
  const vendor = env.SHIPVITALS_VENDOR_NUMBER?.trim() || null;
  return {
    ok: true,
    session: {
      client: createAscClientFromEnv(env),
      appIds,
      vendorNumber: vendor,
      salesReports: vendor != null,
      allowWrites: false,
      source: "operator",
      keyId: env.SHIPVITALS_KEY_ID?.trim() || null,
    },
  };
}

function mockAppIds(env: NodeJS.ProcessEnv): string[] {
  const allowed = parseAppIds(env.SHIPVITALS_ALLOWED_APP_IDS);
  if (allowed.length > 0) return allowed;
  const fromEnv = parseAppIds(env.SHIPVITALS_APP_IDS);
  return fromEnv.length > 0 ? fromEnv : ["1234567890"];
}

function parseAppIds(raw: string | undefined): string[] {
  const ids = (raw ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => APPLE_APP_ID.test(part));
  return [...new Set(ids)];
}
