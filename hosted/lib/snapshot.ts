import { collectRecentReviews, collectVitals, type PlayClient } from "appvitals-mcp";
import type { Repository } from "./repo";

export async function snapshotPackage(
  repo: Repository,
  client: PlayClient,
  packageName: string,
  now: Date,
): Promise<{ reviews: number; insertedReviews: number; vitals: number }> {
  const reviews = await collectRecentReviews(client, { packageName, maxResults: 100 });
  let insertedReviews = 0;
  for (const review of reviews) {
    const saved = await repo.upsertReview({
      packageName,
      reviewId: review.reviewId,
      stars: review.starRating,
      text: review.text,
      author: review.authorName,
      lastModified: review.lastModified,
      capturedAt: now.toISOString(),
    });
    if (saved.inserted) insertedReviews += 1;
  }
  const report = await collectVitals(client, packageName, 7);
  for (const day of report.series) {
    await repo.upsertVitals({
      packageName,
      date: day.date,
      crashRate: day.crashRate,
      userPerceivedCrashRate: day.userPerceivedCrashRate,
      anrRate: day.anrRate,
      userPerceivedAnrRate: day.userPerceivedAnrRate,
      distinctUsers: day.distinctUsers,
      slowStartRate: day.slowStartRate,
      excessiveWakeupRate: day.excessiveWakeupRate,
      capturedAt: now.toISOString(),
    });
  }
  return { reviews: reviews.length, insertedReviews, vitals: report.series.length };
}

export async function snapshotProduct(
  repo: Repository,
  client: PlayClient,
  productId: string,
  now: Date,
): Promise<Array<{ packageName: string; ok: boolean; detail: string }>> {
  const apps = await repo.listAllApps(productId);
  const seen = new Set<string>();
  const results = [];
  for (const app of apps) {
    if (seen.has(app.packageName)) continue;
    seen.add(app.packageName);
    try {
      const summary = await snapshotPackage(repo, client, app.packageName, now);
      results.push({
        packageName: app.packageName,
        ok: true,
        detail: `${summary.reviews} reviews (${summary.insertedReviews} new), ${summary.vitals} vital days`,
      });
    } catch (err) {
      results.push({
        packageName: app.packageName,
        ok: false,
        detail: err instanceof Error ? err.message : "Snapshot failed",
      });
    }
  }
  return results;
}
