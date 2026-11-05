export interface CustomerReview {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  reviewerNickname: string | null;
  createdDate: string | null;
  territory: string | null;
  hasResponse: boolean;
}

export interface PhasedRelease {
  state: string | null;
  startDate: string | null;
  currentDayNumber: number | null;
  totalPauseDuration: number | null;
}

export interface AppVersionStatus {
  id: string;
  versionString: string | null;
  platform: string | null;
  appStoreState: string | null;
  createdDate: string | null;
  releaseType: string | null;
  earliestReleaseDate: string | null;
  phasedRelease: PhasedRelease | null;
}

export interface AppStatus {
  id: string;
  name: string | null;
  bundleId: string | null;
  sku: string | null;
  primaryLocale: string | null;
  versions: AppVersionStatus[];
}

export interface TestFlightBuild {
  id: string;
  version: string | null;
  uploadedDate: string | null;
  processingState: string | null;
  expired: boolean | null;
  minOsVersion: string | null;
}

export interface FeedbackItem {
  id: string;
  buildId: string | null;
  comment: string | null;
  createdDate: string | null;
  deviceModel: string | null;
  osVersion: string | null;
}

export interface TestFlightFeedback {
  crashFeedbackCount: number;
  screenshotFeedbackCount: number;
  recentCrashes: FeedbackItem[];
  recentScreenshots: FeedbackItem[];
}

export interface SalesSkuTotal {
  sku: string;
  title: string | null;
  units: number;
  proceeds: number | null;
}

export interface SalesSummary {
  vendorNumber: string;
  frequency: string;
  reportDate: string;
  reportType: string;
  reportSubType: "SUMMARY";
  rowCount: number;
  truncated: boolean;
  currency: string | null;
  currencyNote: string | null;
  totals: { units: number; developerProceeds: number | null };
  bySku: SalesSkuTotal[];
}

export interface FinanceSummary {
  vendorNumber: string;
  regionCode: string;
  reportDate: string;
  rowCount: number;
  truncated: boolean;
  currency: string | null;
  currencyNote: string | null;
  totals: { quantity: number; extendedPartnerShare: number | null };
}

export interface AnalyticsReportInfo {
  id: string;
  name: string | null;
  category: string | null;
}

export interface AnalyticsRequestInfo {
  id: string;
  accessType: string | null;
  stopped: boolean | null;
  reports: AnalyticsReportInfo[];
}

export interface PerfSummary {
  appId: string;
  requests: AnalyticsRequestInfo[];
  gaps: string[];
  fixture: { label: string } | null;
}

export interface AscApp {
  id: string;
  name: string | null;
  bundleId: string | null;
}

export interface AscClient {
  listApps(): Promise<AscApp[]>;
  listReviews(input: {
    appId: string;
    limit?: number;
    rating?: number;
    territory?: string;
  }): Promise<CustomerReview[]>;
  replyToReview(input: { reviewId: string; responseBody: string }): Promise<{ id: string; responseBody: string }>;
  getAppStatus(appId: string): Promise<AppStatus>;
  listTestFlightBuilds(input: { appId: string; limit?: number }): Promise<TestFlightBuild[]>;
  getTestFlightFeedback(input: { appId: string; limit?: number }): Promise<TestFlightFeedback>;
  getSalesSummary(input: {
    vendorNumber: string;
    frequency: string;
    reportDate: string;
    reportType: string;
    sku?: string;
  }): Promise<SalesSummary>;
  getFinanceSummary(input: {
    vendorNumber: string;
    regionCode: string;
    reportDate: string;
  }): Promise<FinanceSummary>;
  getPerfSummary(appId: string): Promise<PerfSummary>;
}
