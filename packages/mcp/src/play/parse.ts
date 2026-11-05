import type { BundleInfo, DailyMetric, NormalizedReview, TrackInfo } from "./types.js";

interface GoogleTime {
  year?: number;
  month?: number;
  day?: number;
  seconds?: string | number;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function dateFromGoogle(time: GoogleTime | undefined): string | null {
  if (!time) return null;
  if (time.year && time.month && time.day) {
    return `${time.year}-${pad(time.month)}-${pad(time.day)}`;
  }
  if (time.seconds != null) {
    const ms = Number(time.seconds) * 1000;
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toISOString();
  }
  return null;
}

function metricValue(entry: unknown): { name: string; value: number } | null {
  if (!entry || typeof entry !== "object") return null;
  const record = entry as {
    metric?: string;
    decimalValue?: { value?: string } | string;
    value?: string | number;
  };
  const name = record.metric;
  if (!name) return null;
  const raw =
    typeof record.decimalValue === "string"
      ? record.decimalValue
      : (record.decimalValue?.value ?? record.value);
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return { name, value };
}

function parseDimensions(entries: unknown): {
  values: Record<string, string>;
  labels: Record<string, string>;
} | null {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const values: Record<string, string> = {};
  const labels: Record<string, string> = {};
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as {
      dimension?: string;
      stringValue?: string;
      int64Value?: string | number;
      valueLabel?: string;
    };
    if (!record.dimension) continue;
    const value =
      record.stringValue != null && record.stringValue !== ""
        ? record.stringValue
        : record.int64Value != null
          ? String(record.int64Value)
          : null;
    if (value == null) continue;
    values[record.dimension] = value;
    if (record.valueLabel) labels[record.dimension] = record.valueLabel;
  }
  return Object.keys(values).length > 0 ? { values, labels } : null;
}

function dimensionKey(values: Record<string, string> | undefined): string {
  if (!values) return "";
  return Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("|");
}

export function parseMetricRows(payload: unknown): DailyMetric[] {
  const rows = (payload as { rows?: unknown[] } | null)?.rows;
  if (!Array.isArray(rows)) return [];
  const byKey = new Map<string, DailyMetric>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as { startTime?: GoogleTime; metrics?: unknown[]; dimensions?: unknown[] };
    const date = dateFromGoogle(record.startTime);
    if (!date) continue;
    const parsedDimensions = parseDimensions(record.dimensions);
    const key = `${date}|${dimensionKey(parsedDimensions?.values)}`;
    const existing = byKey.get(key);
    const metrics = existing?.metrics ?? {};
    for (const entry of record.metrics ?? []) {
      const parsed = metricValue(entry);
      if (parsed) metrics[parsed.name] = parsed.value;
    }
    const next: DailyMetric = { date, metrics };
    if (parsedDimensions) {
      next.dimensions = parsedDimensions.values;
      if (Object.keys(parsedDimensions.labels).length > 0) {
        next.dimensionLabels = parsedDimensions.labels;
      }
    }
    byKey.set(key, next);
  }
  return [...byKey.values()].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return dimensionKey(a.dimensions).localeCompare(dimensionKey(b.dimensions));
  });
}

export function parseReviews(payload: unknown): { reviews: NormalizedReview[]; nextPageToken?: string } {
  const body = (payload ?? {}) as {
    reviews?: unknown[];
    tokenPagination?: { nextPageToken?: string };
  };
  const reviews: NormalizedReview[] = [];
  for (const item of body.reviews ?? []) {
    if (!item || typeof item !== "object") continue;
    const review = item as {
      reviewId?: string;
      authorName?: string;
      comments?: Array<{
        userComment?: {
          text?: string;
          originalText?: string;
          starRating?: number;
          reviewerLanguage?: string;
          lastModified?: { seconds?: string | number };
        };
      }>;
    };
    const comment = review.comments?.find((entry) => entry.userComment)?.userComment;
    if (!review.reviewId || !comment) continue;
    const lastModified = dateFromGoogle(comment.lastModified) ?? new Date(0).toISOString();
    const normalised: NormalizedReview = {
      reviewId: review.reviewId,
      authorName: review.authorName || "Unknown",
      text: comment.text ?? "",
      starRating: comment.starRating ?? 0,
      lastModified,
    };
    if (comment.reviewerLanguage) normalised.reviewerLanguage = comment.reviewerLanguage;
    if (comment.originalText) normalised.originalText = comment.originalText;
    reviews.push(normalised);
  }
  const next = body.tokenPagination?.nextPageToken;
  return next ? { reviews, nextPageToken: next } : { reviews };
}

export function parseTracks(payload: unknown): TrackInfo[] {
  const tracks = (payload as { tracks?: unknown[] } | null)?.tracks;
  if (!Array.isArray(tracks)) return [];
  return tracks.map((item) => {
    const track = item as { track?: string; releases?: unknown[] };
    const releases = Array.isArray(track.releases) ? track.releases : [];
    return {
      track: track.track ?? "unknown",
      releases: releases.map((release) => {
        const row = release as {
          name?: string;
          status?: string;
          versionCodes?: Array<string | number>;
          userFraction?: number;
        };
        return {
          name: row.name ?? null,
          status: row.status ?? null,
          versionCodes: (row.versionCodes ?? [])
            .map((code) => Number(code))
            .filter((code) => Number.isFinite(code)),
          userFraction: typeof row.userFraction === "number" ? row.userFraction : null,
        };
      }),
    };
  });
}

export function parseBundles(payload: unknown): BundleInfo[] {
  const bundles = (payload as { bundles?: unknown[] } | null)?.bundles;
  if (!Array.isArray(bundles)) return [];
  const parsed: BundleInfo[] = [];
  for (const item of bundles) {
    const row = item as { versionCode?: number | string; sha1?: string };
    const versionCode = Number(row.versionCode);
    if (!Number.isFinite(versionCode)) continue;
    const bundle: BundleInfo = { versionCode };
    if (row.sha1) bundle.sha1 = row.sha1;
    parsed.push(bundle);
  }
  return parsed;
}

export function timelineSpec(
  days: number,
  now = new Date(),
  latestEnd?: { year: number; month: number; day: number },
): {
  aggregationPeriod: "DAILY";
  startTime: { year: number; month: number; day: number; timeZone: { id: string } };
  endTime: { year: number; month: number; day: number; timeZone: { id: string } };
} {
  // Reporting API daily data is keyed to America/Los_Angeles and the end date
  // can't pass the metric set's freshness. Use freshness when known, otherwise
  // fall back to two days ago (LA time), which is normally safe.
  let end: Date;
  if (latestEnd) {
    end = new Date(Date.UTC(latestEnd.year, latestEnd.month - 1, latestEnd.day));
  } else {
    const la = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    end = new Date(Date.UTC(la.getFullYear(), la.getMonth(), la.getDate() - 1));
  }
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.max(1, days));
  const point = (date: Date) => ({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    timeZone: { id: "America/Los_Angeles" },
  });
  return {
    aggregationPeriod: "DAILY",
    startTime: point(start),
    endTime: point(end),
  };
}

export function parseDailyFreshness(
  payload: unknown,
): { year: number; month: number; day: number } | undefined {
  const info = (payload as { freshnessInfo?: { freshnesses?: Array<{ aggregationPeriod?: string; latestEndTime?: { year?: number; month?: number; day?: number } }> } })?.freshnessInfo;
  const daily = info?.freshnesses?.find((f) => f.aggregationPeriod === "DAILY");
  const t = daily?.latestEndTime;
  if (!t || !t.year || !t.month || !t.day) return undefined;
  return { year: t.year, month: t.month, day: t.day };
}
