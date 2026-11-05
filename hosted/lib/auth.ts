import { bearerToken, sha256 } from "./keys";
import { appLimitFor, type PlanId } from "./products";
import type { AppRecord, Repository, Subscription } from "./repo";

export interface Entitlement {
  customerId: string;
  email: string;
  productId: string;
  plan: PlanId;
  status: Subscription["status"];
  packages: string[];
  subscription: Subscription;
}

export type AuthResult =
  | { ok: true; entitlement: Entitlement }
  | { ok: false; status: number; message: string };

export function subscriptionAllowsAccess(
  sub: Subscription,
  now: Date,
): { ok: true } | { ok: false; message: string } {
  if (sub.status === "cancelled") {
    return { ok: false, message: "This subscription is cancelled." };
  }
  if (sub.status === "expired") {
    return { ok: false, message: "This subscription has expired." };
  }
  if (sub.status === "past_due") {
    return { ok: false, message: "This subscription is past due. Update billing to keep using the MCP." };
  }
  if (sub.status === "trialing") {
    if (sub.trialEndsAt && new Date(sub.trialEndsAt).getTime() <= now.getTime()) {
      return { ok: false, message: "Your trial has ended. Subscribe to keep using this MCP." };
    }
    return { ok: true };
  }
  if (sub.status === "active") return { ok: true };
  return { ok: false, message: "This subscription is not active." };
}

export function entitledPackages(apps: AppRecord[], productId: string, plan: PlanId): string[] {
  const sorted = [...apps].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.packageName.localeCompare(b.packageName),
  );
  const limit = appLimitFor(productId, plan);
  const capped = limit == null ? sorted : sorted.slice(0, limit);
  return capped.map((app) => app.packageName);
}

export async function authenticateApiKey(
  repo: Repository,
  token: string,
  productId: string,
  now: Date,
): Promise<AuthResult> {
  if (!token.startsWith("av_")) {
    return { ok: false, status: 401, message: "API keys look like av_ followed by hex." };
  }
  const found = await repo.findApiKeyByHash(sha256(token));
  if (!found) {
    return { ok: false, status: 401, message: "Unknown API key." };
  }
  const subscription = await repo.findSubscription(found.customerId, productId);
  if (!subscription) {
    return { ok: false, status: 403, message: `No ${productId} subscription on this account.` };
  }
  const access = subscriptionAllowsAccess(subscription, now);
  if (!access.ok) {
    return { ok: false, status: 403, message: access.message };
  }
  const apps = await repo.listApps(found.customerId, productId);
  return {
    ok: true,
    entitlement: {
      customerId: found.customerId,
      email: found.customer.email,
      productId,
      plan: subscription.plan,
      status: subscription.status,
      packages: entitledPackages(apps, productId, subscription.plan),
      subscription,
    },
  };
}

export async function authenticateRequest(
  repo: Repository,
  authorization: string | null,
  productId: string,
  now = new Date(),
): Promise<AuthResult> {
  const token = bearerToken(authorization);
  if (!token) {
    return { ok: false, status: 401, message: "Missing bearer API key." };
  }
  return authenticateApiKey(repo, token, productId, now);
}
