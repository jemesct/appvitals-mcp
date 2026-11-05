import { authenticateApiKey } from "./auth";
import { decryptJson, encryptJson, parseCredentialsKey } from "./credentials";
import { appLimitFor, type PlanId } from "./products";
import type { MerchantCredentialRecord, Repository } from "./repo";

export type MerchantStore = {
  id: string;
  provider: "lemonsqueezy";
  apiKey: string;
  storeId: string;
} | {
  id: string;
  provider: "paddle";
  apiKey: string;
  environment: "sandbox" | "production";
};

type Failure = { ok: false; status: number; message: string };

function masterKey(env: NodeJS.ProcessEnv): Buffer {
  return parseCredentialsKey(env.MERCHANTOPS_CREDENTIALS_KEY, "MERCHANTOPS_CREDENTIALS_KEY");
}

/** Validate without copying any submitted value into an error message. */
export function parseMerchantStores(value: unknown): MerchantStore[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Add at least one store.");
  const ids = new Set<string>();
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new Error("Check the store details.");
    const s = entry as Record<string, unknown>;
    const id = typeof s.id === "string" ? s.id.trim() : "";
    const apiKey = typeof s.apiKey === "string" ? s.apiKey.trim() : "";
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id) || ids.has(id)) throw new Error("Each store needs a unique short store id.");
    ids.add(id);
    if (apiKey.length < 8 || apiKey.length > 8192 || /\s/.test(apiKey)) throw new Error("Paste an API key for each store, without spaces.");
    if (s.provider === "lemonsqueezy") {
      const storeId = typeof s.storeId === "string" ? s.storeId.trim() : "";
      if (!/^\d{1,20}$/.test(storeId)) throw new Error("Each Lemon Squeezy key needs one numeric store id.");
      return { id, provider: s.provider, apiKey, storeId };
    }
    if (s.provider === "paddle" && (s.environment === "sandbox" || s.environment === "production")) {
      return { id, provider: s.provider, apiKey, environment: s.environment };
    }
    throw new Error("Choose Lemon Squeezy or Paddle, and the Paddle environment if needed.");
  });
}

export function merchantPlanError(stores: MerchantStore[], plan: PlanId): string | null {
  const limit = appLimitFor("merchantops", plan);
  return limit != null && stores.length > limit
    ? "Solo allows one store with one provider key. Save just one store, or choose Team for multiple stores and both providers."
    : null;
}

export async function saveCustomerMerchantCredentials(opts: {
  repo: Repository;
  token: string;
  now: Date;
  env: NodeJS.ProcessEnv;
  stores: unknown;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; storeCount: number } | Failure> {
  const auth = await authenticateApiKey(opts.repo, opts.token, "merchantops", opts.now);
  if (!auth.ok) return auth;
  let stores: MerchantStore[];
  try {
    stores = parseMerchantStores(opts.stores);
  } catch (err) {
    return { ok: false, status: 400, message: (err as Error).message };
  }
  const planError = merchantPlanError(stores, auth.entitlement.plan);
  if (planError) return { ok: false, status: 403, message: planError };
  let key: Buffer;
  try {
    key = masterKey(opts.env);
  } catch (err) {
    return { ok: false, status: 503, message: (err as Error).message };
  }
  // Read-only access checks. Provider error bodies may quote secrets; never return them.
  try {
    for (const store of stores) {
      const url = store.provider === "lemonsqueezy"
        ? `https://api.lemonsqueezy.com/v1/stores/${store.storeId}`
        : `https://${store.environment === "sandbox" ? "sandbox-api" : "api"}.paddle.com/subscriptions?per_page=1`;
      const response = await (opts.fetchImpl ?? fetch)(url, {
        headers: { Authorization: `Bearer ${store.apiKey}`, Accept: store.provider === "lemonsqueezy" ? "application/vnd.api+json" : "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("Access check failed.");
      if (store.provider === "lemonsqueezy") {
        const json = await response.json() as { data?: { id?: string } };
        if (String(json.data?.id) !== store.storeId) throw new Error("Store check failed.");
      } else {
        await response.body?.cancel();
      }
    }
  } catch {
    return { ok: false, status: 400, message: "Could not read one of your stores. Check the API key, store id, environment, and read permissions. No keys were saved." };
  }
  const blob = encryptJson({ v: 1, customerId: auth.entitlement.customerId, stores }, key);
  await opts.repo.upsertMerchantCredentials({
    customerId: auth.entitlement.customerId,
    ...blob,
    updatedAt: opts.now.toISOString(),
  });
  return { ok: true, storeCount: stores.length };
}

export function readStoredMerchantCredentials(record: MerchantCredentialRecord, customerId: string, env: NodeJS.ProcessEnv): MerchantStore[] {
  try {
    const parsed = decryptJson<{ v: number; customerId: string; stores: unknown }>(record, masterKey(env));
    if (record.customerId !== customerId || parsed.customerId !== customerId || parsed.v !== 1) throw new Error("Wrong account.");
    return parseMerchantStores(parsed.stores);
  } catch {
    throw new Error("Could not read this account's store keys. Check MERCHANTOPS_CREDENTIALS_KEY or save your keys again.");
  }
}

export function merchantStoresFromForm(form: FormData): unknown[] {
  const providers = form.getAll("provider");
  return providers.map((provider, i) => ({
    id: `store-${i + 1}`,
    provider: String(provider),
    apiKey: String(form.getAll("storeKey")[i] ?? ""),
    storeId: String(form.getAll("storeId")[i] ?? ""),
    environment: String(form.getAll("environment")[i] ?? ""),
  }));
}
