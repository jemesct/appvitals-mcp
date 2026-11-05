import { VITAL_THRESHOLDS } from "appvitals-mcp";

export interface SpikeResult {
  spike: boolean;
  reason: string | null;
}

/**
 * A spike is a latest rate above the Play bad-behaviour threshold,
 * or more than 50% above the average of the supplied baseline (up to 28 days).
 */
export function detectSpike(
  latest: number | null,
  baseline: number[],
  threshold: number,
): SpikeResult {
  if (latest == null || Number.isNaN(latest)) {
    return { spike: false, reason: null };
  }
  if (latest > threshold) {
    return { spike: true, reason: "above the bad-behaviour threshold" };
  }
  const samples = baseline.filter((value) => Number.isFinite(value));
  if (samples.length === 0) return { spike: false, reason: null };
  const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  if (average > 0 && latest > average * 1.5) {
    return { spike: true, reason: "more than 50% over the 28 day baseline" };
  }
  return { spike: false, reason: null };
}

export const CRASH_THRESHOLD = VITAL_THRESHOLDS.userPerceivedCrashRate;
export const ANR_THRESHOLD = VITAL_THRESHOLDS.userPerceivedAnrRate;

export function alertDue(lastAlertAt: string | null, frequency: "daily" | "weekly", now: Date): boolean {
  if (!lastAlertAt) return true;
  const elapsed = now.getTime() - new Date(lastAlertAt).getTime();
  const windowMs = frequency === "weekly" ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  return elapsed >= windowMs;
}
