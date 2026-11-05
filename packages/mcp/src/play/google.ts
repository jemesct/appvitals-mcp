import { PlayApiError, parseRetryAfter } from "../errors.js";
import { getProcessRateLimiter, type TokenBucket } from "../rate-limit.js";
import { withRetry, type RetryOptions } from "../retry.js";
import {
  parseBundles,
  parseMetricRows,
  parseReviews,
  parseTracks,
  timelineSpec,
  parseDailyFreshness,
} from "./parse.js";
import type {
  BundleInfo,
  DailyMetric,
  ListReviewsInput,
  ListReviewsResult,
  PlayClient,
  QueryMetricInput,
  ReplyInput,
  TrackInfo,
} from "./types.js";

export const PLAY_SCOPES = [
  "https://www.googleapis.com/auth/androidpublisher",
  "https://www.googleapis.com/auth/playdeveloperreporting",
];

const PUBLISHER = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";
const REPORTING = "https://playdeveloperreporting.googleapis.com/v1beta1/apps";

export interface TokenProvider {
  getAccessToken(): Promise<string>;
}

export interface GooglePlayClientOptions {
  tokenProvider: TokenProvider;
  fetchImpl?: typeof fetch;
  rateLimiter?: TokenBucket;
  retry?: RetryOptions;
  now?: () => Date;
}

export class GooglePlayClient implements PlayClient {
  private readonly fetchImpl: typeof fetch;
  private readonly rateLimiter: TokenBucket;
  private readonly retry: RetryOptions;
  private readonly now: () => Date;

  constructor(private readonly opts: GooglePlayClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.rateLimiter = opts.rateLimiter ?? getProcessRateLimiter();
    this.retry = opts.retry ?? {};
    this.now = opts.now ?? (() => new Date());
  }

  async listReviews(input: ListReviewsInput): Promise<ListReviewsResult> {
    const url = new URL(`${PUBLISHER}/${encodePath(input.packageName)}/reviews`);
    url.searchParams.set("maxResults", String(input.maxResults ?? 100));
    if (input.pageToken) url.searchParams.set("token", input.pageToken);
    if (input.translationLanguage) {
      url.searchParams.set("translationLanguage", input.translationLanguage);
    }
    const payload = await this.request(url, { method: "GET" }, input.packageName);
    return parseReviews(payload);
  }

  async replyToReview(input: ReplyInput): Promise<{ replyText: string }> {
    const url = new URL(
      `${PUBLISHER}/${encodePath(input.packageName)}/reviews/${encodePath(input.reviewId)}:reply`,
    );
    await this.request(
      url,
      { method: "POST", body: JSON.stringify({ replyText: input.replyText }) },
      input.packageName,
    );
    return { replyText: input.replyText };
  }

  async queryMetricSet(input: QueryMetricInput): Promise<DailyMetric[]> {
    const url = new URL(
      `${REPORTING}/${encodePath(input.packageName)}/${input.metricSet}:query`,
    );
    let latestEnd: { year: number; month: number; day: number } | undefined;
    try {
      const meta = await this.request(
        new URL(`${REPORTING}/${encodePath(input.packageName)}/${input.metricSet}`),
        { method: "GET" },
        input.packageName,
      );
      latestEnd = parseDailyFreshness(meta);
    } catch {
      latestEnd = undefined;
    }
    const payload = await this.request(
      url,
      {
        method: "POST",
        body: JSON.stringify({
          timelineSpec: timelineSpec(input.days, this.now(), latestEnd),
          metrics: input.metrics,
        }),
      },
      input.packageName,
    );
    return parseMetricRows(payload);
  }

  async insertEdit(packageName: string): Promise<{ editId: string }> {
    const url = new URL(`${PUBLISHER}/${encodePath(packageName)}/edits`);
    const payload = (await this.request(
      url,
      { method: "POST", body: JSON.stringify({}) },
      packageName,
    )) as { id?: string };
    if (!payload.id) {
      throw new PlayApiError(502, "Play did not return an edit id.", null, packageName);
    }
    return { editId: payload.id };
  }

  async listTracks(packageName: string, editId: string): Promise<TrackInfo[]> {
    const url = new URL(`${PUBLISHER}/${encodePath(packageName)}/edits/${encodePath(editId)}/tracks`);
    const payload = await this.request(url, { method: "GET" }, packageName);
    return parseTracks(payload);
  }

  async deleteEdit(packageName: string, editId: string): Promise<void> {
    const url = new URL(`${PUBLISHER}/${encodePath(packageName)}/edits/${encodePath(editId)}`);
    await this.request(url, { method: "DELETE" }, packageName);
  }

  async listBundles(packageName: string, editId: string): Promise<BundleInfo[]> {
    const url = new URL(
      `${PUBLISHER}/${encodePath(packageName)}/edits/${encodePath(editId)}/bundles`,
    );
    const payload = await this.request(url, { method: "GET" }, packageName);
    return parseBundles(payload);
  }

  private async request(url: URL, init: RequestInit, packageName: string): Promise<unknown> {
    await this.rateLimiter.acquire();
    return withRetry(async () => {
      const token = await this.opts.tokenProvider.getAccessToken();
      const response = await this.fetchImpl(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
      });
      if (!response.ok) {
        let message = response.statusText || "Play request failed";
        try {
          const body = (await response.json()) as { error?: { message?: string } };
          if (body.error?.message) message = body.error.message;
        } catch {
          // Ignore non-JSON error bodies.
        }
        throw new PlayApiError(
          response.status,
          message,
          parseRetryAfter(response.headers.get("retry-after")),
          packageName,
        );
      }
      if (response.status === 204) return {};
      const text = await response.text();
      if (!text) return {};
      return JSON.parse(text) as unknown;
    }, this.retry);
  }
}

function encodePath(value: string): string {
  return encodeURIComponent(value);
}

export async function tokenProviderFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<TokenProvider> {
  const { GoogleAuth } = await import("google-auth-library");
  let credentials: object | undefined;
  if (env.APPVITALS_SERVICE_ACCOUNT_JSON) {
    try {
      credentials = JSON.parse(env.APPVITALS_SERVICE_ACCOUNT_JSON) as object;
    } catch {
      throw new Error("APPVITALS_SERVICE_ACCOUNT_JSON is not valid JSON.");
    }
  }
  const auth = new GoogleAuth({
    scopes: PLAY_SCOPES,
    ...(credentials ? { credentials: credentials as NonNullable<ConstructorParameters<typeof GoogleAuth>[0]>["credentials"] } : {}),
  });
  return {
    async getAccessToken() {
      const client = await auth.getClient();
      const result = await client.getAccessToken();
      const token = typeof result === "string" ? result : result?.token;
      if (!token) {
        throw new Error(
          "Google Auth returned an empty access token. Check the service account JSON and that the Play APIs are enabled.",
        );
      }
      return token;
    },
  };
}
