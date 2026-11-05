import { PAGE_SIZE_CHECKLIST, PAGE_SIZE_NOTE } from "./checklist.js";
import { readablePlayError } from "./errors.js";
import type { PlayClient } from "./play/types.js";
import { fail, ok, type ToolResult } from "./result.js";
import { VITAL_THRESHOLDS } from "./thresholds.js";

export interface ReviewHistoryQuery {
  packageName: string;
  since?: string;
  maxStars?: number;
}

export interface AppVitalsContext {
  client: PlayClient;
  packages: string[];
  allowWrites: boolean;
  reviewHistory?: (query: ReviewHistoryQuery) => Promise<unknown>;
}

const CRASH_METRICS = ["userPerceivedCrashRate", "crashRate", "distinctUsers"];
const ANR_METRICS = ["userPerceivedAnrRate", "anrRate", "distinctUsers"];

export function assertConfiguredPackage(ctx: AppVitalsContext, packageName: string): ToolResult | null {
  if (!ctx.packages.includes(packageName)) {
    return fail(
      `Package ${packageName} is not configured. Set APPVITALS_PACKAGES, or add the app on the hosted account.`,
    );
  }
  return null;
}

export async function collectRecentReviews(
  client: PlayClient,
  args: {
    packageName: string;
    maxResults?: number;
    minStars?: number;
    maxStars?: number;
    translationLanguage?: string;
  },
) {
  const max = args.maxResults ?? 50;
  const cap = Math.min(300, Math.max(max * 5, max));
  const matched = [];
  let pageToken: string | undefined;
  let raw = 0;
  do {
    const page = await client.listReviews({
      packageName: args.packageName,
      pageToken,
      maxResults: 100,
      ...(args.translationLanguage ? { translationLanguage: args.translationLanguage } : {}),
    });
    raw += page.reviews.length;
    for (const review of page.reviews) {
      if (args.minStars != null && review.starRating < args.minStars) continue;
      if (args.maxStars != null && review.starRating > args.maxStars) continue;
      matched.push(review);
      if (matched.length >= max) return matched;
    }
    pageToken = page.nextPageToken;
  } while (pageToken && raw < cap);
  return matched;
}

export async function toolListApps(ctx: AppVitalsContext): Promise<ToolResult> {
  return ok({
    packages: ctx.packages,
    note:
      ctx.packages.length === 0
        ? "No package names configured. Set APPVITALS_PACKAGES to a comma separated list."
        : "These are the package names this server will read.",
  });
}

export async function toolGetRecentReviews(
  ctx: AppVitalsContext,
  args: {
    packageName: string;
    maxResults?: number;
    minStars?: number;
    maxStars?: number;
    translationLanguage?: string;
  },
): Promise<ToolResult> {
  const denied = assertConfiguredPackage(ctx, args.packageName);
  if (denied) return denied;
  if (args.minStars != null && args.maxStars != null && args.minStars > args.maxStars) {
    return fail("minStars is higher than maxStars.");
  }
  try {
    const reviews = await collectRecentReviews(ctx.client, args);
    return ok({
      packageName: args.packageName,
      reviews,
      note: "Google only returns reviews created or modified in the last 7 days.",
    });
  } catch (err) {
    return fail(readablePlayError(err));
  }
}

export async function toolReplyToReview(
  ctx: AppVitalsContext,
  args: { packageName: string; reviewId: string; replyText: string; confirm?: boolean },
): Promise<ToolResult> {
  if (args.confirm !== true || !ctx.allowWrites) {
    const needs: string[] = [];
    if (args.confirm !== true) needs.push("pass confirm: true");
    if (!ctx.allowWrites) needs.push("set APPVITALS_ALLOW_WRITES=true on the server");
    return fail(`Refused. reply_to_review is a write. ${needs.join(" and ")}. Nothing was sent.`);
  }
  const denied = assertConfiguredPackage(ctx, args.packageName);
  if (denied) return denied;
  if (args.replyText.length > 350) {
    return fail(
      `Reply is ${args.replyText.length} characters. The Play limit is 350. Nothing was sent.`,
    );
  }
  if (!args.replyText.trim()) {
    return fail("Reply text is empty. Nothing was sent.");
  }
  try {
    const result = await ctx.client.replyToReview({
      packageName: args.packageName,
      reviewId: args.reviewId,
      replyText: args.replyText,
    });
    return ok({ sent: true, reviewId: args.reviewId, replyText: result.replyText });
  } catch (err) {
    return fail(readablePlayError(err));
  }
}

export async function toolGetRatingsSummary(
  ctx: AppVitalsContext,
  args: { packageName: string },
): Promise<ToolResult> {
  const denied = assertConfiguredPackage(ctx, args.packageName);
  if (denied) return denied;
  try {
    const reviews = await collectRecentReviews(ctx.client, { packageName: args.packageName, maxResults: 200 });
    const byStars: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    let total = 0;
    for (const review of reviews) {
      const star = review.starRating;
      if (star >= 1 && star <= 5) {
        const key = String(star);
        byStars[key] = (byStars[key] ?? 0) + 1;
        total += star;
      }
    }
    const average = reviews.length === 0 ? null : Math.round((total / reviews.length) * 100) / 100;
    return ok({
      packageName: args.packageName,
      reviewCount: reviews.length,
      average,
      byStars,
      note: "Lifetime average isn't exposed by the Play Developer API. This average only covers reviews created or modified in the last 7 days.",
    });
  } catch (err) {
    return fail(readablePlayError(err));
  }
}

export interface VitalsDay {
  date: string;
  userPerceivedCrashRate: number | null;
  crashRate: number | null;
  userPerceivedAnrRate: number | null;
  anrRate: number | null;
  distinctUsers: number | null;
  slowStartRate: number | null;
  excessiveWakeupRate: number | null;
}

export interface VitalsReport {
  packageName: string;
  days: number;
  series: VitalsDay[];
  flags: Array<{ metric: string; date: string; value: number; threshold: number }>;
  notes: string[];
}

function pick(metrics: Record<string, number> | undefined, name: string): number | null {
  const value = metrics?.[name];
  return typeof value === "number" ? value : null;
}

export async function collectVitals(
  client: PlayClient,
  packageName: string,
  days: number,
): Promise<VitalsReport> {
  const notes = [
    "Rates are fractions. 0.0109 means 1.09%.",
    `User-perceived crash rate bad-behaviour threshold is ${(VITAL_THRESHOLDS.userPerceivedCrashRate * 100).toFixed(2)}%. User-perceived ANR rate bad-behaviour threshold is ${(VITAL_THRESHOLDS.userPerceivedAnrRate * 100).toFixed(2)}%.`,
  ];
  const crash = await client.queryMetricSet({
    packageName,
    metricSet: "crashRateMetricSet",
    days,
    metrics: CRASH_METRICS,
  });
  const anr = await client.queryMetricSet({
    packageName,
    metricSet: "anrRateMetricSet",
    days,
    metrics: ANR_METRICS,
  });
  let slow: Awaited<ReturnType<PlayClient["queryMetricSet"]>> = [];
  let wake: Awaited<ReturnType<PlayClient["queryMetricSet"]>> = [];
  try {
    slow = await client.queryMetricSet({
      packageName,
      metricSet: "slowStartRateMetricSet",
      days,
      metrics: ["slowStartRate", "distinctUsers"],
    });
  } catch (err) {
    notes.push(`slowStartRate was not available: ${readablePlayError(err)}`);
  }
  try {
    wake = await client.queryMetricSet({
      packageName,
      metricSet: "excessiveWakeupRateMetricSet",
      days,
      metrics: ["excessiveWakeupRate", "distinctUsers"],
    });
  } catch (err) {
    notes.push(`excessiveWakeupRate was not available: ${readablePlayError(err)}`);
  }
  const dates = new Set<string>();
  for (const row of [...crash, ...anr, ...slow, ...wake]) dates.add(row.date);
  const series: VitalsDay[] = [...dates].sort().map((date) => {
    const crashRow = crash.find((row) => row.date === date)?.metrics;
    const anrRow = anr.find((row) => row.date === date)?.metrics;
    const slowRow = slow.find((row) => row.date === date)?.metrics;
    const wakeRow = wake.find((row) => row.date === date)?.metrics;
    const users = pick(crashRow, "distinctUsers") ?? pick(anrRow, "distinctUsers");
    return {
      date,
      userPerceivedCrashRate: pick(crashRow, "userPerceivedCrashRate"),
      crashRate: pick(crashRow, "crashRate"),
      userPerceivedAnrRate: pick(anrRow, "userPerceivedAnrRate"),
      anrRate: pick(anrRow, "anrRate"),
      distinctUsers: users,
      slowStartRate: pick(slowRow, "slowStartRate"),
      excessiveWakeupRate: pick(wakeRow, "excessiveWakeupRate"),
    };
  });
  const flags: VitalsReport["flags"] = [];
  for (const day of series) {
    if (
      day.userPerceivedCrashRate != null &&
      day.userPerceivedCrashRate > VITAL_THRESHOLDS.userPerceivedCrashRate
    ) {
      flags.push({
        metric: "userPerceivedCrashRate",
        date: day.date,
        value: day.userPerceivedCrashRate,
        threshold: VITAL_THRESHOLDS.userPerceivedCrashRate,
      });
    }
    if (
      day.userPerceivedAnrRate != null &&
      day.userPerceivedAnrRate > VITAL_THRESHOLDS.userPerceivedAnrRate
    ) {
      flags.push({
        metric: "userPerceivedAnrRate",
        date: day.date,
        value: day.userPerceivedAnrRate,
        threshold: VITAL_THRESHOLDS.userPerceivedAnrRate,
      });
    }
  }
  if (flags.length === 0) {
    notes.push("No day in this window is over the bad-behaviour threshold.");
  }
  return { packageName, days, series, flags, notes };
}

export async function toolGetVitals(
  ctx: AppVitalsContext,
  args: { packageName: string; days?: number },
): Promise<ToolResult> {
  const denied = assertConfiguredPackage(ctx, args.packageName);
  if (denied) return denied;
  const days = args.days ?? 7;
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return fail("days must be a whole number from 1 to 90.");
  }
  try {
    return ok(await collectVitals(ctx.client, args.packageName, days));
  } catch (err) {
    return fail(readablePlayError(err));
  }
}

async function withEdit<T>(
  client: PlayClient,
  packageName: string,
  read: (editId: string) => Promise<T>,
): Promise<{ value: T; editDeleted: boolean; deleteNote?: string }> {
  const edit = await client.insertEdit(packageName);
  let value: T;
  try {
    value = await read(edit.editId);
  } catch (err) {
    try {
      await client.deleteEdit(packageName, edit.editId);
    } catch {
      // Keep the read error. The edit may still be open in Play Console.
    }
    throw err;
  }
  try {
    await client.deleteEdit(packageName, edit.editId);
    return { value, editDeleted: true };
  } catch (err) {
    return {
      value,
      editDeleted: false,
      deleteNote: `The edit could not be deleted. ${readablePlayError(err)}`,
    };
  }
}

export async function toolListReleases(
  ctx: AppVitalsContext,
  args: { packageName: string },
): Promise<ToolResult> {
  const denied = assertConfiguredPackage(ctx, args.packageName);
  if (denied) return denied;
  try {
    const { value, editDeleted, deleteNote } = await withEdit(ctx.client, args.packageName, (editId) =>
      ctx.client.listTracks(args.packageName, editId),
    );
    return ok({
      packageName: args.packageName,
      tracks: value,
      editDeleted,
      ...(deleteNote ? { deleteNote } : {}),
    });
  } catch (err) {
    return fail(readablePlayError(err));
  }
}

export async function toolCheck16kb(
  ctx: AppVitalsContext,
  args: { packageName: string },
): Promise<ToolResult> {
  const denied = assertConfiguredPackage(ctx, args.packageName);
  if (denied) return denied;
  try {
    const { value, editDeleted, deleteNote } = await withEdit(ctx.client, args.packageName, (editId) =>
      ctx.client.listBundles(args.packageName, editId),
    );
    const latestVersionCodes = [...value.map((bundle) => bundle.versionCode)].sort((a, b) => b - a);
    return ok({
      packageName: args.packageName,
      latestVersionCodes,
      editDeleted,
      note: PAGE_SIZE_NOTE,
      checklist: PAGE_SIZE_CHECKLIST,
      ...(deleteNote ? { deleteNote } : {}),
    });
  } catch (err) {
    return fail(readablePlayError(err));
  }
}

export async function toolGetReviewHistory(
  ctx: AppVitalsContext,
  args: ReviewHistoryQuery,
): Promise<ToolResult> {
  if (!ctx.reviewHistory) {
    return fail("Review history is only available on the hosted server. The Play API keeps about 7 days.");
  }
  const denied = assertConfiguredPackage(ctx, args.packageName);
  if (denied) return denied;
  try {
    const reviews = await ctx.reviewHistory(args);
    return ok({
      packageName: args.packageName,
      reviews,
      note: "These rows come from hosted snapshots, so they can outlive the 7 day Play API window.",
    });
  } catch (err) {
    return fail(readablePlayError(err));
  }
}
