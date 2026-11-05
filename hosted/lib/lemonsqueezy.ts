import { createHmac, timingSafeEqual } from "node:crypto";
import { generateApiKey } from "./keys";
import { getProduct, isPlanId, products, variantEnvName, type PlanId } from "./products";
import type { EmailSender } from "./email";
import type { Repository } from "./repo";
import type { SubscriptionStatus } from "./products";

export function signLemonBody(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

export function verifyLemonSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = signLemonBody(rawBody, secret);
  const got = signature.trim().toLowerCase();
  if (got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export function checkoutConfigError(env: NodeJS.ProcessEnv, productId = "appvitals"): string | null {
  const variantNames = [variantEnvName(productId, "solo"), variantEnvName(productId, "unlimited")].filter(
    (name): name is string => Boolean(name),
  );
  const required = ["LEMONSQUEEZY_API_KEY", "LEMONSQUEEZY_STORE_ID", ...variantNames];
  const missing = required.filter((name) => !env[name]);
  if (missing.length === 0) return null;
  return `Lemon Squeezy is not configured (${missing.join(", ")}). Checkout is unavailable until those are set.`;
}

export async function createCheckoutUrl(opts: {
  env: NodeJS.ProcessEnv;
  plan: PlanId;
  productId: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const missing = checkoutConfigError(opts.env, opts.productId);
  if (missing) throw new Error(missing);
  const variantName = variantEnvName(opts.productId, opts.plan);
  const variant = variantName ? opts.env[variantName] : undefined;
  if (!variant) throw new Error("Lemon Squeezy variant is not configured.");
  const response = await (opts.fetchImpl ?? fetch)("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${(opts.env.LEMONSQUEEZY_API_KEY ?? "").trim()}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            custom: { product_id: opts.productId, plan: opts.plan },
          },
        },
        relationships: {
          store: { data: { type: "stores", id: String(opts.env.LEMONSQUEEZY_STORE_ID) } },
          variant: { data: { type: "variants", id: String(variant) } },
        },
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Lemon Squeezy checkout failed (${response.status}): ${text.slice(0, 300)}`);
  }
  const json = (await response.json()) as { data?: { attributes?: { url?: string } } };
  const url = json.data?.attributes?.url;
  if (!url) throw new Error("Lemon Squeezy did not return a checkout URL.");
  return url;
}

export interface LemonEvent {
  meta?: {
    event_name?: string;
    custom_data?: Record<string, string | undefined>;
  };
  data?: {
    id?: string;
    attributes?: {
      status?: string;
      user_email?: string;
      variant_id?: number | string;
      trial_ends_at?: string | null;
    };
  };
}

const TRIAL_MS = 7 * 24 * 60 * 60 * 1000;

export function mapLemonStatus(status: string | undefined, eventName: string): SubscriptionStatus {
  if (eventName === "subscription_cancelled") return "cancelled";
  switch (status) {
    case "on_trial":
      return "trialing";
    case "active":
      return "active";
    case "cancelled":
      return "cancelled";
    case "expired":
      return "expired";
    case "past_due":
    case "unpaid":
      return "past_due";
    default:
      return "active";
  }
}

export function planFromLemon(event: LemonEvent, env: NodeJS.ProcessEnv): PlanId | null {
  const custom = event.meta?.custom_data?.plan;
  if (custom && isPlanId(custom)) return custom;
  const variant = event.data?.attributes?.variant_id;
  if (variant == null) return null;
  const id = String(variant);
  for (const product of products) {
    for (const plan of ["solo", "unlimited"] as const) {
      const name = variantEnvName(product.id, plan);
      if (name && env[name] && id === env[name]) return plan;
    }
  }
  return null;
}

export async function handleLemonEvent(opts: {
  event: LemonEvent;
  repo: Repository;
  email: EmailSender;
  env: NodeJS.ProcessEnv;
  now: Date;
}): Promise<{ ok: true; ignored?: boolean; apiKey?: string } | { ok: false; message: string }> {
  const name = opts.event.meta?.event_name ?? "";
  if (!name.startsWith("subscription_")) {
    return { ok: true, ignored: true };
  }
  if (
    name !== "subscription_created" &&
    name !== "subscription_updated" &&
    name !== "subscription_cancelled"
  ) {
    return { ok: true, ignored: true };
  }
  const email = opts.event.data?.attributes?.user_email ?? opts.event.meta?.custom_data?.email;
  if (!email) return { ok: false, message: "Webhook is missing the customer email." };
  const productId = opts.event.meta?.custom_data?.product_id || opts.event.meta?.custom_data?.product || "appvitals";
  const product = getProduct(productId);
  if (!product) {
    return { ok: false, message: `Unknown product ${productId}.` };
  }
  if (!product.forSale) {
    return { ok: true, ignored: true };
  }
  const plan = planFromLemon(opts.event, opts.env);
  if (!plan) return { ok: false, message: "Could not map this subscription to a solo or unlimited plan." };
  const status = mapLemonStatus(opts.event.data?.attributes?.status, name);
  const trialFromEvent = opts.event.data?.attributes?.trial_ends_at ?? null;
  const trialEndsAt =
    trialFromEvent ?? (status === "trialing" ? new Date(opts.now.getTime() + TRIAL_MS).toISOString() : null);
  const customer = await opts.repo.upsertCustomerByEmail(email);
  await opts.repo.upsertSubscription({
    customerId: customer.id,
    productId,
    plan,
    status,
    trialEndsAt,
    lsSubscriptionId: opts.event.data?.id ?? null,
  });
  if (name !== "subscription_created") return { ok: true };
  const existing = await opts.repo.listApiKeys(customer.id);
  if (existing.length > 0) return { ok: true };
  const key = generateApiKey();
  await opts.repo.insertApiKey({
    customerId: customer.id,
    keyHash: key.keyHash,
    keyPrefix: key.keyPrefix,
  });
  await opts.email.send({
    to: customer.email,
    subject: "Your hostedmcp.dev API key",
    text: [
      "Thanks for subscribing.",
      "",
      `Your API key is ${key.token}`,
      "",
      "The key is for the whole hostedmcp.dev account. Each product still has its own subscription.",
      "We only store a hash of the key, so keep this email.",
      "",
      `This subscription is for ${product.name}.`,
      `Point your MCP client at https://hostedmcp.dev${product.mcpPath} with Authorization: Bearer <key>.`,
    ].join("\n"),
  });
  return { ok: true, apiKey: key.token };
}

export async function handleCheckoutRequest(opts: {
  requestUrl: string;
  env: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<{ status: number; body: { error: string } } | { status: 302; redirect: string }> {
  const url = new URL(opts.requestUrl);
  const plan = url.searchParams.get("plan") ?? "";
  const productId = url.searchParams.get("product") ?? "appvitals";
  const product = getProduct(productId);
  if (!product) {
    return { status: 400, body: { error: `Unknown product ${productId}.` } };
  }
  if (!product.forSale) {
    return {
      status: 403,
      body: {
        error: `${product.name} is not sold as a hosted plan. Self-host the open source MCP with your own credentials. There is no checkout.`,
      },
    };
  }
  if (!isPlanId(plan)) {
    return { status: 400, body: { error: "plan must be solo or unlimited." } };
  }
  const missing = checkoutConfigError(opts.env, productId);
  if (missing) return { status: 503, body: { error: missing } };
  try {
    const redirect = await createCheckoutUrl({
      env: opts.env,
      plan,
      productId,
      ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    });
    return { status: 302, redirect };
  } catch (err) {
    return {
      status: 502,
      body: { error: err instanceof Error ? err.message : "Checkout failed." },
    };
  }
}
