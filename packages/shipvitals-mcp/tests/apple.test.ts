import { generateKeyPairSync } from "node:crypto";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { AppleAscClient } from "../src/asc/apple.js";
import { readableAscError } from "../src/errors.js";

function pem(): string {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
}

function client(fetchImpl: typeof fetch): AppleAscClient {
  return new AppleAscClient({
    issuerId: "issuer-1",
    keyId: "KEY123",
    privateKeyPem: pem(),
    fetchImpl,
    now: () => new Date("2026-11-04T00:00:00.000Z"),
  });
}

describe("apple client", () => {
  it("follows an App Store Connect next link and refuses any other host", async () => {
    const seen: string[] = [];
    const asc = client(async (url) => {
      seen.push(String(url));
      if (seen.length === 1) {
        return new Response(
          JSON.stringify({
            data: [
              {
                type: "customerReviews",
                id: "rev-1",
                attributes: { rating: 1, title: "First", body: "No", territory: "AUS", createdDate: "2026-11-01T00:00:00Z" },
              },
            ],
            links: { next: "https://api.appstoreconnect.apple.com/v1/apps/1234567890/customerReviews?cursor=2" },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              type: "customerReviews",
              id: "rev-2",
              attributes: { rating: 4, title: "Second", body: "Yes", territory: "USA", createdDate: "2026-11-02T00:00:00Z" },
            },
          ],
        }),
        { status: 200 },
      );
    });
    const reviews = await asc.listReviews({ appId: "1234567890", limit: 10 });
    expect(reviews.map((review) => review.id)).toEqual(["rev-1", "rev-2"]);
    expect(seen[1]).toContain("cursor=2");

    const hostile = client(async () => {
      return new Response(
        JSON.stringify({
          data: [{ type: "customerReviews", id: "rev-1", attributes: { rating: 1 } }],
          links: { next: "https://evil.example/collect" },
        }),
        { status: 200 },
      );
    });
    await expect(hostile.listReviews({ appId: "1234567890" })).rejects.toThrow(/api.appstoreconnect.apple.com/);
  });

  it("maps a 403 to role guidance and does not include a stack", async () => {
    const asc = client(async () => {
      return new Response(
        JSON.stringify({
          errors: [{ title: "Forbidden", detail: "The caller does not have permission\n    at Object.handler (/app/index.js:10:5)" }],
        }),
        { status: 403 },
      );
    });
    await expect(asc.listReviews({ appId: "1234567890" })).rejects.toThrow(/Forbidden/);
    try {
      await asc.listReviews({ appId: "1234567890" });
    } catch (err) {
      const text = readableAscError(err);
      expect(text).toContain("Customer Support");
      expect(text).toContain("Finance");
      expect(text).not.toContain("index.js");
    }
  });

  it("gunzips a sales report", async () => {
    const tsv = "SKU\tTitle\tUnits\tDeveloper Proceeds\tCurrency of Proceeds\nexample-ios\tExample\t4\t2.80\tAUD\n";
    const asc = client(async (url, init) => {
      const decoded = decodeURIComponent(String(url));
      expect(decoded).toContain("filter[vendorNumber]=80012345");
      expect(decoded).toContain("filter[reportSubType]=SUMMARY");
      const headers = new Headers(init?.headers);
      expect(headers.get("accept")).toBe("application/a-gzip");
      expect(headers.get("authorization")?.startsWith("Bearer ")).toBe(true);
      return new Response(gzipSync(Buffer.from(tsv)), { status: 200 });
    });
    const summary = await asc.getSalesSummary({
      vendorNumber: "80012345",
      frequency: "DAILY",
      reportDate: "2026-11-02",
      reportType: "SALES",
    });
    expect(summary.totals.units).toBe(4);
    expect(summary.totals.developerProceeds).toBe(2.8);
    expect(summary.currency).toBe("AUD");
  });

  it("retries a 500 sales download once", async () => {
    const tsv = "SKU\tUnits\tDeveloper Proceeds\tCurrency of Proceeds\nexample-ios\t1\t0.70\tAUD\n";
    let calls = 0;
    const asc = client(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("upstream", { status: 500, headers: { "retry-after": "0" } });
      }
      return new Response(gzipSync(Buffer.from(tsv)), { status: 200 });
    });
    const summary = await asc.getSalesSummary({
      vendorNumber: "80012345",
      frequency: "DAILY",
      reportDate: "2026-11-02",
      reportType: "SALES",
    });
    expect(calls).toBe(2);
    expect(summary.totals.units).toBe(1);
  });

  it("strips a private key if one is ever echoed in an error", () => {
    const text = readableAscError(new Error("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"));
    expect(text).toBe("The request failed.");
  });
});
