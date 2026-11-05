import { gunzipSync } from "node:zlib";
import { AscApiError, ascErrorDetail, parseRetryAfter } from "../errors.js";
import { PERF_GAPS } from "../gaps.js";
import { mintAppStoreConnectJwt } from "../jwt.js";
import { withRetry } from "../retry.js";
import {
  booleanAttr,
  numberAttr,
  parseReviews,
  resourceList,
  stringAttr,
  summariseFinanceTsv,
  summariseSalesTsv,
  type JsonApiResource,
} from "./parse.js";
import type {
  AppStatus,
  AppVersionStatus,
  AscClient,
  CustomerReview,
  FeedbackItem,
  FinanceSummary,
  PerfSummary,
  PhasedRelease,
  SalesSummary,
  TestFlightBuild,
  TestFlightFeedback,
} from "./types.js";

const API_HOST = "api.appstoreconnect.apple.com";
const API_ORIGIN = `https://${API_HOST}`;
const MAX_COMPRESSED_BYTES = 20 * 1024 * 1024;

export interface AppleAscClientOptions {
  issuerId: string;
  keyId: string;
  privateKeyPem: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export class AppleAscClient implements AscClient {
  private cached: { token: string; exp: number } | null = null;

  constructor(private readonly opts: AppleAscClientOptions) {}

  async listApps(): Promise<Array<{ id: string; name: string | null; bundleId: string | null }>> {
    const body = await this.getOkJson("/v1/apps?limit=200", "Listing apps");
    return resourceList(body)
      .map((resource) => ({
        id: resource.id ?? "",
        name: stringAttr(resource, "name"),
        bundleId: stringAttr(resource, "bundleId"),
      }))
      .filter((app) => app.id.length > 0);
  }

  async listReviews(input: {
    appId: string;
    limit?: number;
    rating?: number;
    territory?: string;
  }): Promise<CustomerReview[]> {
    const limit = input.limit ?? 50;
    const reviews: CustomerReview[] = [];
    const params = new URLSearchParams();
    params.set("limit", String(Math.min(200, limit)));
    params.set("sort", "-createdDate");
    if (input.rating != null) params.set("filter[rating]", String(input.rating));
    if (input.territory) params.set("filter[territory]", input.territory.toUpperCase());
    let next: string | null = `/v1/apps/${encodeURIComponent(input.appId)}/customerReviews?${params}`;
    while (next && reviews.length < limit) {
      const body = await this.getOkJson(next, "Listing customer reviews");
      const page = parseReviews(body);
      reviews.push(...page.reviews);
      next = page.next;
    }
    return reviews.slice(0, limit);
  }

  async replyToReview(input: { reviewId: string; responseBody: string }): Promise<{ id: string; responseBody: string }> {
    const body = await this.getOkJson("/v1/customerReviewResponses", "Replying to a review", {
      method: "POST",
      json: {
        data: {
          type: "customerReviewResponses",
          attributes: { responseBody: input.responseBody },
          relationships: {
            review: { data: { type: "customerReviews", id: input.reviewId } },
          },
        },
      },
    });
    const resource = resourceList(body)[0];
    return {
      id: resource?.id ?? "",
      responseBody: (resource && stringAttr(resource, "responseBody")) || input.responseBody,
    };
  }

  async getAppStatus(appId: string): Promise<AppStatus> {
    const appBody = await this.getOkJson(`/v1/apps/${encodeURIComponent(appId)}`, "Reading the app");
    const app = resourceList(appBody)[0];
    if (!app) throw new AscApiError(404, `No app returned for ${appId}.`);
    const versionsBody = await this.getOkJson(
      `/v1/apps/${encodeURIComponent(appId)}/appStoreVersions?limit=5&sort=-createdDate`,
      "Reading App Store versions",
    );
    const versions: AppVersionStatus[] = [];
    for (const resource of resourceList(versionsBody).slice(0, 3)) {
      versions.push(await this.versionStatus(resource));
    }
    return {
      id: app.id ?? appId,
      name: stringAttr(app, "name"),
      bundleId: stringAttr(app, "bundleId"),
      sku: stringAttr(app, "sku"),
      primaryLocale: stringAttr(app, "primaryLocale"),
      versions,
    };
  }

  async listTestFlightBuilds(input: { appId: string; limit?: number }): Promise<TestFlightBuild[]> {
    const limit = input.limit ?? 10;
    const params = new URLSearchParams();
    params.set("filter[app]", input.appId);
    params.set("sort", "-uploadedDate");
    params.set("limit", String(Math.min(50, limit)));
    const body = await this.getOkJson(`/v1/builds?${params}`, "Listing TestFlight builds");
    return resourceList(body).slice(0, limit).map(parseBuild);
  }

  async getTestFlightFeedback(input: { appId: string; limit?: number }): Promise<TestFlightFeedback> {
    const limit = input.limit ?? 10;
    const builds = await this.listTestFlightBuilds({ appId: input.appId, limit: 3 });
    const recentCrashes: FeedbackItem[] = [];
    const recentScreenshots: FeedbackItem[] = [];
    for (const build of builds) {
      if (recentCrashes.length >= limit && recentScreenshots.length >= limit) break;
      const crashes = await this.feedback(
        `/v1/builds/${encodeURIComponent(build.id)}/betaFeedbackCrashSubmissions?limit=${limit}`,
        build.id,
      );
      const shots = await this.feedback(
        `/v1/builds/${encodeURIComponent(build.id)}/betaFeedbackScreenshotSubmissions?limit=${limit}`,
        build.id,
      );
      recentCrashes.push(...crashes);
      recentScreenshots.push(...shots);
    }
    return {
      crashFeedbackCount: recentCrashes.length,
      screenshotFeedbackCount: recentScreenshots.length,
      recentCrashes: recentCrashes.slice(0, limit),
      recentScreenshots: recentScreenshots.slice(0, limit),
    };
  }

  async getSalesSummary(input: {
    vendorNumber: string;
    frequency: string;
    reportDate: string;
    reportType: string;
    sku?: string;
  }): Promise<SalesSummary> {
    const params = new URLSearchParams();
    params.set("filter[frequency]", input.frequency);
    params.set("filter[reportDate]", input.reportDate);
    params.set("filter[reportSubType]", "SUMMARY");
    params.set("filter[reportType]", input.reportType);
    params.set("filter[vendorNumber]", input.vendorNumber);
    const text = await this.getReport(`/v1/salesReports?${params}`, "sales");
    return summariseSalesTsv(text, input);
  }

  async getFinanceSummary(input: {
    vendorNumber: string;
    regionCode: string;
    reportDate: string;
  }): Promise<FinanceSummary> {
    const regionCode = input.regionCode.toUpperCase();
    const params = new URLSearchParams();
    params.set("filter[regionCode]", regionCode);
    params.set("filter[reportDate]", input.reportDate);
    params.set("filter[reportType]", "FINANCIAL");
    params.set("filter[vendorNumber]", input.vendorNumber);
    const text = await this.getReport(`/v1/financeReports?${params}`, "finance");
    return summariseFinanceTsv(text, { ...input, regionCode });
  }

  async getPerfSummary(appId: string): Promise<PerfSummary> {
    const body = await this.getOkJson(
      `/v1/apps/${encodeURIComponent(appId)}/analyticsReportRequests?limit=10`,
      "Listing analytics report requests",
    );
    const requests = [];
    for (const resource of resourceList(body).slice(0, 5)) {
      const id = resource.id ?? "";
      let reports: PerfSummary["requests"][number]["reports"] = [];
      if (id) {
        const reportBody = await this.getJsonAllowingEmpty(
          `/v1/analyticsReportRequests/${encodeURIComponent(id)}/reports?limit=20`,
        );
        reports = resourceList(reportBody).map((report) => ({
          id: report.id ?? "",
          name: stringAttr(report, "name"),
          category: stringAttr(report, "category"),
        }));
      }
      requests.push({
        id,
        accessType: stringAttr(resource, "accessType"),
        stopped: booleanAttr(resource, "stoppedDueToInactivity"),
        reports,
      });
    }
    return { appId, requests, gaps: PERF_GAPS, fixture: null };
  }

  private async versionStatus(resource: JsonApiResource): Promise<AppVersionStatus> {
    const id = resource.id ?? "";
    let phasedRelease: PhasedRelease | null = null;
    if (id) {
      const response = await this.request(
        `/v1/appStoreVersions/${encodeURIComponent(id)}/appStoreVersionPhasedRelease`,
      );
      if (response.status === 404) {
        await response.arrayBuffer().catch(() => undefined);
        phasedRelease = null;
      } else if (response.status >= 200 && response.status < 300) {
        const body = await readJson(response);
        const phased = resourceList(body)[0];
        if (phased) {
          phasedRelease = {
            state: stringAttr(phased, "phasedReleaseState"),
            startDate: stringAttr(phased, "startDate"),
            currentDayNumber: numberAttr(phased, "currentDayNumber"),
            totalPauseDuration: numberAttr(phased, "totalPauseDuration"),
          };
        }
      } else {
        await raiseForStatus(response, "Reading phased release");
      }
    }
    return {
      id,
      versionString: stringAttr(resource, "versionString"),
      platform: stringAttr(resource, "platform"),
      appStoreState: stringAttr(resource, "appStoreState"),
      createdDate: stringAttr(resource, "createdDate"),
      releaseType: stringAttr(resource, "releaseType"),
      earliestReleaseDate: stringAttr(resource, "earliestReleaseDate"),
      phasedRelease,
    };
  }

  private async feedback(path: string, buildId: string): Promise<FeedbackItem[]> {
    const response = await this.request(path);
    if (response.status === 404) return [];
    if (response.status < 200 || response.status >= 300) {
      await raiseForStatus(response, "Reading TestFlight feedback");
    }
    const body = await readJson(response);
    return resourceList(body).map((resource) => ({
      id: resource.id ?? "",
      buildId,
      comment: stringAttr(resource, "comment"),
      createdDate: stringAttr(resource, "createdDate"),
      deviceModel: stringAttr(resource, "deviceModel"),
      osVersion: stringAttr(resource, "osVersion"),
    }));
  }

  private async getReport(path: string, kind: "sales" | "finance"): Promise<string> {
    const response = await this.request(path, { accept: "application/a-gzip" });
    if (response.status === 404) {
      throw new AscApiError(
        404,
        kind === "sales"
          ? "Apple has no sales report for that vendor, frequency, type, and date. Daily reports often lag, and a wrong vendor number also 404s."
          : "Apple has no finance report for that vendor, region, and month. Reports appear after the fiscal month is processed.",
      );
    }
    if (response.status < 200 || response.status >= 300) {
      await raiseForStatus(response, kind === "sales" ? "Downloading the sales report" : "Downloading the finance report");
    }
    const compressed = Buffer.from(await response.arrayBuffer());
    if (compressed.length > MAX_COMPRESSED_BYTES) {
      throw new Error("The report is larger than 20 MB compressed, so it was not summarised.");
    }
    try {
      return gunzipSync(compressed).toString("utf8");
    } catch {
      throw new Error("Apple's report was not valid gzip, so it was not summarised.");
    }
  }

  private async getOkJson(path: string, what: string, init?: { method?: string; json?: unknown }): Promise<unknown> {
    const response = await this.request(path, init);
    if (response.status < 200 || response.status >= 300) {
      await raiseForStatus(response, what);
    }
    return readJson(response);
  }

  private async getJsonAllowingEmpty(path: string): Promise<unknown> {
    const response = await this.request(path);
    if (response.status === 404) return { data: [] };
    if (response.status < 200 || response.status >= 300) {
      await raiseForStatus(response, "Listing analytics reports");
    }
    return readJson(response);
  }

  private async request(path: string, init?: { method?: string; json?: unknown; accept?: string }): Promise<Response> {
    const url = resolveApiUrl(path);
    return withRetry(async () => {
      const response = await (this.opts.fetchImpl ?? fetch)(url, {
        method: init?.method ?? "GET",
        headers: {
          Authorization: `Bearer ${this.token()}`,
          Accept: init?.accept ?? "application/json",
          ...(init?.json ? { "Content-Type": "application/json" } : {}),
        },
        ...(init?.json ? { body: JSON.stringify(init.json) } : {}),
      });
      if (response.status === 429 || response.status >= 500) {
        const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
        const text = await response.text();
        throw new AscApiError(response.status, text.slice(0, 300), retryAfter);
      }
      return response;
    });
  }

  private token(): string {
    const now = Math.floor((this.opts.now ?? (() => new Date()))().getTime() / 1000);
    if (this.cached && this.cached.exp - 60 > now) return this.cached.token;
    const lifetime = 15 * 60;
    const token = mintAppStoreConnectJwt({
      issuerId: this.opts.issuerId,
      keyId: this.opts.keyId,
      privateKeyPem: this.opts.privateKeyPem,
      now: new Date(now * 1000),
      lifetimeSeconds: lifetime,
    });
    this.cached = { token, exp: now + lifetime };
    return token;
  }
}

export function resolveApiUrl(path: string): string {
  const url = path.startsWith("http") ? new URL(path) : new URL(path, API_ORIGIN);
  if (url.protocol !== "https:" || url.host !== API_HOST) {
    throw new AscApiError(0, "Refused a URL that is not https://api.appstoreconnect.apple.com.");
  }
  return url.toString();
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("App Store Connect returned a body that was not JSON.");
  }
}

async function raiseForStatus(response: Response, what: string): Promise<never> {
  const text = await response.text();
  let detail: string | null = null;
  if (text) {
    try {
      detail = ascErrorDetail(JSON.parse(text) as unknown);
    } catch {
      detail = text.slice(0, 300);
    }
  }
  throw new AscApiError(response.status, detail ? `${what}. ${detail}` : what);
}

function parseBuild(resource: JsonApiResource): TestFlightBuild {
  return {
    id: resource.id ?? "",
    version: stringAttr(resource, "version"),
    uploadedDate: stringAttr(resource, "uploadedDate"),
    processingState: stringAttr(resource, "processingState"),
    expired: booleanAttr(resource, "expired"),
    minOsVersion: stringAttr(resource, "minOsVersion"),
  };
}
