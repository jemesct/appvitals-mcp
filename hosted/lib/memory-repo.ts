import { randomUUID } from "node:crypto";
import { safeKeyPrefix } from "./keys";
import type {
  AlertSent,
  ApiKeyRecord,
  AppRecord,
  Customer,
  RecordToolEventInput,
  Repository,
  ReviewSnapshot,
  Subscription,
  ToolEvent,
  UpsertSubscriptionInput,
  VitalsSnapshot,
} from "./repo";

function id(): string {
  return randomUUID();
}

export class MemoryRepository implements Repository {
  customers: Customer[] = [];
  apiKeys: ApiKeyRecord[] = [];
  subscriptions: Subscription[] = [];
  apps: AppRecord[] = [];
  reviews: ReviewSnapshot[] = [];
  vitals: VitalsSnapshot[] = [];
  alerts: AlertSent[] = [];
  toolEvents: ToolEvent[] = [];

  async getCustomer(customerId: string): Promise<Customer | null> {
    return this.customers.find((customer) => customer.id === customerId) ?? null;
  }

  async upsertCustomerByEmail(email: string): Promise<Customer> {
    const normalised = email.trim().toLowerCase();
    const existing = this.customers.find((customer) => customer.email === normalised);
    if (existing) return existing;
    const customer: Customer = {
      id: id(),
      email: normalised,
      createdAt: new Date().toISOString(),
    };
    this.customers.push(customer);
    return customer;
  }

  async insertApiKey(input: { customerId: string; keyHash: string; keyPrefix: string }): Promise<ApiKeyRecord> {
    const record: ApiKeyRecord = {
      id: id(),
      keyHash: input.keyHash,
      keyPrefix: input.keyPrefix,
      customerId: input.customerId,
      createdAt: new Date().toISOString(),
    };
    this.apiKeys.push(record);
    return record;
  }

  async findApiKeyByHash(keyHash: string): Promise<(ApiKeyRecord & { customer: Customer }) | null> {
    const key = this.apiKeys.find((item) => item.keyHash === keyHash);
    if (!key) return null;
    const customer = this.customers.find((item) => item.id === key.customerId);
    if (!customer) return null;
    return { ...key, customer };
  }

  async listApiKeys(customerId: string): Promise<ApiKeyRecord[]> {
    return this.apiKeys.filter((key) => key.customerId === customerId);
  }

  async upsertSubscription(input: UpsertSubscriptionInput): Promise<Subscription> {
    const byLs = input.lsSubscriptionId
      ? this.subscriptions.find((sub) => sub.lsSubscriptionId === input.lsSubscriptionId)
      : undefined;
    const existing =
      byLs ??
      this.subscriptions.find(
        (sub) => sub.customerId === input.customerId && sub.productId === input.productId,
      );
    if (existing) {
      existing.customerId = input.customerId;
      existing.productId = input.productId;
      existing.plan = input.plan;
      existing.trialEndsAt = input.trialEndsAt;
      existing.lsSubscriptionId = input.lsSubscriptionId ?? existing.lsSubscriptionId;
      existing.status = input.status;
      if (input.alertFrequency) existing.alertFrequency = input.alertFrequency;
      return existing;
    }
    const created: Subscription = {
      id: id(),
      customerId: input.customerId,
      productId: input.productId,
      plan: input.plan,
      trialEndsAt: input.trialEndsAt,
      lsSubscriptionId: input.lsSubscriptionId,
      status: input.status,
      alertFrequency: input.alertFrequency ?? "daily",
      lastAlertAt: null,
      createdAt: new Date().toISOString(),
    };
    this.subscriptions.push(created);
    return created;
  }

  async findSubscription(customerId: string, productId: string): Promise<Subscription | null> {
    return (
      this.subscriptions.find((sub) => sub.customerId === customerId && sub.productId === productId) ??
      null
    );
  }

  async findSubscriptionByLsId(lsId: string): Promise<Subscription | null> {
    return this.subscriptions.find((sub) => sub.lsSubscriptionId === lsId) ?? null;
  }

  async listSubscriptions(productId: string): Promise<Subscription[]> {
    return this.subscriptions.filter((sub) => sub.productId === productId);
  }

  async touchLastAlert(subscriptionId: string, at: string): Promise<void> {
    const sub = this.subscriptions.find((item) => item.id === subscriptionId);
    if (sub) sub.lastAlertAt = at;
  }

  async setAlertFrequency(
    customerId: string,
    productId: string,
    frequency: Subscription["alertFrequency"],
  ): Promise<void> {
    const sub = this.subscriptions.find(
      (item) => item.customerId === customerId && item.productId === productId,
    );
    if (sub) sub.alertFrequency = frequency;
  }

  async listApps(customerId: string, productId: string): Promise<AppRecord[]> {
    return this.apps
      .filter((app) => app.customerId === customerId && app.productId === productId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.packageName.localeCompare(b.packageName));
  }

  async listAllApps(productId: string): Promise<AppRecord[]> {
    return this.apps.filter((app) => app.productId === productId);
  }

  async addApp(input: { customerId: string; productId: string; packageName: string }): Promise<AppRecord> {
    const existing = this.apps.find(
      (app) =>
        app.customerId === input.customerId &&
        app.productId === input.productId &&
        app.packageName === input.packageName,
    );
    if (existing) return existing;
    const app: AppRecord = {
      id: id(),
      customerId: input.customerId,
      productId: input.productId,
      packageName: input.packageName,
      createdAt: new Date().toISOString(),
    };
    this.apps.push(app);
    return app;
  }

  async upsertReview(input: Omit<ReviewSnapshot, "id">): Promise<{ row: ReviewSnapshot; inserted: boolean }> {
    const existing = this.reviews.find(
      (review) => review.packageName === input.packageName && review.reviewId === input.reviewId,
    );
    if (existing) {
      existing.stars = input.stars;
      existing.text = input.text;
      existing.author = input.author;
      existing.lastModified = input.lastModified;
      existing.capturedAt = input.capturedAt;
      return { row: existing, inserted: false };
    }
    const row: ReviewSnapshot = { id: id(), ...input };
    this.reviews.push(row);
    return { row, inserted: true };
  }

  async listReviewSnapshots(input: {
    packageName: string;
    since?: string;
    maxStars?: number;
    limit?: number;
  }): Promise<ReviewSnapshot[]> {
    const since = input.since ? Date.parse(input.since) : null;
    const rows = this.reviews
      .filter((review) => review.packageName === input.packageName)
      .filter((review) => (input.maxStars == null ? true : review.stars <= input.maxStars))
      .filter((review) => {
        if (since == null || Number.isNaN(since)) return true;
        const stamp = Date.parse(review.lastModified ?? review.capturedAt);
        return stamp >= since;
      })
      .sort((a, b) => (b.lastModified ?? b.capturedAt).localeCompare(a.lastModified ?? a.capturedAt));
    return rows.slice(0, input.limit ?? 100);
  }

  async countReviews(packageName: string): Promise<number> {
    return this.reviews.filter((review) => review.packageName === packageName).length;
  }

  async upsertVitals(input: Omit<VitalsSnapshot, "id">): Promise<VitalsSnapshot> {
    const existing = this.vitals.find(
      (row) => row.packageName === input.packageName && row.date === input.date,
    );
    if (existing) {
      Object.assign(existing, input);
      return existing;
    }
    const row: VitalsSnapshot = { id: id(), ...input };
    this.vitals.push(row);
    return row;
  }

  async listVitals(packageName: string, sinceDate: string): Promise<VitalsSnapshot[]> {
    return this.vitals
      .filter((row) => row.packageName === packageName && row.date >= sinceDate)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async recordAlert(input: Omit<AlertSent, "id">): Promise<{ inserted: boolean }> {
    const existing = this.alerts.find(
      (alert) =>
        alert.customerId === input.customerId &&
        alert.productId === input.productId &&
        alert.kind === input.kind &&
        alert.subjectKey === input.subjectKey,
    );
    if (existing) return { inserted: false };
    this.alerts.push({ id: id(), ...input });
    return { inserted: true };
  }

  async recordToolEvent(input: RecordToolEventInput): Promise<ToolEvent> {
    const row: ToolEvent = {
      id: id(),
      productId: input.productId,
      customerId: input.customerId,
      keyPrefix: safeKeyPrefix(input.keyPrefix),
      toolName: input.toolName,
      ok: input.ok,
      latencyMs: input.latencyMs,
      createdAt: input.createdAt,
    };
    this.toolEvents.push(row);
    return row;
  }

  async listToolEvents(input: { customerId?: string; productId?: string; limit?: number } = {}): Promise<ToolEvent[]> {
    const limit = clampLimit(input.limit);
    return this.toolEvents
      .filter((row) => (input.customerId ? row.customerId === input.customerId : true))
      .filter((row) => (input.productId ? row.productId === input.productId : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
      .slice(0, limit);
  }
}

function clampLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return 100;
  return Math.min(500, Math.max(1, Math.floor(limit)));
}
