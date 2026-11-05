import { authenticateApiKey } from "./auth";
import { appLimitFor } from "./products";
import type { Repository } from "./repo";

const PACKAGE_NAME = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const APPLE_APP_ID = /^\d{6,20}$/;

export function invalidResource(productId: string, name: string): string | null {
  if (productId === "appvitals") {
    if (!PACKAGE_NAME.test(name)) return `${name} does not look like an Android package name.`;
    return null;
  }
  if (productId === "shipvitals") {
    if (!APPLE_APP_ID.test(name)) {
      return `${name} does not look like an Apple app id. Use the numeric id from App Store Connect.`;
    }
    return null;
  }
  return `Unknown product ${productId}.`;
}

export function parsePackageNames(raw: string): string[] {
  const names = raw
    .split(/[\s,]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return [...new Set(names)];
}

export async function addCustomerApps(opts: {
  repo: Repository;
  token: string;
  productId: string;
  packageNames: string[];
  alertFrequency?: "daily" | "weekly";
  now: Date;
}): Promise<{ ok: true; packages: string[] } | { ok: false; status: number; message: string }> {
  const auth = await authenticateApiKey(opts.repo, opts.token, opts.productId, opts.now);
  if (!auth.ok) return { ok: false, status: auth.status, message: auth.message };
  if (opts.packageNames.length === 0) {
    const noun = opts.productId === "shipvitals" ? "Apple app id" : "package name";
    return { ok: false, status: 400, message: `Enter at least one ${noun}.` };
  }
  for (const name of opts.packageNames) {
    const invalid = invalidResource(opts.productId, name);
    if (invalid) return { ok: false, status: 400, message: invalid };
  }
  const existing = await opts.repo.listApps(auth.entitlement.customerId, opts.productId);
  const merged = new Set(existing.map((app) => app.packageName));
  for (const name of opts.packageNames) merged.add(name);
  const limit = appLimitFor(opts.productId, auth.entitlement.plan);
  if (limit != null && merged.size > limit) {
    return {
      ok: false,
      status: 403,
      message: `The ${auth.entitlement.plan} plan covers ${limit} app. Move to unlimited, or stick to the app you already added.`,
    };
  }
  for (const name of opts.packageNames) {
    await opts.repo.addApp({
      customerId: auth.entitlement.customerId,
      productId: opts.productId,
      packageName: name,
    });
  }
  if (opts.alertFrequency) {
    await opts.repo.setAlertFrequency(
      auth.entitlement.customerId,
      opts.productId,
      opts.alertFrequency,
    );
  }
  const apps = await opts.repo.listApps(auth.entitlement.customerId, opts.productId);
  return { ok: true, packages: apps.map((app) => app.packageName) };
}
