import type {
  BundleInfo,
  DailyMetric,
  ListReviewsInput,
  ListReviewsResult,
  NormalizedReview,
  PlayClient,
  QueryMetricInput,
  ReplyInput,
  TrackInfo,
} from "./types.js";

const REVIEWS: NormalizedReview[] = [
  {
    reviewId: "rev-1",
    authorName: "Alex",
    text: "Crashes on launch",
    starRating: 2,
    lastModified: "2026-11-01T00:00:00.000Z",
    reviewerLanguage: "en",
  },
  {
    reviewId: "rev-2",
    authorName: "Sam",
    text: "Solid update",
    starRating: 5,
    lastModified: "2026-11-02T00:00:00.000Z",
    reviewerLanguage: "en",
  },
];

export class MockPlayClient implements PlayClient {
  replies: ReplyInput[] = [];
  deletedEdits: string[] = [];

  async listReviews(input: ListReviewsInput): Promise<ListReviewsResult> {
    const reviews = REVIEWS.map((review) => {
      if (!input.translationLanguage) return review;
      return {
        ...review,
        text: `[${input.translationLanguage}] ${review.text}`,
      };
    });
    return { reviews };
  }

  async replyToReview(input: ReplyInput): Promise<{ replyText: string }> {
    this.replies.push(input);
    return { replyText: input.replyText };
  }

  async queryMetricSet(input: QueryMetricInput): Promise<DailyMetric[]> {
    const metrics: Record<string, number> = {};
    for (const name of input.metrics) {
      metrics[name] = sampleMetric(name);
    }
    return [{ date: "2026-11-03", metrics }];
  }

  async insertEdit(_packageName: string): Promise<{ editId: string }> {
    return { editId: "edit-1" };
  }

  async listTracks(_packageName: string, _editId: string): Promise<TrackInfo[]> {
    return [
      {
        track: "production",
        releases: [
          {
            name: "1.4.0",
            status: "completed",
            versionCodes: [42],
            userFraction: 1,
          },
        ],
      },
    ];
  }

  async deleteEdit(_packageName: string, editId: string): Promise<void> {
    this.deletedEdits.push(editId);
  }

  async listBundles(_packageName: string, _editId: string): Promise<BundleInfo[]> {
    return [{ versionCode: 42, sha1: "abc123" }];
  }
}

function sampleMetric(name: string): number {
  switch (name) {
    case "userPerceivedCrashRate":
      return 0.004;
    case "crashRate":
      return 0.003;
    case "userPerceivedAnrRate":
      return 0.002;
    case "anrRate":
      return 0.001;
    case "distinctUsers":
      return 1200;
    case "slowStartRate":
      return 0.01;
    case "excessiveWakeupRate":
      return 0.0004;
    default:
      return 0;
  }
}

export class UnavailablePlayClient implements PlayClient {
  constructor(private readonly reason: string) {}

  private fail(): never {
    throw new Error(this.reason);
  }

  listReviews(): Promise<ListReviewsResult> {
    this.fail();
  }
  replyToReview(): Promise<{ replyText: string }> {
    this.fail();
  }
  queryMetricSet(): Promise<DailyMetric[]> {
    this.fail();
  }
  insertEdit(): Promise<{ editId: string }> {
    this.fail();
  }
  listTracks(): Promise<TrackInfo[]> {
    this.fail();
  }
  deleteEdit(): Promise<void> {
    this.fail();
  }
  listBundles(): Promise<BundleInfo[]> {
    this.fail();
  }
}

export const MISSING_CREDENTIALS =
  "No Google credentials. Set GOOGLE_APPLICATION_CREDENTIALS or APPVITALS_SERVICE_ACCOUNT_JSON, or set APPVITALS_MOCK=1.";
