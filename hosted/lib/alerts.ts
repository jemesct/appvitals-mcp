import { ANR_THRESHOLD, CRASH_THRESHOLD, alertDue, detectSpike } from "./spike";
import type { EmailSender } from "./email";
import type { Repository, Subscription } from "./repo";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function runAlerts(opts: {
  repo: Repository;
  email: EmailSender;
  now: Date;
  productId?: string;
}): Promise<{ considered: number; sent: number }> {
  const productId = opts.productId ?? "appvitals";
  const subscriptions = await opts.repo.listSubscriptions(productId);
  let considered = 0;
  let sent = 0;
  for (const subscription of subscriptions) {
    if (subscription.status !== "active" && subscription.status !== "trialing") continue;
    if (!alertDue(subscription.lastAlertAt, subscription.alertFrequency, opts.now)) continue;
    considered += 1;
    const body = await buildAlert(opts.repo, subscription, opts.now);
    if (body) {
      const customer = await opts.repo.getCustomer(subscription.customerId);
      if (customer) {
        await opts.email.send({
          to: customer.email,
          subject: "AppVitals: reviews and vitals",
          text: body,
        });
        sent += 1;
      }
    }
    await opts.repo.touchLastAlert(subscription.id, opts.now.toISOString());
  }
  return { considered, sent };
}

export async function buildAlert(
  repo: Repository,
  subscription: Subscription,
  now: Date,
): Promise<string | null> {
  const apps = await repo.listApps(subscription.customerId, subscription.productId);
  const lines: string[] = [];
  const since = new Date(now.getTime() - 28 * DAY_MS).toISOString().slice(0, 10);
  for (const app of apps) {
    const reviews = await repo.listReviewSnapshots({
      packageName: app.packageName,
      maxStars: 2,
      limit: 50,
    });
    for (const review of reviews) {
      const stamp = review.lastModified ?? review.capturedAt;
      if (subscription.lastAlertAt && Date.parse(stamp) <= Date.parse(subscription.lastAlertAt)) {
        continue;
      }
      const recorded = await repo.recordAlert({
        customerId: subscription.customerId,
        productId: subscription.productId,
        kind: "review",
        subjectKey: `${app.packageName}:${review.reviewId}`,
        sentAt: now.toISOString(),
      });
      if (!recorded.inserted) continue;
      lines.push(
        `${app.packageName} ${review.stars} star review from ${review.author}: ${review.text}`,
      );
    }
    const vitals = await repo.listVitals(app.packageName, since);
    const latest = vitals[vitals.length - 1];
    if (!latest) continue;
    const prior = vitals.slice(0, -1).slice(-28);
    const crash = detectSpike(
      latest.userPerceivedCrashRate,
      prior.map((row) => row.userPerceivedCrashRate).filter((value): value is number => value != null),
      CRASH_THRESHOLD,
    );
    const anr = detectSpike(
      latest.userPerceivedAnrRate,
      prior.map((row) => row.userPerceivedAnrRate).filter((value): value is number => value != null),
      ANR_THRESHOLD,
    );
    if (crash.spike) {
      const key = `${app.packageName}:${latest.date}:crash`;
      const recorded = await repo.recordAlert({
        customerId: subscription.customerId,
        productId: subscription.productId,
        kind: "vital",
        subjectKey: key,
        sentAt: now.toISOString(),
      });
      if (recorded.inserted) {
        lines.push(
          `${app.packageName} user-perceived crash rate ${latest.userPerceivedCrashRate} on ${latest.date} is ${crash.reason}.`,
        );
      }
    }
    if (anr.spike) {
      const key = `${app.packageName}:${latest.date}:anr`;
      const recorded = await repo.recordAlert({
        customerId: subscription.customerId,
        productId: subscription.productId,
        kind: "vital",
        subjectKey: key,
        sentAt: now.toISOString(),
      });
      if (recorded.inserted) {
        lines.push(
          `${app.packageName} user-perceived ANR rate ${latest.userPerceivedAnrRate} on ${latest.date} is ${anr.reason}.`,
        );
      }
    }
  }
  if (lines.length === 0) return null;
  return [
    "AppVitals noticed something on your apps.",
    "",
    ...lines,
    "",
    "This is a daily or weekly note, depending on the plan setting. Reply from your MCP client if you want the raw reviews.",
  ].join("\n");
}
