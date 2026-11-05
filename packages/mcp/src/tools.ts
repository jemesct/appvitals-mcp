import { PAGE_SIZE_CHECKLIST, PAGE_SIZE_NOTE } from "./checklist.js";
import { readablePlayError } from "./errors.js";
import type { DailyMetric, PlayClient, VitalsDimension } from "./play/types.js";
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
  /** Customer registration page for hosted accounts. Omit for self-hosted servers. */
  appRegistrationUrl?: string;
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
        ? ctx.appRegistrationUrl
          ? `No package names configured. Register your Android app package names at ${ctx.appRegistrationUrl} using your hostedmcp.dev API key.`
          : "No package names configured. Set APPVITALS_PACKAGES to a comma separated list."
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

export const VITALS_DIMENSIONS: Record<VitalsDimension, { play: string; label: string }> = {
  device: { play: "deviceModel", label: "device model (brand/device, e.g. google/coral)" },
  androidVersion: { play: "apiLevel", label: "Android API level" },
  country: { play: "countryCode", label: "country or region (ISO-3166, from device IP)" },
};

const SLICE_CAP = 40;

export interface VitalsSlice {
  value: string;
  label?: string;
  date: string;
  userPerceivedCrashRate: number | null;
  crashRate: number | null;
  userPerceivedAnrRate: number | null;
  anrRate: number | null;
  distinctUsers: number | null;
}

function latestByDimension(rows: DailyMetric[], playDimension: string): Map<string, DailyMetric> {
  const latest = new Map<string, DailyMetric>();
  for (const row of rows) {
    const value = row.dimensions?.[playDimension];
    if (!value) continue;
    const previous = latest.get(value);
    if (!previous || row.date > previous.date) latest.set(value, row);
  }
  return latest;
}

function daysOrFail(days: number | undefined, fallback: number): number | ToolResult {
  const value = days ?? fallback;
  if (!Number.isInteger(value) || value < 1 || value > 90) {
    return fail("days must be a whole number from 1 to 90.");
  }
  return value;
}

export async function toolGetVitalsBreakdown(
  ctx: AppVitalsContext,
  args: { packageName: string; dimension: VitalsDimension; days?: number },
): Promise<ToolResult> {
  const denied = assertConfiguredPackage(ctx, args.packageName);
  if (denied) return denied;
  const mapped = VITALS_DIMENSIONS[args.dimension];
  if (!mapped) {
    return fail("dimension must be device, androidVersion, or country.");
  }
  const days = daysOrFail(args.days, 7);
  if (typeof days !== "number") return days;
  const notes = [
    "Rates are fractions. 0.0109 means 1.09%.",
    `Slices are the latest day in the window for each ${mapped.label}.`,
    `User-perceived crash rate bad-behaviour threshold is ${(VITAL_THRESHOLDS.userPerceivedCrashRate * 100).toFixed(2)}%. User-perceived ANR rate bad-behaviour threshold is ${(VITAL_THRESHOLDS.userPerceivedAnrRate * 100).toFixed(2)}%.`,
  ];
  try {
    const crash = await ctx.client.queryMetricSet({
      packageName: args.packageName,
      metricSet: "crashRateMetricSet",
      days,
      metrics: CRASH_METRICS,
      dimensions: [mapped.play],
    });
    let anr: DailyMetric[] = [];
    try {
      anr = await ctx.client.queryMetricSet({
        packageName: args.packageName,
        metricSet: "anrRateMetricSet",
        days,
        metrics: ANR_METRICS,
        dimensions: [mapped.play],
      });
    } catch (err) {
      notes.push(`ANR breakdown was not available: ${readablePlayError(err)}`);
    }
    const crashLatest = latestByDimension(crash, mapped.play);
    const anrLatest = latestByDimension(anr, mapped.play);
    const values = new Set([...crashLatest.keys(), ...anrLatest.keys()]);
    const slices: VitalsSlice[] = [...values].map((value) => {
      const crashRow = crashLatest.get(value);
      const anrRow = anrLatest.get(value);
      const users = pick(crashRow?.metrics, "distinctUsers") ?? pick(anrRow?.metrics, "distinctUsers");
      const label = crashRow?.dimensionLabels?.[mapped.play] ?? anrRow?.dimensionLabels?.[mapped.play];
      const date = [crashRow?.date, anrRow?.date].filter((item): item is string => Boolean(item)).sort().at(-1) ?? "";
      const slice: VitalsSlice = {
        value,
        date,
        userPerceivedCrashRate: pick(crashRow?.metrics, "userPerceivedCrashRate"),
        crashRate: pick(crashRow?.metrics, "crashRate"),
        userPerceivedAnrRate: pick(anrRow?.metrics, "userPerceivedAnrRate"),
        anrRate: pick(anrRow?.metrics, "anrRate"),
        distinctUsers: users,
      };
      if (label) slice.label = label;
      return slice;
    });
    slices.sort((a, b) => {
      const users = (b.distinctUsers ?? 0) - (a.distinctUsers ?? 0);
      if (users !== 0) return users;
      return (b.userPerceivedCrashRate ?? 0) - (a.userPerceivedCrashRate ?? 0);
    });
    const truncated = slices.length > SLICE_CAP;
    const kept = slices.slice(0, SLICE_CAP);
    if (truncated) {
      notes.push(`Showing the ${SLICE_CAP} slices with the most distinct users (${slices.length} came back).`);
    }
    const flags: Array<{ metric: string; value: number; threshold: number; slice: string }> = [];
    for (const slice of kept) {
      if (
        slice.userPerceivedCrashRate != null &&
        slice.userPerceivedCrashRate > VITAL_THRESHOLDS.userPerceivedCrashRate
      ) {
        flags.push({
          metric: "userPerceivedCrashRate",
          value: slice.userPerceivedCrashRate,
          threshold: VITAL_THRESHOLDS.userPerceivedCrashRate,
          slice: slice.value,
        });
      }
      if (
        slice.userPerceivedAnrRate != null &&
        slice.userPerceivedAnrRate > VITAL_THRESHOLDS.userPerceivedAnrRate
      ) {
        flags.push({
          metric: "userPerceivedAnrRate",
          value: slice.userPerceivedAnrRate,
          threshold: VITAL_THRESHOLDS.userPerceivedAnrRate,
          slice: slice.value,
        });
      }
    }
    if (flags.length === 0) {
      notes.push("No slice in this snapshot is over the bad-behaviour threshold.");
    }
    return ok({
      packageName: args.packageName,
      dimension: args.dimension,
      playDimension: mapped.play,
      days,
      slices: kept,
      flags,
      notes,
    });
  } catch (err) {
    return fail(readablePlayError(err));
  }
}

const TEST_TRACK = /^(internal|alpha|beta|qa)$|^(closed|open)(:|$)/i;

export async function toolGetPrelaunchReport(
  ctx: AppVitalsContext,
  args: { packageName: string },
): Promise<ToolResult> {
  const denied = assertConfiguredPackage(ctx, args.packageName);
  if (denied) return denied;
  try {
    const { value, editDeleted, deleteNote } = await withEdit(ctx.client, args.packageName, (editId) =>
      ctx.client.listTracks(args.packageName, editId),
    );
    const latestArtifacts = value.map((track) => {
      const latest = [...track.releases]
        .flatMap((release) => release.versionCodes)
        .sort((a, b) => b - a)[0];
      return {
        track: track.track,
        testing: TEST_TRACK.test(track.track) || track.track !== "production",
        latestVersionCode: latest ?? null,
        releases: track.releases,
      };
    });
    return ok({
      packageName: args.packageName,
      preLaunchReportAvailable: false,
      latestArtifacts,
      editDeleted,
      notes: [
        "Google does not expose pre-launch report findings (stability, accessibility, performance, security) on the Android Publisher API or the Play Developer Reporting API.",
        "Those reports stay in Play Console > Testing > Pre-launch report. Typical read-only service-account scopes cannot fetch them.",
        "latestArtifacts lists the latest version codes on each track. Play generates a pre-launch report when you upload to a testing track or save a production release.",
      ],
      ...(deleteNote ? { deleteNote } : {}),
    });
  } catch (err) {
    return fail(readablePlayError(err));
  }
}

export async function toolGetUserTrends(
  ctx: AppVitalsContext,
  args: { packageName: string; days?: number },
): Promise<ToolResult> {
  const denied = assertConfiguredPackage(ctx, args.packageName);
  if (denied) return denied;
  const days = daysOrFail(args.days, 28);
  if (typeof days !== "number") return days;
  try {
    let source: "crashRateMetricSet" | "anrRateMetricSet" = "crashRateMetricSet";
    let rows: DailyMetric[] = [];
    try {
      rows = await ctx.client.queryMetricSet({
        packageName: args.packageName,
        metricSet: "crashRateMetricSet",
        days,
        metrics: ["distinctUsers"],
      });
    } catch (err) {
      source = "anrRateMetricSet";
      try {
        rows = await ctx.client.queryMetricSet({
          packageName: args.packageName,
          metricSet: "anrRateMetricSet",
          days,
          metrics: ["distinctUsers"],
        });
      } catch {
        return fail(readablePlayError(err));
      }
    }
    return ok({
      packageName: args.packageName,
      days,
      source,
      series: rows.map((row) => ({
        date: row.date,
        distinctUsers: pick(row.metrics, "distinctUsers"),
      })),
      installUninstallAvailable: false,
      notes: [
        "distinctUsers is the Play Developer Reporting vitals denominator: users who actively used the app that day (activity or foreground service).",
        "Play does not publish install, uninstall, or official active-device counts on androidpublisher or playdeveloperreporting. Those series live in Play Console Cloud Storage bulk reports (stats/installs), which need the extra OAuth scope https://www.googleapis.com/auth/devstorage.read_only and the account's pubsite_prod_* bucket.",
      ],
    });
  } catch (err) {
    return fail(readablePlayError(err));
  }
}

export async function toolGetRatingsByCountry(
  ctx: AppVitalsContext,
  args: { packageName: string; countryCode?: string },
): Promise<ToolResult> {
  const denied = assertConfiguredPackage(ctx, args.packageName);
  if (denied) return denied;
  if (args.countryCode) {
    return fail(
      "The reviews API has no country field, so countryCode cannot be applied. Call again without countryCode to group the last 7 days of reviews by reviewerLanguage.",
    );
  }
  try {
    const reviews = await collectRecentReviews(ctx.client, { packageName: args.packageName, maxResults: 200 });
    const groups = new Map<
      string,
      { language: string; reviewCount: number; starTotal: number; byStars: Record<string, number> }
    >();
    for (const review of reviews) {
      const language = review.reviewerLanguage || "unknown";
      const group = groups.get(language) ?? {
        language,
        reviewCount: 0,
        starTotal: 0,
        byStars: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
      };
      group.reviewCount += 1;
      if (review.starRating >= 1 && review.starRating <= 5) {
        const key = String(review.starRating);
        group.byStars[key] = (group.byStars[key] ?? 0) + 1;
        group.starTotal += review.starRating;
      }
      groups.set(language, group);
    }
    const byLanguage = [...groups.values()]
      .map((group) => ({
        language: group.language,
        reviewCount: group.reviewCount,
        average: group.reviewCount === 0 ? null : Math.round((group.starTotal / group.reviewCount) * 100) / 100,
        byStars: group.byStars,
      }))
      .sort((a, b) => b.reviewCount - a.reviewCount);
    return ok({
      packageName: args.packageName,
      reviewCount: reviews.length,
      countryAvailable: false,
      byLanguage,
      notes: [
        "The reviews API does not include a country field. reviewerLanguage is the closest attribute Google returns.",
        "Lifetime ratings by country are only in Play Console Cloud Storage bulk reports (stats/ratings/..._country.csv), which need the extra GCS scope and the account's reports bucket.",
        "This summary only covers reviews created or modified in the last 7 days.",
      ],
    });
  } catch (err) {
    return fail(readablePlayError(err));
  }
}
