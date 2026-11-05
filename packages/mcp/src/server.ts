import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { GooglePlayClient, tokenProviderFromEnv } from "./play/google.js";
import { MISSING_CREDENTIALS, MockPlayClient, UnavailablePlayClient } from "./play/mock.js";
import type { PlayClient } from "./play/types.js";
import {
  toolCheck16kb,
  toolGetPrelaunchReport,
  toolGetRatingsByCountry,
  toolGetRatingsSummary,
  toolGetRecentReviews,
  toolGetReviewHistory,
  toolGetUserTrends,
  toolGetVitals,
  toolGetVitalsBreakdown,
  toolListApps,
  toolListReleases,
  toolReplyToReview,
  type AppVitalsContext,
} from "./tools.js";

const packageName = z.string().min(1).describe("Android application id, for example com.example.app");

export function createAppVitalsServer(ctx: AppVitalsContext): McpServer {
  const server = new McpServer(
    { name: "appvitals", version: "0.1.0" },
    {
      instructions:
        "AppVitals reads Google Play reviews, releases, and vitals for the configured Android packages. reply_to_review sends a public reply. It needs confirm true and APPVITALS_ALLOW_WRITES=true.",
    },
  );

  server.registerTool(
    "list_apps",
    {
      description: "List the Android package names this server is allowed to read.",
      inputSchema: {},
    },
    async () => toolListApps(ctx),
  );

  server.registerTool(
    "get_recent_reviews",
    {
      description:
        "List recent Play reviews for one app. Google only returns reviews created or modified in the last 7 days. Filter with minStars and maxStars (inclusive). translationLanguage asks Google to translate the text.",
      inputSchema: {
        packageName,
        maxResults: z.number().int().min(1).max(100).optional().describe("Maximum reviews to return"),
        minStars: z.number().int().min(1).max(5).optional(),
        maxStars: z.number().int().min(1).max(5).optional(),
        translationLanguage: z
          .string()
          .optional()
          .describe("BCP-47 language code for Google to translate review text into"),
      },
    },
    async (args) => toolGetRecentReviews(ctx, args),
  );

  server.registerTool(
    "reply_to_review",
    {
      description:
        "WRITE ACTION: Post a public reply to a Play review. Requires confirm true, and the server environment APPVITALS_ALLOW_WRITES=true. Reply text is limited to 350 characters. Nothing is sent unless both guards pass.",
      inputSchema: {
        packageName,
        reviewId: z.string().min(1),
        replyText: z.string(),
        confirm: z.boolean().describe("Must be true or the reply is refused"),
      },
    },
    async (args) => toolReplyToReview(ctx, args),
  );

  server.registerTool(
    "get_ratings_summary",
    {
      description:
        "Count recent reviews by star rating and compute an average. Lifetime average is not exposed by the Play API, so this only covers the last 7 days of created or modified reviews.",
      inputSchema: { packageName },
    },
    async (args) => toolGetRatingsSummary(ctx, args),
  );

  server.registerTool(
    "get_vitals",
    {
      description:
        "Query Play Developer Reporting crash and ANR rates for the last N days, plus slow start and excessive wakeup when the API allows it. Flags user-perceived crash rate above 1.09% and user-perceived ANR rate above 0.47%.",
      inputSchema: {
        packageName,
        days: z.number().int().min(1).max(90).optional().describe("How many days back to query. Default 7."),
      },
    },
    async (args) => toolGetVitals(ctx, args),
  );

  server.registerTool(
    "get_vitals_breakdown",
    {
      description:
        "Same Android vitals family as get_vitals, sliced by one dimension: device (deviceModel), androidVersion (apiLevel), or country (countryCode). Uses the latest day in the window for each slice and flags Play bad-behaviour thresholds.",
      inputSchema: {
        packageName,
        dimension: z
          .enum(["device", "androidVersion", "country"])
          .describe("Breakdown: device, androidVersion, or country"),
        days: z.number().int().min(1).max(90).optional().describe("How many days back to query. Default 7."),
      },
    },
    async (args) => toolGetVitalsBreakdown(ctx, args),
  );

  server.registerTool(
    "get_prelaunch_report",
    {
      description:
        "Best-effort pre-launch context. Google does not expose pre-launch report findings on the public Play APIs, so this returns the latest non-production track version codes and a clear note that the lab report itself is Console-only.",
      inputSchema: { packageName },
    },
    async (args) => toolGetPrelaunchReport(ctx, args),
  );

  server.registerTool(
    "get_user_trends",
    {
      description:
        "Daily active-user trend from Play Developer Reporting vitals (distinctUsers). Install and uninstall counts are not on androidpublisher or playdeveloperreporting; the tool says so instead of inventing them.",
      inputSchema: {
        packageName,
        days: z.number().int().min(1).max(90).optional().describe("How many days back to query. Default 28."),
      },
    },
    async (args) => toolGetUserTrends(ctx, args),
  );

  server.registerTool(
    "get_ratings_by_country",
    {
      description:
        "Sibling of get_ratings_summary. Groups the last 7 days of reviews by reviewerLanguage. The reviews API has no country field, so country-level lifetime ratings are not available with typical Play Console service-account scopes.",
      inputSchema: {
        packageName,
        countryCode: z
          .string()
          .optional()
          .describe("Not supported. The reviews API has no country field; the tool will refuse this filter."),
      },
    },
    async (args) => toolGetRatingsByCountry(ctx, args),
  );

  server.registerTool(
    "list_releases",
    {
      description:
        "List Play tracks and releases (status, version codes, user fraction). Opens a temporary edit and always deletes it.",
      inputSchema: { packageName },
    },
    async (args) => toolListReleases(ctx, args),
  );

  server.registerTool(
    "check_16kb_readiness",
    {
      description:
        "Best-effort 16 KB page-size check. Play does not expose ELF alignment, so this returns the latest version codes from the bundle list and a manual checklist. The edit is always deleted.",
      inputSchema: { packageName },
    },
    async (args) => toolCheck16kb(ctx, args),
  );

  if (ctx.reviewHistory) {
    server.registerTool(
      "get_review_history",
      {
        description:
          "Read review snapshots stored by hosted AppVitals. Unlike get_recent_reviews, this can go back further than the 7 days Google keeps on the reviews API. since is an ISO timestamp. maxStars filters inclusive.",
        inputSchema: {
          packageName,
          since: z.string().optional().describe("ISO timestamp. Only reviews at or after this time."),
          maxStars: z.number().int().min(1).max(5).optional(),
        },
      },
      async (args) => toolGetReviewHistory(ctx, args),
    );
  }

  return server;
}

export function createPlayClientFromEnv(env: NodeJS.ProcessEnv = process.env): PlayClient {
  const config = loadConfig(env);
  if (config.mock) return new MockPlayClient();
  if (!env.GOOGLE_APPLICATION_CREDENTIALS && !env.APPVITALS_SERVICE_ACCOUNT_JSON) {
    return new UnavailablePlayClient(MISSING_CREDENTIALS);
  }
  return new GooglePlayClient({
    tokenProvider: {
      async getAccessToken() {
        const provider = await tokenProviderFromEnv(env);
        return provider.getAccessToken();
      },
    },
  });
}

export function createServerFromEnv(env: NodeJS.ProcessEnv = process.env): McpServer {
  const config = loadConfig(env);
  return createAppVitalsServer({
    client: createPlayClientFromEnv(env),
    packages: config.packages,
    allowWrites: config.allowWrites,
  });
}
