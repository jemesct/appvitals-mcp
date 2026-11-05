import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MockAscClient } from "../src/asc/mock.js";
import { AscApiError } from "../src/errors.js";
import { RESPONSE_BODY_MAX } from "../src/gaps.js";
import { createShipVitalsServer } from "../src/server.js";
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
} from "../src/tools.js";
import type { AscClient } from "../src/asc/types.js";

function ctx(partial: Partial<ShipVitalsContext> = {}): ShipVitalsContext {
  return {
    client: partial.client ?? new MockAscClient(),
    appIds: partial.appIds ?? ["1234567890"],
    allowWrites: partial.allowWrites ?? false,
    vendorNumber: partial.vendorNumber === undefined ? "80012345" : partial.vendorNumber,
  };
}

function text(result: { content: Array<{ text: string }>; isError?: boolean }): string {
  return result.content.map((item) => item.text).join("\n");
}

describe("shipvitals tools", () => {
  it("lists configured app ids", async () => {
    const result = await toolListApps(ctx({ appIds: ["1234567890", "1234567891"] }));
    expect(result.isError).toBeUndefined();
    expect(text(result)).toContain("1234567891");
    expect(text(result)).toContain("one App Store Connect team");
  });

  it("filters reviews and says the average is not the App Store rating", async () => {
    const low = await toolListReviews(ctx(), { appId: "1234567890", rating: 2, territory: "AUS" });
    expect(low.isError).toBeUndefined();
    expect(text(low)).toContain("Crashes on launch");
    expect(text(low)).not.toContain("Solid update");
    expect(text(low)).toContain("not the public App Store rating");
  });

  it("refuses an app id that is not configured", async () => {
    const result = await toolGetAppStatus(ctx(), { appId: "9999999999" });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("not configured");
  });

  it("refuses writes unless confirm and SHIPVITALS_ALLOW_WRITES are both set", async () => {
    const client = new MockAscClient();
    const missingConfirm = await toolReplyToReview(ctx({ client, allowWrites: true }), {
      appId: "1234567890",
      reviewId: "rev-1",
      responseBody: "Thanks",
      confirm: false,
    });
    expect(missingConfirm.isError).toBe(true);
    expect(text(missingConfirm)).toContain("confirm: true");
    const missingEnv = await toolReplyToReview(ctx({ client, allowWrites: false }), {
      appId: "1234567890",
      reviewId: "rev-1",
      responseBody: "Thanks",
      confirm: true,
    });
    expect(missingEnv.isError).toBe(true);
    expect(text(missingEnv)).toContain("SHIPVITALS_ALLOW_WRITES=true");
    expect(client.replies).toHaveLength(0);
    const tooLong = await toolReplyToReview(ctx({ client, allowWrites: true }), {
      appId: "1234567890",
      reviewId: "rev-1",
      responseBody: "x".repeat(RESPONSE_BODY_MAX + 1),
      confirm: true,
    });
    expect(tooLong.isError).toBe(true);
    expect(text(tooLong)).toContain(String(RESPONSE_BODY_MAX));
    const sent = await toolReplyToReview(ctx({ client, allowWrites: true }), {
      appId: "1234567890",
      reviewId: "rev-1",
      responseBody: "Thanks, we are looking at the launch crash.",
      confirm: true,
    });
    expect(sent.isError).toBeUndefined();
    expect(client.replies).toHaveLength(1);
  });

  it("returns version state, TestFlight builds, and tester feedback", async () => {
    const status = await toolGetAppStatus(ctx(), { appId: "1234567890" });
    expect(text(status)).toContain("READY_FOR_SALE");
    expect(text(status)).toContain("COMPLETE");
    expect(text(status)).toContain("null phasedRelease");
    const builds = await toolListTestFlightBuilds(ctx(), { appId: "1234567890" });
    expect(text(builds)).toContain("VALID");
    expect(text(builds)).toContain("not the App Store release");
    const feedback = await toolGetTestFlightFeedback(ctx(), { appId: "1234567890" });
    expect(text(feedback)).toContain("Closed itself on the paywall.");
    expect(text(feedback)).toContain("not production crash rates");
    expect(text(feedback)).not.toContain("@");
  });

  it("summarises vendor sales and finance, and explains a missing vendor number", async () => {
    const sales = await toolGetSalesSummary(ctx(), {
      appId: "1234567890",
      reportDate: "2026-11-02",
      sku: "example-ios",
    });
    expect(sales.isError).toBeUndefined();
    expect(text(sales)).toContain("whole vendor number");
    expect(text(sales)).toContain("example-ios");
    expect(text(sales)).not.toContain("example-ios-plus");
    const missingVendor = await toolGetFinanceSummary(ctx({ vendorNumber: null }), {
      appId: "1234567890",
      reportDate: "2026-10",
      regionCode: "AU",
    });
    expect(missingVendor.isError).toBe(true);
    expect(text(missingVendor)).toContain("SHIPVITALS_VENDOR_NUMBER");
    const finance = await toolGetFinanceSummary(ctx(), {
      appId: "1234567890",
      reportDate: "2026-10",
      regionCode: "au",
    });
    expect(text(finance)).toContain("28.5");
    expect(text(finance)).toContain("not per app");
    expect(text(finance)).toContain("payout date");
  });

  it("lists analytics report requests and does not invent a crash rate", async () => {
    const result = await toolGetPerfSummary(ctx(), { appId: "1234567890" });
    const body = text(result);
    expect(result.isError).toBeUndefined();
    expect(body).toContain("PERFORMANCE");
    expect(body).toContain("no synchronous crash rate");
    expect(body).toContain("does not invent rates");
    expect(body).toContain("Xcode Organizer");
    expect(body).not.toContain("crashRate");
  });

  it("maps permission errors without a stack", async () => {
    const base = new MockAscClient();
    const client: AscClient = {
      ...base,
      listReviews: () => {
        throw new AscApiError(403, "Forbidden\n    at handler (/app/index.js:3:2)");
      },
      replyToReview: (input) => base.replyToReview(input),
      getAppStatus: (appId) => base.getAppStatus(appId),
      listTestFlightBuilds: (input) => base.listTestFlightBuilds(input),
      getTestFlightFeedback: (input) => base.getTestFlightFeedback(input),
      getSalesSummary: (input) => base.getSalesSummary(input),
      getFinanceSummary: (input) => base.getFinanceSummary(input),
      getPerfSummary: (appId) => base.getPerfSummary(appId),
    };
    const result = await toolListReviews(ctx({ client }), { appId: "1234567890" });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("Sales reports");
    expect(text(result)).not.toContain("index.js");
  });

  it("calls every tool over the MCP server in mock mode", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createShipVitalsServer(ctx({ allowWrites: true }));
    await server.connect(serverTransport);
    const client = new Client({ name: "shipvitals-mock", version: "0.0.0" });
    await client.connect(clientTransport);
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name).sort();
    expect(names).toEqual([
      "get_app_status",
      "get_finance_summary",
      "get_perf_summary",
      "get_sales_summary",
      "get_testflight_feedback",
      "list_apps",
      "list_reviews",
      "list_testflight_builds",
      "reply_to_review",
    ]);
    const reply = listed.tools.find((tool) => tool.name === "reply_to_review");
    expect(reply?.description?.startsWith("WRITE ACTION:")).toBe(true);
    const calls: Array<[string, Record<string, unknown>]> = [
      ["list_apps", {}],
      ["list_reviews", { appId: "1234567890", limit: 5, rating: 2 }],
      ["get_app_status", { appId: "1234567890" }],
      ["list_testflight_builds", { appId: "1234567890", limit: 5 }],
      ["get_testflight_feedback", { appId: "1234567890", limit: 5 }],
      ["get_sales_summary", { appId: "1234567890", reportDate: "2026-11-02", frequency: "DAILY" }],
      ["get_finance_summary", { appId: "1234567890", reportDate: "2026-10", regionCode: "AU" }],
      ["get_perf_summary", { appId: "1234567890" }],
      [
        "reply_to_review",
        {
          appId: "1234567890",
          reviewId: "rev-1",
          responseBody: "Thanks, we are looking at the launch crash.",
          confirm: true,
        },
      ],
    ];
    for (const [name, args] of calls) {
      const result = await client.callTool({ name, arguments: args });
      const body = Array.isArray(result.content)
        ? result.content.map((item) => ("text" in item ? item.text : "")).join("\n")
        : "";
      expect(result.isError, `${name}: ${body}`).not.toBe(true);
      expect(body.length).toBeGreaterThan(0);
    }
    await client.close();
    await server.close();
  });
});
