import { readableAscError } from "./errors.js";
import {
  FINANCE_NOTES,
  PERF_GAPS,
  PHASED_RELEASE_NOTE,
  RESPONSE_BODY_MAX,
  REVIEW_NOTE,
  SALES_NOTES,
  TESTFLIGHT_NOTE,
} from "./gaps.js";
import { fail, ok, type ToolResult } from "./result.js";
import type { AscClient, CustomerReview } from "./asc/types.js";

export interface ShipVitalsContext {
  client: AscClient;
  appIds: string[];
  allowWrites: boolean;
  vendorNumber: string | null;
}

const SALES_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
const SALES_TYPES = ["SALES", "PREORDER", "SUBSCRIPTION", "SUBSCRIPTION_EVENT", "SUBSCRIBER"] as const;

export function assertConfiguredApp(ctx: ShipVitalsContext, appId: string): ToolResult | null {
  if (!ctx.appIds.includes(appId)) {
    return fail(
      `App ${appId} is not configured. Set SHIPVITALS_APP_IDS, or add the Apple app id on the hosted account.`,
    );
  }
  return null;
}

export async function toolListApps(ctx: ShipVitalsContext): Promise<ToolResult> {
  return ok({
    appIds: ctx.appIds,
    note:
      ctx.appIds.length === 0
        ? "No Apple app ids configured. Set SHIPVITALS_APP_IDS to a comma separated list of numeric App Store ids."
        : "These are the Apple app ids this server will read. One API key is one App Store Connect team.",
  });
}

export async function toolListReviews(
  ctx: ShipVitalsContext,
  args: { appId: string; limit?: number; rating?: number; territory?: string },
): Promise<ToolResult> {
  const denied = assertConfiguredApp(ctx, args.appId);
  if (denied) return denied;
  try {
    const reviews = await ctx.client.listReviews({
      appId: args.appId,
      ...(args.limit != null ? { limit: args.limit } : {}),
      ...(args.rating != null ? { rating: args.rating } : {}),
      ...(args.territory ? { territory: args.territory } : {}),
    });
    return ok({
      appId: args.appId,
      reviews,
      fetchedAverage: averageRating(reviews),
      byRating: countRatings(reviews),
      note: REVIEW_NOTE,
    });
  } catch (err) {
    return fail(readableAscError(err));
  }
}

export async function toolReplyToReview(
  ctx: ShipVitalsContext,
  args: { appId: string; reviewId: string; responseBody: string; confirm?: boolean },
): Promise<ToolResult> {
  if (args.confirm !== true || !ctx.allowWrites) {
    const needs: string[] = [];
    if (args.confirm !== true) needs.push("pass confirm: true");
    if (!ctx.allowWrites) needs.push("set SHIPVITALS_ALLOW_WRITES=true on the server");
    return fail(`Refused. reply_to_review is a write. ${needs.join(" and ")}. Nothing was sent.`);
  }
  const denied = assertConfiguredApp(ctx, args.appId);
  if (denied) return denied;
  if (args.responseBody.length > RESPONSE_BODY_MAX) {
    return fail(
      `Reply is ${args.responseBody.length} characters. Apple's limit for a review response is ${RESPONSE_BODY_MAX}. Nothing was sent.`,
    );
  }
  if (!args.responseBody.trim()) {
    return fail("Reply text is empty. Nothing was sent.");
  }
  try {
    const result = await ctx.client.replyToReview({
      reviewId: args.reviewId,
      responseBody: args.responseBody,
    });
    return ok({ sent: true, reviewId: args.reviewId, responseId: result.id, responseBody: result.responseBody });
  } catch (err) {
    return fail(readableAscError(err));
  }
}

export async function toolGetAppStatus(ctx: ShipVitalsContext, args: { appId: string }): Promise<ToolResult> {
  const denied = assertConfiguredApp(ctx, args.appId);
  if (denied) return denied;
  try {
    const status = await ctx.client.getAppStatus(args.appId);
    return ok({ ...status, note: PHASED_RELEASE_NOTE });
  } catch (err) {
    return fail(readableAscError(err));
  }
}

export async function toolListTestFlightBuilds(
  ctx: ShipVitalsContext,
  args: { appId: string; limit?: number },
): Promise<ToolResult> {
  const denied = assertConfiguredApp(ctx, args.appId);
  if (denied) return denied;
  try {
    const builds = await ctx.client.listTestFlightBuilds({
      appId: args.appId,
      ...(args.limit != null ? { limit: args.limit } : {}),
    });
    return ok({
      appId: args.appId,
      builds,
      note: "processingState VALID means Apple finished processing the upload. This is not the App Store release state.",
    });
  } catch (err) {
    return fail(readableAscError(err));
  }
}

export async function toolGetTestFlightFeedback(
  ctx: ShipVitalsContext,
  args: { appId: string; limit?: number },
): Promise<ToolResult> {
  const denied = assertConfiguredApp(ctx, args.appId);
  if (denied) return denied;
  try {
    const feedback = await ctx.client.getTestFlightFeedback({
      appId: args.appId,
      ...(args.limit != null ? { limit: args.limit } : {}),
    });
    return ok({ appId: args.appId, ...feedback, note: TESTFLIGHT_NOTE });
  } catch (err) {
    return fail(readableAscError(err));
  }
}

export async function toolGetSalesSummary(
  ctx: ShipVitalsContext,
  args: {
    appId: string;
    reportDate: string;
    frequency?: string;
    reportType?: string;
    vendorNumber?: string;
    sku?: string;
  },
): Promise<ToolResult> {
  const denied = assertConfiguredApp(ctx, args.appId);
  if (denied) return denied;
  const frequency = args.frequency ?? "DAILY";
  const reportType = args.reportType ?? "SALES";
  if (!SALES_FREQUENCIES.includes(frequency as (typeof SALES_FREQUENCIES)[number])) {
    return fail("frequency must be DAILY, WEEKLY, MONTHLY, or YEARLY.");
  }
  if (!SALES_TYPES.includes(reportType as (typeof SALES_TYPES)[number])) {
    return fail("reportType must be SALES, PREORDER, SUBSCRIPTION, SUBSCRIPTION_EVENT, or SUBSCRIBER.");
  }
  const dateError = salesDateError(frequency, args.reportDate);
  if (dateError) return fail(dateError);
  const vendor = args.vendorNumber ?? ctx.vendorNumber;
  if (!vendor) {
    return fail(
      "Set vendorNumber or SHIPVITALS_VENDOR_NUMBER. Sales reports are per vendor, and Apple will not guess it.",
    );
  }
  if (!/^\d{4,12}$/.test(vendor)) {
    return fail("vendorNumber should be the numeric vendor id from Payments and Financial Reports.");
  }
  try {
    const summary = await ctx.client.getSalesSummary({
      vendorNumber: vendor,
      frequency,
      reportDate: args.reportDate,
      reportType,
      ...(args.sku ? { sku: args.sku } : {}),
    });
    const notes = [...SALES_NOTES];
    if (args.sku && summary.rowCount === 0) {
      notes.push("No rows matched that SKU. The report itself was downloaded.");
    }
    return ok({ ...summary, appId: args.appId, notes });
  } catch (err) {
    return fail(readableAscError(err));
  }
}

export async function toolGetFinanceSummary(
  ctx: ShipVitalsContext,
  args: { appId: string; reportDate: string; regionCode: string; vendorNumber?: string },
): Promise<ToolResult> {
  const denied = assertConfiguredApp(ctx, args.appId);
  if (denied) return denied;
  if (!/^\d{4}-\d{2}$/.test(args.reportDate)) {
    return fail("Finance reportDate must be YYYY-MM.");
  }
  if (!/^[A-Za-z0-9]{2,3}$/.test(args.regionCode)) {
    return fail("regionCode must be an Apple financial region such as US, AU, GB, JP, or EU.");
  }
  const vendor = args.vendorNumber ?? ctx.vendorNumber;
  if (!vendor) {
    return fail("Set vendorNumber or SHIPVITALS_VENDOR_NUMBER. Finance reports are per vendor.");
  }
  if (!/^\d{4,12}$/.test(vendor)) {
    return fail("vendorNumber should be the numeric vendor id from Payments and Financial Reports.");
  }
  try {
    const summary = await ctx.client.getFinanceSummary({
      vendorNumber: vendor,
      regionCode: args.regionCode,
      reportDate: args.reportDate,
    });
    return ok({ ...summary, appId: args.appId, notes: FINANCE_NOTES });
  } catch (err) {
    return fail(readableAscError(err));
  }
}

export async function toolGetPerfSummary(ctx: ShipVitalsContext, args: { appId: string }): Promise<ToolResult> {
  const denied = assertConfiguredApp(ctx, args.appId);
  if (denied) return denied;
  try {
    const summary = await ctx.client.getPerfSummary(args.appId);
    return ok({
      ...summary,
      gaps: summary.gaps.length > 0 ? summary.gaps : PERF_GAPS,
      note:
        summary.requests.length === 0
          ? "No analytics report request exists for this app. ShipVitals does not create one. Crash rate and hang rate are not a live query."
          : "Report names are a catalogue of what Apple has been asked to generate. They are not crash or hang rates.",
    });
  } catch (err) {
    return fail(readableAscError(err));
  }
}

function averageRating(reviews: CustomerReview[]): number | null {
  if (reviews.length === 0) return null;
  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  return Math.round((total / reviews.length) * 100) / 100;
}

function countRatings(reviews: CustomerReview[]): Record<string, number> {
  const byRating: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const review of reviews) {
    const key = String(review.rating);
    if (byRating[key] != null) byRating[key] += 1;
  }
  return byRating;
}

function salesDateError(frequency: string, reportDate: string): string | null {
  if (frequency === "DAILY" || frequency === "WEEKLY") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) return `${frequency} reportDate must be YYYY-MM-DD.`;
    return null;
  }
  if (frequency === "MONTHLY") {
    if (!/^\d{4}-\d{2}$/.test(reportDate)) return "MONTHLY reportDate must be YYYY-MM.";
    return null;
  }
  if (frequency === "YEARLY") {
    if (!/^\d{4}$/.test(reportDate)) return "YEARLY reportDate must be YYYY.";
  }
  return null;
}
