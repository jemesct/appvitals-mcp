import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { PAGE_SIZE_CHECKLIST } from "../src/checklist.js";
import { PlayApiError } from "../src/errors.js";
import { MockPlayClient } from "../src/play/mock.js";
import { parseMetricRows, parseReviews, parseTracks } from "../src/play/parse.js";
import { createAppVitalsServer } from "../src/server.js";
import {
  toolCheck16kb,
  toolGetRatingsSummary,
  toolGetRecentReviews,
  toolGetVitals,
  toolListApps,
  toolListReleases,
  toolReplyToReview,
  type AppVitalsContext,
} from "../src/tools.js";
import type { PlayClient } from "../src/play/types.js";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(fixtures, name), "utf8"));
}

function fakeClient(partial: Partial<PlayClient>): PlayClient {
  const base = new MockPlayClient();
  return {
    listReviews: (input) => base.listReviews(input),
    replyToReview: (input) => base.replyToReview(input),
    queryMetricSet: (input) => base.queryMetricSet(input),
    insertEdit: (packageName) => base.insertEdit(packageName),
    listTracks: (packageName, editId) => base.listTracks(packageName, editId),
    deleteEdit: (packageName, editId) => base.deleteEdit(packageName, editId),
    listBundles: (packageName, editId) => base.listBundles(packageName, editId),
    ...partial,
  };
}

function ctx(partial: Partial<AppVitalsContext> = {}): AppVitalsContext {
  return {
    client: partial.client ?? new MockPlayClient(),
    packages: partial.packages ?? ["com.example.app"],
    allowWrites: partial.allowWrites ?? false,
    ...(partial.reviewHistory ? { reviewHistory: partial.reviewHistory } : {}),
  };
}

function text(result: { content: Array<{ text: string }>; isError?: boolean }): string {
  return result.content.map((item) => item.text).join("\n");
}

describe("fixtures", () => {
  it("parses reviews, metrics, and tracks", () => {
    const reviews = parseReviews(readFixture("reviews.json"));
    expect(reviews.reviews[0]?.starRating).toBe(1);
    expect(reviews.nextPageToken).toBe("page-2");
    const metrics = parseMetricRows(readFixture("crash-metrics.json"));
    expect(metrics[0]?.date).toBe("2026-11-01");
    expect(metrics[0]?.metrics.userPerceivedCrashRate).toBe(0.02);
    const tracks = parseTracks(readFixture("tracks.json"));
    expect(tracks[0]?.releases[0]?.versionCodes).toEqual([41, 42]);
    expect(tracks[0]?.releases[0]?.userFraction).toBe(0.2);
  });
});

describe("tools", () => {
  it("lists configured apps", async () => {
    const result = await toolListApps(ctx({ packages: ["com.a", "com.b"] }));
    expect(result.isError).toBeUndefined();
    expect(text(result)).toContain("com.a");
  });

  it("filters reviews by stars and passes translation", async () => {
    const client = new MockPlayClient();
    const low = await toolGetRecentReviews(ctx({ client }), {
      packageName: "com.example.app",
      maxStars: 2,
      translationLanguage: "de",
    });
    expect(low.isError).toBeUndefined();
    expect(text(low)).toContain("[de] Crashes on launch");
    expect(text(low)).not.toContain("Solid update");
    expect(text(low)).toContain("last 7 days");
  });

  it("paginates reviews before applying the star filter", async () => {
    const client = fakeClient({
      async listReviews(input) {
        if (!input.pageToken) {
          return {
            reviews: [
              {
                reviewId: "a",
                authorName: "A",
                text: "bad",
                starRating: 1,
                lastModified: "2026-11-01T00:00:00.000Z",
              },
            ],
            nextPageToken: "next",
          };
        }
        return {
          reviews: [
            {
              reviewId: "b",
              authorName: "B",
              text: "worse",
              starRating: 1,
              lastModified: "2026-11-02T00:00:00.000Z",
            },
          ],
        };
      },
    });
    const result = await toolGetRecentReviews(ctx({ client }), {
      packageName: "com.example.app",
      maxResults: 2,
      maxStars: 1,
    });
    expect(text(result)).toContain("worse");
  });

  it("refuses writes unless confirm and APPVITALS_ALLOW_WRITES are both set", async () => {
    const client = new MockPlayClient();
    const missingConfirm = await toolReplyToReview(ctx({ client, allowWrites: true }), {
      packageName: "com.example.app",
      reviewId: "rev-1",
      replyText: "Thanks",
      confirm: false,
    });
    expect(missingConfirm.isError).toBe(true);
    expect(text(missingConfirm)).toContain("confirm: true");
    const missingEnv = await toolReplyToReview(ctx({ client, allowWrites: false }), {
      packageName: "com.example.app",
      reviewId: "rev-1",
      replyText: "Thanks",
      confirm: true,
    });
    expect(missingEnv.isError).toBe(true);
    expect(text(missingEnv)).toContain("APPVITALS_ALLOW_WRITES=true");
    expect(client.replies).toHaveLength(0);
    const tooLong = await toolReplyToReview(ctx({ client, allowWrites: true }), {
      packageName: "com.example.app",
      reviewId: "rev-1",
      replyText: "x".repeat(351),
      confirm: true,
    });
    expect(tooLong.isError).toBe(true);
    expect(text(tooLong)).toContain("350");
    const sent = await toolReplyToReview(ctx({ client, allowWrites: true }), {
      packageName: "com.example.app",
      reviewId: "rev-1",
      replyText: "x".repeat(350),
      confirm: true,
    });
    expect(sent.isError).toBeUndefined();
    expect(client.replies).toHaveLength(1);
  });

  it("summarises ratings and says lifetime average is not in the API", async () => {
    const result = await toolGetRatingsSummary(ctx(), { packageName: "com.example.app" });
    expect(text(result)).toContain("Lifetime average");
    expect(text(result)).toContain('"average": 3.5');
  });

  it("flags vitals over the bad-behaviour threshold and keeps going if optional metrics fail", async () => {
    const base = new MockPlayClient();
    const client = fakeClient({
      async queryMetricSet(input) {
        if (input.metricSet === "slowStartRateMetricSet") {
          throw new PlayApiError(404, "not found", null, input.packageName);
        }
        if (input.metricSet === "crashRateMetricSet") {
          return [{ date: "2026-11-03", metrics: { userPerceivedCrashRate: 0.02, crashRate: 0.01, distinctUsers: 10 } }];
        }
        return base.queryMetricSet(input);
      },
    });
    const result = await toolGetVitals(ctx({ client }), { packageName: "com.example.app", days: 7 });
    expect(result.isError).toBeUndefined();
    expect(text(result)).toContain("userPerceivedCrashRate");
    expect(text(result)).toContain("slowStartRate was not available");
    expect(text(result)).toContain("1.09%");
  });

  it("deletes the edit even when listing tracks fails", async () => {
    const deleted: string[] = [];
    const client = fakeClient({
      async insertEdit() {
        return { editId: "edit-9" };
      },
      async listTracks() {
        throw new PlayApiError(500, "boom", null, "com.example.app");
      },
      async deleteEdit(_packageName, editId) {
        deleted.push(editId);
      },
    });
    const result = await toolListReleases(ctx({ client }), { packageName: "com.example.app" });
    expect(result.isError).toBe(true);
    expect(deleted).toEqual(["edit-9"]);
    expect(text(result)).not.toContain("    at ");
  });

  it("returns version codes and the 16 KB checklist", async () => {
    const result = await toolCheck16kb(ctx(), { packageName: "com.example.app" });
    const body = text(result);
    expect(result.isError).toBeUndefined();
    expect(body).toContain("42");
    for (const line of PAGE_SIZE_CHECKLIST) {
      expect(body).toContain(line);
    }
    expect(body).toContain("check Play Console for your app's deadline");
    expect(body).toContain("zipalign -c -P 16 -v 4 app.apk");
  });

  it("maps permission errors to fix steps without a stack", async () => {
    const client = fakeClient({
      async listReviews() {
        throw new PlayApiError(403, "The caller does not have permission\n    at Object.handler (/app/index.js:10:5)", null, "com.example.app");
      },
    });
    const result = await toolGetRecentReviews(ctx({ client }), { packageName: "com.example.app" });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("service account");
    expect(text(result)).toContain("View app quality information");
    expect(text(result)).not.toContain("index.js");
  });

  it("registers every open source tool and the hosted history tool when configured", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createAppVitalsServer(
      ctx({
        allowWrites: true,
        reviewHistory: async () => [{ reviewId: "old", stars: 1 }],
      }),
    );
    await server.connect(serverTransport);
    const client = new Client({ name: "unit", version: "0.0.0" });
    await client.connect(clientTransport);
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name).sort();
    expect(names).toEqual([
      "check_16kb_readiness",
      "get_ratings_summary",
      "get_recent_reviews",
      "get_review_history",
      "get_vitals",
      "list_apps",
      "list_releases",
      "reply_to_review",
    ]);
    const reply = listed.tools.find((tool) => tool.name === "reply_to_review");
    expect(reply?.description?.startsWith("WRITE ACTION:")).toBe(true);
    const history = await client.callTool({
      name: "get_review_history",
      arguments: { packageName: "com.example.app", maxStars: 2 },
    });
    expect(history.isError).not.toBe(true);
    await client.close();
    await server.close();
  });
});
