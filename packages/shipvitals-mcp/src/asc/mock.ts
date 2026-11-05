import { PERF_GAPS } from "../gaps.js";
import type {
  AppStatus,
  AscClient,
  CustomerReview,
  FeedbackItem,
  FinanceSummary,
  PerfSummary,
  SalesSummary,
  TestFlightBuild,
  TestFlightFeedback,
} from "./types.js";

const REVIEWS: CustomerReview[] = [
  {
    id: "rev-1",
    rating: 2,
    title: "Crashes on launch",
    body: "Build 42 dies on the home screen.",
    reviewerNickname: "Alex",
    createdDate: "2026-11-01T00:00:00.000Z",
    territory: "AUS",
    hasResponse: false,
  },
  {
    id: "rev-2",
    rating: 5,
    title: "Solid update",
    body: "The new editor is fast.",
    reviewerNickname: "Sam",
    createdDate: "2026-11-02T00:00:00.000Z",
    territory: "USA",
    hasResponse: true,
  },
];

const STATUS: AppStatus = {
  id: "1234567890",
  name: "Example",
  bundleId: "com.example.ios",
  sku: "example-ios",
  primaryLocale: "en-AU",
  versions: [
    {
      id: "ver-1",
      versionString: "1.4.0",
      platform: "IOS",
      appStoreState: "READY_FOR_SALE",
      createdDate: "2026-10-20T00:00:00.000Z",
      releaseType: "AFTER_APPROVAL",
      earliestReleaseDate: null,
      phasedRelease: {
        state: "COMPLETE",
        startDate: "2026-10-21",
        currentDayNumber: 7,
        totalPauseDuration: 0,
      },
    },
  ],
};

const BUILDS: TestFlightBuild[] = [
  {
    id: "build-1",
    version: "42",
    uploadedDate: "2026-11-03T00:00:00.000Z",
    processingState: "VALID",
    expired: false,
    minOsVersion: "17.0",
  },
];

const CRASHES: FeedbackItem[] = [
  {
    id: "crash-1",
    buildId: "build-1",
    comment: "Closed itself on the paywall.",
    createdDate: "2026-11-03T02:00:00.000Z",
    deviceModel: "iPhone16,1",
    osVersion: "18.1",
  },
];

const SCREENSHOTS: FeedbackItem[] = [
  {
    id: "shot-1",
    buildId: "build-1",
    comment: "Button is off the edge.",
    createdDate: "2026-11-03T03:00:00.000Z",
    deviceModel: "iPhone16,1",
    osVersion: "18.1",
  },
];

export const MISSING_CREDENTIALS = [
  "App Store Connect credentials are not set.",
  "Set SHIPVITALS_ISSUER_ID, SHIPVITALS_KEY_ID, and SHIPVITALS_PRIVATE_KEY (or SHIPVITALS_PRIVATE_KEY_PATH).",
  "Or set SHIPVITALS_MOCK=1 to run without Apple.",
].join(" ");

export class MockAscClient implements AscClient {
  replies: Array<{ reviewId: string; responseBody: string }> = [];

  async listReviews(input: {
    appId: string;
    limit?: number;
    rating?: number;
    territory?: string;
  }): Promise<CustomerReview[]> {
    const limit = input.limit ?? 50;
    return REVIEWS.filter((review) => {
      if (input.rating != null && review.rating !== input.rating) return false;
      if (input.territory && review.territory !== input.territory.toUpperCase()) return false;
      return true;
    }).slice(0, limit);
  }

  async replyToReview(input: { reviewId: string; responseBody: string }): Promise<{ id: string; responseBody: string }> {
    this.replies.push(input);
    return { id: `response-${input.reviewId}`, responseBody: input.responseBody };
  }

  async getAppStatus(appId: string): Promise<AppStatus> {
    return { ...STATUS, id: appId, versions: STATUS.versions.map((version) => ({ ...version })) };
  }

  async listTestFlightBuilds(input: { appId: string; limit?: number }): Promise<TestFlightBuild[]> {
    void input.appId;
    return BUILDS.slice(0, input.limit ?? BUILDS.length);
  }

  async getTestFlightFeedback(input: { appId: string; limit?: number }): Promise<TestFlightFeedback> {
    void input.appId;
    const limit = input.limit ?? 10;
    const recentCrashes = CRASHES.slice(0, limit);
    const recentScreenshots = SCREENSHOTS.slice(0, limit);
    return {
      crashFeedbackCount: recentCrashes.length,
      screenshotFeedbackCount: recentScreenshots.length,
      recentCrashes,
      recentScreenshots,
    };
  }

  async getSalesSummary(input: {
    vendorNumber: string;
    frequency: string;
    reportDate: string;
    reportType: string;
    sku?: string;
  }): Promise<SalesSummary> {
    const rows = [
      { sku: "example-ios", title: "Example", units: 12, proceeds: 8.4 },
      { sku: "example-ios-plus", title: "Example Plus", units: 2, proceeds: 4 },
    ].filter((row) => !input.sku || row.sku === input.sku);
    const units = rows.reduce((sum, row) => sum + row.units, 0);
    const proceeds = rows.reduce((sum, row) => sum + row.proceeds, 0);
    return {
      vendorNumber: input.vendorNumber,
      frequency: input.frequency,
      reportDate: input.reportDate,
      reportType: input.reportType,
      reportSubType: "SUMMARY",
      rowCount: rows.length,
      truncated: false,
      currency: rows.length === 0 ? null : "AUD",
      currencyNote: null,
      totals: { units, developerProceeds: rows.length === 0 ? null : proceeds },
      bySku: rows,
    };
  }

  async getFinanceSummary(input: {
    vendorNumber: string;
    regionCode: string;
    reportDate: string;
  }): Promise<FinanceSummary> {
    return {
      vendorNumber: input.vendorNumber,
      regionCode: input.regionCode.toUpperCase(),
      reportDate: input.reportDate,
      rowCount: 1,
      truncated: false,
      currency: "AUD",
      currencyNote: null,
      totals: { quantity: 40, extendedPartnerShare: 28.5 },
    };
  }

  async getPerfSummary(appId: string): Promise<PerfSummary> {
    return {
      appId,
      requests: [
        {
          id: "report-request-1",
          accessType: "ONGOING",
          stopped: false,
          reports: [
            { id: "report-perf", name: "Performance", category: "PERFORMANCE" },
            { id: "report-usage", name: "App Usage", category: "APP_USAGE" },
          ],
        },
      ],
      gaps: PERF_GAPS,
      fixture: {
        label: "Mock fixture only. Live mode leaves this null and does not invent rates.",
      },
    };
  }
}

export class UnavailableAscClient implements AscClient {
  constructor(private readonly reason: string) {}

  private fail(): never {
    throw new Error(this.reason);
  }

  listReviews(): Promise<CustomerReview[]> {
    this.fail();
  }

  replyToReview(): Promise<{ id: string; responseBody: string }> {
    this.fail();
  }

  getAppStatus(): Promise<AppStatus> {
    this.fail();
  }

  listTestFlightBuilds(): Promise<TestFlightBuild[]> {
    this.fail();
  }

  getTestFlightFeedback(): Promise<TestFlightFeedback> {
    this.fail();
  }

  getSalesSummary(): Promise<SalesSummary> {
    this.fail();
  }

  getFinanceSummary(): Promise<FinanceSummary> {
    this.fail();
  }

  getPerfSummary(): Promise<PerfSummary> {
    this.fail();
  }
}
