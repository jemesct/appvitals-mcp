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
    const dimension = input.dimensions?.[0];
    const slices = dimensionSlices(dimension);
    return slices.map((slice, index) => {
      const metrics: Record<string, number> = {};
      for (const name of input.metrics) {
        metrics[name] = sampleMetric(name, index);
      }
      const row: DailyMetric = { date: "2026-11-03", metrics };
      if (dimension && slice) {
        row.dimensions = { [dimension]: slice.value };
        if (slice.label) row.dimensionLabels = { [dimension]: slice.label };
      }
      return row;
    });
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
      {
        track: "internal",
        releases: [
          {
            name: "1.4.1",
            status: "completed",
            versionCodes: [43],
            userFraction: null,
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

function dimensionSlices(dimension: string | undefined): Array<{ value: string; label?: string } | null> {
  switch (dimension) {
    case "deviceModel":
      return [
        { value: "google/coral", label: "Pixel 4 XL" },
        { value: "samsung/b0q", label: "Galaxy S22 Ultra" },
      ];
    case "apiLevel":
      return [
        { value: "34", label: "Android 14" },
        { value: "33", label: "Android 13" },
      ];
    case "countryCode":
      return [
        { value: "US", label: "United States" },
        { value: "DE", label: "Germany" },
      ];
    default:
      return [null];
  }
}

function sampleMetric(name: string, slice = 0): number {
  const bump = slice * 0.001;
  switch (name) {
    case "userPerceivedCrashRate":
      return slice === 1 ? 0.014 : 0.004;
    case "crashRate":
      return 0.003 + bump;
    case "userPerceivedAnrRate":
      return 0.002 + bump;
    case "anrRate":
      return 0.001 + bump;
    case "distinctUsers":
      return slice === 0 ? 1200 : 400;
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
