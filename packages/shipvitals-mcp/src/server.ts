import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { RESPONSE_BODY_MAX } from "./gaps.js";
import { AppleAscClient } from "./asc/apple.js";
import { MISSING_CREDENTIALS, MockAscClient, UnavailableAscClient } from "./asc/mock.js";
import type { AscClient } from "./asc/types.js";
import {
  toolGetAppStatus,
  toolGetFinanceSummary,
  toolGetPerfSummary,
  toolGetSalesSummary,
  toolGetTestFlightFeedback,
  toolListApps,
  toolListReviews,
  toolListTestFlightBuilds,
  toolReplyToReview,
  type ShipVitalsContext,
} from "./tools.js";

const appId = z
  .string()
  .regex(/^\d{6,20}$/)
  .describe("Numeric Apple app id from App Store Connect, not the bundle id");

export function createShipVitalsServer(ctx: ShipVitalsContext): McpServer {
  const server = new McpServer(
    { name: "shipvitals", version: "0.1.0" },
    {
      instructions:
        "ShipVitals reads App Store Connect for the configured Apple app ids. reply_to_review is a public reply. It needs confirm true and SHIPVITALS_ALLOW_WRITES=true. Sales and finance reports are vendor-wide files, not per-app JSON. Crash and hang rates are not a live query.",
    },
  );

  server.registerTool(
    "list_apps",
    {
      description: "List the Apple app ids this server is allowed to read.",
      inputSchema: {},
    },
    async () => toolListApps(ctx),
  );

  server.registerTool(
    "list_reviews",
    {
      description:
        "List App Store customer reviews for one app. rating is a single star value because Apple's filter is exact, not a range. The average in the result is only these rows, not the public App Store rating.",
      inputSchema: {
        appId,
        limit: z.number().int().min(1).max(200).optional().describe("Maximum reviews to return. Default 50."),
        rating: z.number().int().min(1).max(5).optional().describe("Exact star rating"),
        territory: z
          .string()
          .regex(/^[A-Za-z]{2,3}$/)
          .optional()
          .describe("Storefront territory, for example AUS or USA"),
      },
    },
    async (args) => toolListReviews(ctx, args),
  );

  server.registerTool(
    "reply_to_review",
    {
      description: `WRITE ACTION: Post a public reply to an App Store review. Requires confirm true, and the server environment SHIPVITALS_ALLOW_WRITES=true. Reply text is limited to ${RESPONSE_BODY_MAX} characters. Nothing is sent unless both guards pass.`,
      inputSchema: {
        appId,
        reviewId: z.string().min(1),
        responseBody: z.string(),
        confirm: z.boolean().describe("Must be true or the reply is refused"),
      },
    },
    async (args) => toolReplyToReview(ctx, args),
  );

  server.registerTool(
    "get_app_status",
    {
      description:
        "Read the app record, the latest App Store versions (state, platform, release type), and phased release when one exists. A missing phased release is normal.",
      inputSchema: { appId },
    },
    async (args) => toolGetAppStatus(ctx, args),
  );

  server.registerTool(
    "list_testflight_builds",
    {
      description:
        "List recent TestFlight builds for one app: version, upload time, processing state, expiry, and minimum OS. This is not the App Store release.",
      inputSchema: {
        appId,
        limit: z.number().int().min(1).max(50).optional().describe("Maximum builds to return. Default 10."),
      },
    },
    async (args) => toolListTestFlightBuilds(ctx, args),
  );

  server.registerTool(
    "get_testflight_feedback",
    {
      description:
        "Summarise TestFlight crash and screenshot feedback for recent builds. This is tester feedback, not the production crash rate. Tester emails are omitted.",
      inputSchema: {
        appId,
        limit: z.number().int().min(1).max(20).optional().describe("Maximum feedback rows of each kind. Default 10."),
      },
    },
    async (args) => toolGetTestFlightFeedback(ctx, args),
  );

  if (ctx.salesReports !== false) {
    server.registerTool(
      "get_sales_summary",
      {
        description:
          "Download a Sales and Trends SUMMARY report and total units and developer proceeds. The file is vendor-wide, not limited to appId. appId is only the allow-list check. The vendor number is SHIPVITALS_VENDOR_NUMBER. A caller-supplied vendorNumber is refused and is not sent to Apple. DAILY and WEEKLY dates are YYYY-MM-DD, MONTHLY is YYYY-MM, YEARLY is YYYY. A 404 means Apple has not published that date.",
        inputSchema: {
          appId,
          reportDate: z.string().min(4).describe("DAILY/WEEKLY YYYY-MM-DD, MONTHLY YYYY-MM, YEARLY YYYY"),
          frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]).optional(),
          reportType: z.enum(["SALES", "PREORDER", "SUBSCRIPTION", "SUBSCRIPTION_EVENT", "SUBSCRIBER"]).optional(),
          vendorNumber: z
            .string()
            .optional()
            .describe("Refused. Set SHIPVITALS_VENDOR_NUMBER on the server. This value is never sent to Apple."),
          sku: z.string().min(1).max(200).optional().describe("Keep rows for this SKU only"),
        },
      },
      async (args) => toolGetSalesSummary(ctx, args),
    );

    server.registerTool(
      "get_finance_summary",
      {
        description:
          "Download one monthly finance report for an Apple financial region and total quantity and extended partner share. Vendor-wide, not per app. The vendor number is SHIPVITALS_VENDOR_NUMBER. A caller-supplied vendorNumber is refused and is not sent to Apple. regionCode is US, AU, GB, JP, EU, and similar, not every storefront. A 404 means that month is not published. No payout date and no account balance.",
        inputSchema: {
          appId,
          reportDate: z.string().regex(/^\d{4}-\d{2}$/).describe("YYYY-MM"),
          regionCode: z.string().regex(/^[A-Za-z0-9]{2,3}$/),
          vendorNumber: z
            .string()
            .optional()
            .describe("Refused. Set SHIPVITALS_VENDOR_NUMBER on the server. This value is never sent to Apple."),
        },
      },
      async (args) => toolGetFinanceSummary(ctx, args),
    );
  }

  server.registerTool(
    "get_perf_summary",
    {
      description:
        "List existing Analytics Report requests and their report names. Apple has no synchronous crash rate or hang rate API. This tool does not create a report request, does not download the CSV, and does not invent rates. TestFlight crashes and Xcode Organizer are separate and are not included as numbers.",
      inputSchema: { appId },
    },
    async (args) => toolGetPerfSummary(ctx, args),
  );

  return server;
}

export function createAscClientFromEnv(env: NodeJS.ProcessEnv = process.env): AscClient {
  const config = loadConfig(env);
  if (config.mock) return new MockAscClient();
  if (!config.issuerId || !config.keyId || !config.privateKey) {
    return new UnavailableAscClient(MISSING_CREDENTIALS);
  }
  return new AppleAscClient({
    issuerId: config.issuerId,
    keyId: config.keyId,
    privateKeyPem: config.privateKey,
  });
}

export function createServerFromEnv(env: NodeJS.ProcessEnv = process.env): McpServer {
  const config = loadConfig(env);
  // The CLI uses this process's own App Store Connect key, so sales reports stay on.
  // Hosted shared-key serving sets salesReports false. See hosted/lib/shipvitals-host.ts.
  return createShipVitalsServer({
    client: createAscClientFromEnv(env),
    appIds: config.appIds,
    allowWrites: config.allowWrites,
    vendorNumber: config.vendorNumber,
  });
}
