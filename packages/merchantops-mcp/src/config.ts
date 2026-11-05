import type { FetchLike } from "./http.js";
import { createMockFetch } from "./mock/fetch.js";
import { LemonSqueezyProvider } from "./providers/lemonsqueezy.js";
import { PaddleProvider } from "./providers/paddle.js";
import type { Provider, ProviderName } from "./types.js";

export interface Config {
  mock: boolean;
  allowWrites: boolean;
  lemonSqueezyKey?: string;
  lemonSqueezyStoreId?: string;
  paddleKey?: string;
  paddleEnv: "sandbox" | "production";
}

const on = (v?: string) => v === "1" || v === "true";

export function loadConfig(env: NodeJS.ProcessEnv = process.env, argv: string[] = process.argv): Config {
  const mock = argv.includes("--mock") || on(env.MERCHANTOPS_MOCK) || on(env.MOCK);
  return {
    mock,
    allowWrites: on(env.MERCHANTOPS_ALLOW_WRITES),
    lemonSqueezyKey: env.LEMONSQUEEZY_API_KEY || undefined,
    lemonSqueezyStoreId: env.LEMONSQUEEZY_STORE_ID || (mock ? "1" : undefined),
    paddleKey: env.PADDLE_API_KEY || undefined,
    paddleEnv: env.PADDLE_ENV === "production" ? "production" : "sandbox",
  };
}

export function buildProviders(cfg: Config, fetchFn?: FetchLike): Partial<Record<ProviderName, Provider>> {
  const f = fetchFn ?? (cfg.mock ? createMockFetch() : fetch);
  const out: Partial<Record<ProviderName, Provider>> = {};
  const lsKey = cfg.mock ? "mock" : cfg.lemonSqueezyKey;
  const pdKey = cfg.mock ? "mock" : cfg.paddleKey;
  if (lsKey) out.lemonsqueezy = new LemonSqueezyProvider(lsKey, f, cfg.lemonSqueezyStoreId);
  if (pdKey) out.paddle = new PaddleProvider(pdKey, cfg.paddleEnv, f);
  return out;
}
