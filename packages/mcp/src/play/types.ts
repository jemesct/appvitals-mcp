export interface NormalizedReview {
  reviewId: string;
  authorName: string;
  text: string;
  starRating: number;
  lastModified: string;
  reviewerLanguage?: string;
  originalText?: string;
}

export interface ListReviewsInput {
  packageName: string;
  maxResults?: number;
  pageToken?: string;
  translationLanguage?: string;
}

export interface ListReviewsResult {
  reviews: NormalizedReview[];
  nextPageToken?: string;
}

export interface ReplyInput {
  packageName: string;
  reviewId: string;
  replyText: string;
}

export interface DailyMetric {
  date: string;
  metrics: Record<string, number>;
}

export type MetricSetName =
  | "crashRateMetricSet"
  | "anrRateMetricSet"
  | "slowStartRateMetricSet"
  | "excessiveWakeupRateMetricSet";

export interface QueryMetricInput {
  packageName: string;
  metricSet: MetricSetName;
  days: number;
  metrics: string[];
}

export interface ReleaseInfo {
  name: string | null;
  status: string | null;
  versionCodes: number[];
  userFraction: number | null;
}

export interface TrackInfo {
  track: string;
  releases: ReleaseInfo[];
}

export interface BundleInfo {
  versionCode: number;
  sha1?: string;
}

export interface PlayClient {
  listReviews(input: ListReviewsInput): Promise<ListReviewsResult>;
  replyToReview(input: ReplyInput): Promise<{ replyText: string }>;
  queryMetricSet(input: QueryMetricInput): Promise<DailyMetric[]>;
  insertEdit(packageName: string): Promise<{ editId: string }>;
  listTracks(packageName: string, editId: string): Promise<TrackInfo[]>;
  deleteEdit(packageName: string, editId: string): Promise<void>;
  listBundles(packageName: string, editId: string): Promise<BundleInfo[]>;
}
