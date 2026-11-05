import type { AlertFrequency, PlanId, SubscriptionStatus } from "./products";

export interface Customer {
  id: string;
  email: string;
  createdAt: string;
}

export interface ApiKeyRecord {
  id: string;
  keyHash: string;
  keyPrefix: string;
  customerId: string;
  createdAt: string;
}

export interface Subscription {
  id: string;
  customerId: string;
  productId: string;
  plan: PlanId;
  trialEndsAt: string | null;
  lsSubscriptionId: string | null;
  status: SubscriptionStatus;
  alertFrequency: AlertFrequency;
  lastAlertAt: string | null;
  createdAt: string;
}

export interface AppRecord {
  id: string;
  customerId: string;
  productId: string;
  packageName: string;
  createdAt: string;
}

export interface ReviewSnapshot {
  id: string;
  packageName: string;
  reviewId: string;
  stars: number;
  text: string;
  author: string;
  lastModified: string | null;
  capturedAt: string;
}

export interface VitalsSnapshot {
  id: string;
  packageName: string;
  date: string;
  crashRate: number | null;
  userPerceivedCrashRate: number | null;
  anrRate: number | null;
  userPerceivedAnrRate: number | null;
  distinctUsers: number | null;
  slowStartRate: number | null;
  excessiveWakeupRate: number | null;
  capturedAt: string;
}

export interface AlertSent {
  id: string;
  customerId: string;
  productId: string;
  kind: string;
  subjectKey: string;
  sentAt: string;
}

export interface ToolEvent {
  id: string;
  productId: string;
  customerId: string;
  keyPrefix: string;
  toolName: string;
  ok: boolean;
  latencyMs: number | null;
  createdAt: string;
}

export interface AscCredentialRecord {
  id: string;
  customerId: string;
  iv: string;
  authTag: string;
  ciphertext: string;
  updatedAt: string;
}

export interface RecordToolEventInput {
  productId: string;
  customerId: string;
  keyPrefix: string;
  toolName: string;
  ok: boolean;
  latencyMs: number | null;
  createdAt: string;
}

export interface UpsertSubscriptionInput {
  customerId: string;
  productId: string;
  plan: PlanId;
  trialEndsAt: string | null;
  lsSubscriptionId: string | null;
  status: SubscriptionStatus;
  alertFrequency?: AlertFrequency;
}

export interface Repository {
  upsertCustomerByEmail(email: string): Promise<Customer>;
  getCustomer(id: string): Promise<Customer | null>;
  insertApiKey(input: { customerId: string; keyHash: string; keyPrefix: string }): Promise<ApiKeyRecord>;
  findApiKeyByHash(keyHash: string): Promise<(ApiKeyRecord & { customer: Customer }) | null>;
  listApiKeys(customerId: string): Promise<ApiKeyRecord[]>;
  upsertSubscription(input: UpsertSubscriptionInput): Promise<Subscription>;
  findSubscription(customerId: string, productId: string): Promise<Subscription | null>;
  findSubscriptionByLsId(lsId: string): Promise<Subscription | null>;
  listSubscriptions(productId: string): Promise<Subscription[]>;
  touchLastAlert(subscriptionId: string, at: string): Promise<void>;
  setAlertFrequency(customerId: string, productId: string, frequency: AlertFrequency): Promise<void>;
  listApps(customerId: string, productId: string): Promise<AppRecord[]>;
  listAllApps(productId: string): Promise<AppRecord[]>;
  addApp(input: { customerId: string; productId: string; packageName: string }): Promise<AppRecord>;
  upsertReview(
    input: Omit<ReviewSnapshot, "id">,
  ): Promise<{ row: ReviewSnapshot; inserted: boolean }>;
  listReviewSnapshots(input: {
    packageName: string;
    since?: string;
    maxStars?: number;
    limit?: number;
  }): Promise<ReviewSnapshot[]>;
  countReviews(packageName: string): Promise<number>;
  upsertVitals(input: Omit<VitalsSnapshot, "id">): Promise<VitalsSnapshot>;
  listVitals(packageName: string, sinceDate: string): Promise<VitalsSnapshot[]>;
  recordAlert(input: Omit<AlertSent, "id">): Promise<{ inserted: boolean }>;
  recordToolEvent(input: RecordToolEventInput): Promise<ToolEvent>;
  listToolEvents(input?: { customerId?: string; productId?: string; limit?: number }): Promise<ToolEvent[]>;
  getAscCredentials(customerId: string): Promise<AscCredentialRecord | null>;
  upsertAscCredentials(input: {
    customerId: string;
    iv: string;
    authTag: string;
    ciphertext: string;
    updatedAt: string;
  }): Promise<AscCredentialRecord>;
}
