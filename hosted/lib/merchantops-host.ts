import { createServer, type StoreConnection } from "merchantops-mcp";
import { merchantPlanError, readStoredMerchantCredentials, type MerchantStore } from "./merchant-connect";
import type { PlanId } from "./products";
import type { MerchantCredentialRecord } from "./repo";

/** Customer keys only. No loadConfig(), process argv, mock, or billing-key fallback. */
export function openHostedMerchantOps(opts: {
  env: NodeJS.ProcessEnv;
  customerId: string;
  plan: PlanId;
  record: MerchantCredentialRecord | null;
  fetchImpl?: typeof fetch;
}) {
  if (!opts.record) return { ok: false as const, status: 403, message: "Save your own store keys on the MerchantOps connect page. Hosted MerchantOps does not use a shared store key." };
  let stores: MerchantStore[];
  try {
    stores = readStoredMerchantCredentials(opts.record, opts.customerId, opts.env);
  } catch (err) {
    return { ok: false as const, status: 503, message: (err as Error).message };
  }
  const planError = merchantPlanError(stores, opts.plan);
  if (planError) return { ok: false as const, status: 403, message: planError };
  const allowWrites = opts.env.MERCHANTOPS_ALLOW_WRITES === "1" || opts.env.MERCHANTOPS_ALLOW_WRITES === "true";
  const connections: StoreConnection[] = stores.map((store) => ({
    id: store.id,
    config: {
      mock: false,
      allowWrites,
      paddleEnv: store.provider === "paddle" ? store.environment : "sandbox",
      ...(store.provider === "lemonsqueezy"
        ? { lemonSqueezyKey: store.apiKey, lemonSqueezyStoreId: store.storeId }
        : { paddleKey: store.apiKey }),
    },
    fetchFn: scopedMerchantFetch(store, opts.fetchImpl ?? fetch),
  }));
  const server = createServer({ mock: false, allowWrites, paddleEnv: "sandbox" }, undefined, connections);
  return { ok: true as const, server };
}

/** Restrict pagination, redact upstream errors, and scope direct writes as well as lists. */
export function scopedMerchantFetch(store: MerchantStore, fetchImpl: typeof fetch) {
  const origin = store.provider === "lemonsqueezy" ? "https://api.lemonsqueezy.com"
    : `https://${store.environment === "sandbox" ? "sandbox-api" : "api"}.paddle.com`;
  async function request(url: string, init?: RequestInit): Promise<Response> {
    const parsed = new URL(url);
    if (parsed.origin !== origin || parsed.username || parsed.password) throw new Error("Provider returned an unexpected API URL.");
    let response: Response;
    try {
      response = await fetchImpl(url, { ...init, redirect: "error", signal: AbortSignal.timeout(15000) });
    } catch {
      throw new Error("Could not reach the store API. Check your saved key and environment.");
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Provider request failed (HTTP ${response.status}). Check your saved key and its permissions.`);
    }
    return response;
  }
  return async (url: string, init?: RequestInit): Promise<Response> => {
    const parsed = new URL(url);
    if (store.provider === "lemonsqueezy") {
      const collection = /^\/v1\/(subscriptions|orders|license-keys|discounts)$/.test(parsed.pathname);
      const method = init?.method ?? "GET";
      if (collection && method === "GET") parsed.searchParams.set("filter[store_id]", store.storeId);
      if (method !== "GET") {
        const target = parsed.pathname.match(/^\/v1\/(orders|license-keys)\/([^/]+)(?:\/refund)?$/);
        if (target) {
          const checked = await request(`${origin}/v1/${target[1]}/${target[2]}`, { headers: init?.headers });
          const data = await checked.json() as { data?: { attributes?: { store_id?: number | string } } };
          if (String(data.data?.attributes?.store_id) !== store.storeId) throw new Error("That item does not belong to the saved store.");
        } else if (parsed.pathname !== "/v1/discounts" || method !== "POST") {
          throw new Error("This write is not supported for the saved store.");
        }
      }
    }
    return request(parsed.toString(), init);
  };
}
