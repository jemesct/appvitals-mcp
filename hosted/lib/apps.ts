import { authenticateApiKey } from "./auth";
import { appLimitFor } from "./products";
import type { Repository } from "./repo";

const PACKAGE_NAME = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

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
    return { ok: false, status: 400, message: "Enter at least one package name." };
  }
  for (const name of opts.packageNames) {
    if (!PACKAGE_NAME.test(name)) {
      return { ok: false, status: 400, message: `${name} does not look like an Android package name.` };
    }
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
