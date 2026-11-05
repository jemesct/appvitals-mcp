import type { Interval, Subscription } from "./types.js";

/** Convert one billing-period amount to a monthly amount (minor units, unrounded). */
export function monthlyAmount(amountMinor: number, interval: Interval, count: number): number {
  const n = count > 0 ? count : 1;
  switch (interval) {
    case "month": return amountMinor / n;
    case "year": return amountMinor / (12 * n);
    case "week": return (amountMinor * 52) / (12 * n);
    case "day": return (amountMinor * 365) / (12 * n);
  }
}

/** Statuses that count towards MRR. Trials are excluded by default. */
export function countsTowardsMrr(s: Subscription, includeTrials = false): boolean {
  if (s.normalisedStatus === "active" || s.normalisedStatus === "past_due") return true;
  return includeTrials && s.normalisedStatus === "trialing";
}

export interface MrrSummary {
  byCurrency: Record<string, { mrrMinor: number; mrr: string; arr: string; subscriptions: number }>;
  counts: Record<string, number>;
  note: string;
}

export function summariseMrr(subs: Subscription[], includeTrials = false): MrrSummary {
  const byCurrency: MrrSummary["byCurrency"] = {};
  const counts: Record<string, number> = {};
  for (const s of subs) {
    counts[s.normalisedStatus] = (counts[s.normalisedStatus] ?? 0) + 1;
    if (!countsTowardsMrr(s, includeTrials)) continue;
    const c = (byCurrency[s.currency] ??= { mrrMinor: 0, mrr: "", arr: "", subscriptions: 0 });
    c.mrrMinor += monthlyAmount(s.amountMinor, s.interval, s.intervalCount);
    c.subscriptions += 1;
  }
  for (const c of Object.values(byCurrency)) {
    c.mrrMinor = Math.round(c.mrrMinor);
    c.mrr = (c.mrrMinor / 100).toFixed(2);
    c.arr = ((c.mrrMinor * 12) / 100).toFixed(2);
  }
  return {
    byCurrency, counts,
    note: "MRR counts active and past due subscriptions" + (includeTrials ? " plus trials" : "") +
      ", normalised to a month (yearly / 12, weekly x 52 / 12, daily x 365 / 12). Currencies are kept separate, no FX conversion. Excludes tax only where the provider price excludes tax.",
  };
}
