import { mintAppStoreConnectJwt, readableAscError } from "shipvitals-mcp";
import { addCustomerApps, parsePackageNames } from "./apps";
import { authenticateApiKey } from "./auth";
import { decryptJson, encryptJson, parseCredentialsKey, redactSecrets } from "./credentials";
import type { AscCredentialRecord, Repository } from "./repo";

const KEY_ID = /^[A-Za-z0-9]{8,20}$/;
const ISSUER_ID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const VENDOR = /^\d{4,12}$/;

export interface StoredAscCredentials {
  customerId: string;
  keyId: string;
  issuerId: string;
  privateKeyPem: string;
  vendorNumber: string | null;
}

export interface SaveAscResult {
  ok: true;
  keyId: string;
  issuerId: string;
  vendorSaved: boolean;
  appIds: string[];
}

export function normalisePrivateKey(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.includes("\\n") ? trimmed.replace(/\\n/g, "\n") : trimmed;
}

export async function saveCustomerAscCredentials(opts: {
  repo: Repository;
  token: string;
  now: Date;
  env: NodeJS.ProcessEnv;
  keyId: string;
  issuerId: string;
  privateKeyPem: string;
  vendorNumber?: string;
  appIds?: string[];
}): Promise<SaveAscResult | { ok: false; status: number; message: string }> {
  const keyId = opts.keyId.trim();
  const issuerId = opts.issuerId.trim();
  const pem = normalisePrivateKey(opts.privateKeyPem);
  const vendorRaw = opts.vendorNumber?.trim() ?? "";
  if (!KEY_ID.test(keyId)) {
    return { ok: false, status: 400, message: "Key ID should be the 10 character id Apple shows next to the API key." };
  }
  if (!ISSUER_ID.test(issuerId)) {
    return { ok: false, status: 400, message: "Issuer ID should be the UUID from App Store Connect, Users and Access, Integrations." };
  }
  if (!pem.includes("BEGIN PRIVATE KEY") && !pem.includes("BEGIN EC PRIVATE KEY")) {
    return { ok: false, status: 400, message: "Paste the .p8 file. It should be a PEM private key." };
  }
  if (vendorRaw && !VENDOR.test(vendorRaw)) {
    return { ok: false, status: 400, message: "Vendor number should be the numeric id from Payments and Financial Reports, or leave it blank." };
  }
  const auth = await authenticateApiKey(opts.repo, opts.token, "shipvitals", opts.now);
  if (!auth.ok) return { ok: false, status: auth.status, message: auth.message };
  try {
    mintAppStoreConnectJwt({ issuerId, keyId, privateKeyPem: pem, now: opts.now, lifetimeSeconds: 60 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "The App Store Connect key could not be used.";
    return { ok: false, status: 400, message: redactSecrets(message, [pem, keyId]) };
  }
  let master: Buffer;
  try {
    master = parseCredentialsKey(opts.env.SHIPVITALS_CREDENTIALS_KEY);
  } catch (err) {
    const message = err instanceof Error ? err.message : "SHIPVITALS_CREDENTIALS_KEY is not set.";
    return { ok: false, status: 503, message };
  }
  const blob = encryptJson(
    { v: 1, keyId, issuerId, privateKeyPem: pem, vendorNumber: vendorRaw || null },
    master,
  );
  await opts.repo.upsertAscCredentials({
    customerId: auth.entitlement.customerId,
    iv: blob.iv,
    authTag: blob.authTag,
    ciphertext: blob.ciphertext,
    updatedAt: opts.now.toISOString(),
  });
  const requested = opts.appIds ?? [];
  if (requested.length === 0) {
    return { ok: true, keyId, issuerId, vendorSaved: Boolean(vendorRaw), appIds: [] };
  }
  const savedApps = await addCustomerApps({
    repo: opts.repo,
    token: opts.token,
    productId: "shipvitals",
    packageNames: requested,
    now: opts.now,
  });
  if (!savedApps.ok) {
    return { ok: false, status: savedApps.status, message: `${savedApps.message} The App Store Connect key was saved.` };
  }
  return {
    ok: true,
    keyId,
    issuerId,
    vendorSaved: Boolean(vendorRaw),
    appIds: savedApps.packages,
  };
}

export function readStoredAscCredentials(
  record: AscCredentialRecord,
  env: NodeJS.ProcessEnv,
): StoredAscCredentials {
  const master = parseCredentialsKey(env.SHIPVITALS_CREDENTIALS_KEY);
  let parsed: {
    keyId?: string;
    issuerId?: string;
    privateKeyPem?: string;
    vendorNumber?: string | null;
  };
  try {
    parsed = decryptJson(record, master);
  } catch {
    throw new Error("Could not decrypt this account's App Store Connect key. Check SHIPVITALS_CREDENTIALS_KEY.");
  }
  if (!parsed.privateKeyPem || !parsed.keyId || !parsed.issuerId) {
    throw new Error("Stored App Store Connect credentials are incomplete.");
  }
  return {
    customerId: record.customerId,
    keyId: parsed.keyId,
    issuerId: parsed.issuerId,
    privateKeyPem: parsed.privateKeyPem,
    vendorNumber: parsed.vendorNumber ?? null,
  };
}

export function ascFailureMessage(err: unknown, pem: string): string {
  const message = readableAscError(err);
  return redactSecrets(message, [pem]);
}

export function appIdsFromForm(raw: string): string[] {
  return parsePackageNames(raw);
}
