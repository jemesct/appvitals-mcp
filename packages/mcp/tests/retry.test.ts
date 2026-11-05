import { describe, expect, it } from "vitest";
import { PlayApiError, parseRetryAfter, readablePlayError } from "../src/errors.js";
import { GooglePlayClient } from "../src/play/google.js";
import { TokenBucket } from "../src/rate-limit.js";
import { withRetry } from "../src/retry.js";

describe("retry and errors", () => {
  it("retries 429 and 5xx with backoff, and honours Retry-After", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const value = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new PlayApiError(503, "unavailable", null);
        return "ok";
      },
      { sleep: async (ms) => { sleeps.push(ms); }, random: () => 0 },
    );
    expect(value).toBe("ok");
    expect(calls).toBe(3);
    expect(sleeps).toEqual([200, 400]);

    const retryAfterSleeps: number[] = [];
    let attempt = 0;
    await withRetry(
      async () => {
        attempt += 1;
        if (attempt === 1) throw new PlayApiError(429, "slow down", 2500);
        return "later";
      },
      { sleep: async (ms) => { retryAfterSleeps.push(ms); }, random: () => 1 },
    );
    expect(retryAfterSleeps).toEqual([2500]);

    let authCalls = 0;
    await expect(
      withRetry(
        async () => {
          authCalls += 1;
          throw new PlayApiError(401, "nope", null);
        },
        { sleep: async () => undefined, maxAttempts: 4 },
      ),
    ).rejects.toBeInstanceOf(PlayApiError);
    expect(authCalls).toBe(1);
  });

  it("stops after 3 retries", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new PlayApiError(500, "still down", null);
        },
        { sleep: async () => undefined, random: () => 0 },
      ),
    ).rejects.toMatchObject({ status: 500 });
    expect(calls).toBe(4);
  });

  it("parses Retry-After seconds and HTTP dates", () => {
    expect(parseRetryAfter("2")).toBe(2000);
    const now = Date.parse("2026-11-04T00:00:00.000Z");
    expect(parseRetryAfter("Wed, 04 Nov 2026 00:00:03 GMT", now)).toBe(3000);
  });

  it("maps 404 and hides stacks", () => {
    const message = readablePlayError(new PlayApiError(404, "not found\n    at boom (/app.js:1:1)", null, "com.example.app"));
    expect(message).toContain("com.example.app");
    expect(message).not.toContain("app.js");
    const permission = readablePlayError(new PlayApiError(401, "unauthorized", null));
    expect(permission).toContain("Users and permissions");
  });
});

describe("Google client", () => {
  it("sends the bearer token, retries, and surfaces a 403 as a permission error", async () => {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    let attempt = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({ url, authorization: headers.get("authorization") });
      if (url.includes("/reviews")) {
        attempt += 1;
        if (attempt === 1) {
          return new Response("nope", { status: 503, headers: { "retry-after": "0" } });
        }
        return new Response(JSON.stringify({ reviews: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: { message: "The caller does not have permission" } }), {
        status: 403,
      });
    };
    const client = new GooglePlayClient({
      tokenProvider: {
        async getAccessToken() {
          return "test-token";
        },
      },
      fetchImpl,
      rateLimiter: new TokenBucket({ capacity: 100, refillPerSecond: 100, sleep: async () => undefined }),
      retry: { sleep: async () => undefined, random: () => 0 },
    });
    await client.listReviews({ packageName: "com.example.app", translationLanguage: "fr" });
    expect(calls[0]?.url).toContain("translationLanguage=fr");
    expect(calls[0]?.authorization).toBe("Bearer test-token");
    expect(attempt).toBe(2);
    await expect(client.listTracks("com.example.app", "edit")).rejects.toMatchObject({ status: 403 });
  });
});

describe("rate limiter", () => {
  it("waits until a token is refilled", async () => {
    let now = 0;
    const sleeps: number[] = [];
    const bucket = new TokenBucket({
      capacity: 1,
      refillPerSecond: 10,
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    });
    await bucket.acquire();
    await bucket.acquire();
    expect(sleeps[0]).toBeGreaterThan(0);
  });
});
