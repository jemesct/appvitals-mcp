import postgres from "postgres";
import { schemaSql } from "../db/schema";
import { safeKeyPrefix } from "./keys";
import type {
  AlertSent,
  ApiKeyRecord,
  AppRecord,
  AscCredentialRecord,
  Customer,
  MerchantCredentialRecord,
  RecordToolEventInput,
  Repository,
  ReviewSnapshot,
  Subscription,
  ToolEvent,
  UpsertSubscriptionInput,
  VitalsSnapshot,
} from "./repo";
import type { AlertFrequency, PlanId, SubscriptionStatus } from "./products";

type Sql = ReturnType<typeof postgres>;

function iso(value: Date | string | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function dateOnly(value: Date | string): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/* postgres.js row objects are structurally fine at runtime. The generic Row type is awkward to name. */
function mapCustomer(row: any): Customer {
  return { id: row.id, email: row.email, createdAt: iso(row.created_at) ?? new Date().toISOString() };
}

function mapKey(row: any): ApiKeyRecord {
  return {
    id: row.id,
    keyHash: row.key_hash,
    keyPrefix: row.key_prefix,
    customerId: row.customer_id,
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
  };
}

function mapSub(row: any): Subscription {
  return {
    id: row.id,
    customerId: row.customer_id,
    productId: row.product_id,
    plan: row.plan as PlanId,
    trialEndsAt: iso(row.trial_ends_at),
    lsSubscriptionId: row.ls_subscription_id,
    status: row.status as SubscriptionStatus,
    alertFrequency: row.alert_frequency as AlertFrequency,
    lastAlertAt: iso(row.last_alert_at),
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
  };
}

function mapApp(row: any): AppRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    productId: row.product_id,
    packageName: row.package_name,
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
  };
}

function mapReview(row: any): ReviewSnapshot {
  return {
    id: row.id,
    packageName: row.package_name,
    reviewId: row.review_id,
    stars: row.stars,
    text: row.text ?? "",
    author: row.author ?? "",
    lastModified: iso(row.last_modified),
    capturedAt: iso(row.captured_at) ?? new Date().toISOString(),
  };
}

function mapVitals(row: any): VitalsSnapshot {
  return {
    id: row.id,
    packageName: row.package_name,
    date: dateOnly(row.date),
    crashRate: row.crash_rate,
    userPerceivedCrashRate: row.user_perceived_crash_rate,
    anrRate: row.anr_rate,
    userPerceivedAnrRate: row.user_perceived_anr_rate,
    distinctUsers: row.distinct_users,
    slowStartRate: row.slow_start_rate,
    excessiveWakeupRate: row.excessive_wakeup_rate,
    capturedAt: iso(row.captured_at) ?? new Date().toISOString(),
  };
}

export function createPostgresRepository(databaseUrl: string): Repository {
  const sql = postgres(databaseUrl, { max: 5, idle_timeout: 20 });
  return new PostgresRepository(sql);
}

class PostgresRepository implements Repository {
  private schemaReady: Promise<void> | null = null;

  constructor(private readonly sql: Sql) {}

  private ready(): Promise<void> {
    if (!this.schemaReady) {
      this.schemaReady = this.sql.unsafe(schemaSql).then(() => undefined);
    }
    return this.schemaReady;
  }

  async getCustomer(customerId: string): Promise<Customer | null> {
    await this.ready();
    const [row] = await this.sql<{ id: string; email: string; created_at: Date }[]>`
      SELECT id, email, created_at FROM customers WHERE id = ${customerId}
    `;
    return row ? mapCustomer(row) : null;
  }

  async upsertCustomerByEmail(email: string): Promise<Customer> {
    await this.ready();
    const normalised = email.trim().toLowerCase();
    const id = crypto.randomUUID();
    const [row] = await this.sql<Array<{ id: string; email: string; created_at: Date }>>`
      INSERT INTO customers (id, email)
      VALUES (${id}, ${normalised})
      ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
      RETURNING id, email, created_at
    `;
    if (!row) throw new Error("Could not save the customer.");
    return mapCustomer(row);
  }

  async insertApiKey(input: { customerId: string; keyHash: string; keyPrefix: string }): Promise<ApiKeyRecord> {
    await this.ready();
    const keyId = crypto.randomUUID();
    const [row] = await this.sql`
      INSERT INTO api_keys (id, key_hash, key_prefix, customer_id)
      VALUES (${keyId}, ${input.keyHash}, ${input.keyPrefix}, ${input.customerId})
      RETURNING id, key_hash, key_prefix, customer_id, created_at
    `;
    return mapKey(row);
  }

  async findApiKeyByHash(keyHash: string): Promise<(ApiKeyRecord & { customer: Customer }) | null> {
    await this.ready();
    const [row] = await this.sql`
      SELECT k.id, k.key_hash, k.key_prefix, k.customer_id, k.created_at,
             c.id AS customer_row_id, c.email, c.created_at AS customer_created_at
      FROM api_keys k
      JOIN customers c ON c.id = k.customer_id
      WHERE k.key_hash = ${keyHash}
    `;
    if (!row) return null;
    return {
      ...mapKey(row),
      customer: mapCustomer({ id: row.customer_row_id, email: row.email, created_at: row.customer_created_at }),
    };
  }

  async listApiKeys(customerId: string): Promise<ApiKeyRecord[]> {
    await this.ready();
    const rows = await this.sql`
      SELECT id, key_hash, key_prefix, customer_id, created_at
      FROM api_keys WHERE customer_id = ${customerId}
      ORDER BY created_at
    `;
    return rows.map((row) => mapKey(row));
  }

  async upsertSubscription(input: UpsertSubscriptionInput): Promise<Subscription> {
    await this.ready();
    const existing = input.lsSubscriptionId
      ? await this.findSubscriptionByLsId(input.lsSubscriptionId)
      : await this.findSubscription(input.customerId, input.productId);
    if (existing) {
      const [row] = await this.sql`
        UPDATE subscriptions SET
          customer_id = ${input.customerId},
          product_id = ${input.productId},
          plan = ${input.plan},
          trial_ends_at = ${input.trialEndsAt},
          ls_subscription_id = ${input.lsSubscriptionId ?? existing.lsSubscriptionId},
          status = ${input.status},
          alert_frequency = ${input.alertFrequency ?? existing.alertFrequency}
        WHERE id = ${existing.id}
        RETURNING id, customer_id, product_id, plan, trial_ends_at, ls_subscription_id, status, alert_frequency, last_alert_at, created_at
      `;
      return mapSub(row);
    }
    const subId = crypto.randomUUID();
    const [row] = await this.sql`
      INSERT INTO subscriptions (
        id, customer_id, product_id, plan, trial_ends_at, ls_subscription_id, status, alert_frequency
      ) VALUES (
        ${subId}, ${input.customerId}, ${input.productId}, ${input.plan}, ${input.trialEndsAt},
        ${input.lsSubscriptionId}, ${input.status}, ${input.alertFrequency ?? "daily"}
      )
      ON CONFLICT (customer_id, product_id) DO UPDATE SET
        plan = EXCLUDED.plan,
        trial_ends_at = EXCLUDED.trial_ends_at,
        ls_subscription_id = COALESCE(EXCLUDED.ls_subscription_id, subscriptions.ls_subscription_id),
        status = EXCLUDED.status
      RETURNING id, customer_id, product_id, plan, trial_ends_at, ls_subscription_id, status, alert_frequency, last_alert_at, created_at
    `;
    return mapSub(row);
  }

  async findSubscription(customerId: string, productId: string): Promise<Subscription | null> {
    await this.ready();
    const [row] = await this.sql`
      SELECT id, customer_id, product_id, plan, trial_ends_at, ls_subscription_id, status, alert_frequency, last_alert_at, created_at
      FROM subscriptions WHERE customer_id = ${customerId} AND product_id = ${productId}
    `;
    return row ? mapSub(row) : null;
  }

  async findSubscriptionByLsId(lsId: string): Promise<Subscription | null> {
    await this.ready();
    const [row] = await this.sql`
      SELECT id, customer_id, product_id, plan, trial_ends_at, ls_subscription_id, status, alert_frequency, last_alert_at, created_at
      FROM subscriptions WHERE ls_subscription_id = ${lsId}
    `;
    return row ? mapSub(row) : null;
  }

  async listSubscriptions(productId: string): Promise<Subscription[]> {
    await this.ready();
    const rows = await this.sql`
      SELECT id, customer_id, product_id, plan, trial_ends_at, ls_subscription_id, status, alert_frequency, last_alert_at, created_at
      FROM subscriptions WHERE product_id = ${productId}
    `;
    return rows.map((row) => mapSub(row));
  }

  async touchLastAlert(subscriptionId: string, at: string): Promise<void> {
    await this.ready();
    await this.sql`UPDATE subscriptions SET last_alert_at = ${at} WHERE id = ${subscriptionId}`;
  }

  async setAlertFrequency(
    customerId: string,
    productId: string,
    frequency: "daily" | "weekly",
  ): Promise<void> {
    await this.ready();
    await this.sql`
      UPDATE subscriptions SET alert_frequency = ${frequency}
      WHERE customer_id = ${customerId} AND product_id = ${productId}
    `;
  }

  async listApps(customerId: string, productId: string): Promise<AppRecord[]> {
    await this.ready();
    const rows = await this.sql`
      SELECT id, customer_id, product_id, package_name, created_at
      FROM apps WHERE customer_id = ${customerId} AND product_id = ${productId}
      ORDER BY created_at, package_name
    `;
    return rows.map((row) => mapApp(row));
  }

  async listAllApps(productId: string): Promise<AppRecord[]> {
    await this.ready();
    const rows = await this.sql`
      SELECT id, customer_id, product_id, package_name, created_at
      FROM apps WHERE product_id = ${productId}
    `;
    return rows.map((row) => mapApp(row));
  }

  async addApp(input: { customerId: string; productId: string; packageName: string }): Promise<AppRecord> {
    await this.ready();
    const appId = crypto.randomUUID();
    const [row] = await this.sql`
      INSERT INTO apps (id, customer_id, product_id, package_name)
      VALUES (${appId}, ${input.customerId}, ${input.productId}, ${input.packageName})
      ON CONFLICT (customer_id, product_id, package_name) DO UPDATE SET package_name = EXCLUDED.package_name
      RETURNING id, customer_id, product_id, package_name, created_at
    `;
    return mapApp(row);
  }

  async upsertReview(input: Omit<ReviewSnapshot, "id">): Promise<{ row: ReviewSnapshot; inserted: boolean }> {
    await this.ready();
    const reviewRowId = crypto.randomUUID();
    const [row] = await this.sql`
      INSERT INTO review_snapshots (id, package_name, review_id, stars, text, author, last_modified, captured_at)
      VALUES (
        ${reviewRowId}, ${input.packageName}, ${input.reviewId}, ${input.stars}, ${input.text},
        ${input.author}, ${input.lastModified}, ${input.capturedAt}
      )
      ON CONFLICT (package_name, review_id) DO UPDATE SET
        stars = EXCLUDED.stars,
        text = EXCLUDED.text,
        author = EXCLUDED.author,
        last_modified = EXCLUDED.last_modified,
        captured_at = EXCLUDED.captured_at
      RETURNING id, package_name, review_id, stars, text, author, last_modified, captured_at,
                (xmax = 0) AS inserted
    `;
    return { row: mapReview(row), inserted: Boolean(row.inserted) };
  }

  async listReviewSnapshots(input: {
    packageName: string;
    since?: string;
    maxStars?: number;
    limit?: number;
  }): Promise<ReviewSnapshot[]> {
    await this.ready();
    const limit = input.limit ?? 100;
    const rows = await this.sql`
      SELECT id, package_name, review_id, stars, text, author, last_modified, captured_at
      FROM review_snapshots
      WHERE package_name = ${input.packageName}
        AND (${input.maxStars ?? null}::int IS NULL OR stars <= ${input.maxStars ?? null})
        AND (
          ${input.since ?? null}::timestamptz IS NULL
          OR COALESCE(last_modified, captured_at) >= ${input.since ?? null}::timestamptz
        )
      ORDER BY COALESCE(last_modified, captured_at) DESC
      LIMIT ${limit}
    `;
    return rows.map((row) => mapReview(row));
  }

  async countReviews(packageName: string): Promise<number> {
    await this.ready();
    const [row] = await this.sql<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM review_snapshots WHERE package_name = ${packageName}
    `;
    return Number(row?.count ?? 0);
  }

  async upsertVitals(input: Omit<VitalsSnapshot, "id">): Promise<VitalsSnapshot> {
    await this.ready();
    const vitalId = crypto.randomUUID();
    const [row] = await this.sql`
      INSERT INTO vitals_snapshots (
        id, package_name, date, crash_rate, user_perceived_crash_rate, anr_rate,
        user_perceived_anr_rate, distinct_users, slow_start_rate, excessive_wakeup_rate, captured_at
      ) VALUES (
        ${vitalId}, ${input.packageName}, ${input.date}, ${input.crashRate}, ${input.userPerceivedCrashRate},
        ${input.anrRate}, ${input.userPerceivedAnrRate}, ${input.distinctUsers}, ${input.slowStartRate},
        ${input.excessiveWakeupRate}, ${input.capturedAt}
      )
      ON CONFLICT (package_name, date) DO UPDATE SET
        crash_rate = EXCLUDED.crash_rate,
        user_perceived_crash_rate = EXCLUDED.user_perceived_crash_rate,
        anr_rate = EXCLUDED.anr_rate,
        user_perceived_anr_rate = EXCLUDED.user_perceived_anr_rate,
        distinct_users = EXCLUDED.distinct_users,
        slow_start_rate = EXCLUDED.slow_start_rate,
        excessive_wakeup_rate = EXCLUDED.excessive_wakeup_rate,
        captured_at = EXCLUDED.captured_at
      RETURNING id, package_name, date, crash_rate, user_perceived_crash_rate, anr_rate,
                user_perceived_anr_rate, distinct_users, slow_start_rate, excessive_wakeup_rate, captured_at
    `;
    return mapVitals(row);
  }

  async listVitals(packageName: string, sinceDate: string): Promise<VitalsSnapshot[]> {
    await this.ready();
    const rows = await this.sql`
      SELECT id, package_name, date, crash_rate, user_perceived_crash_rate, anr_rate,
             user_perceived_anr_rate, distinct_users, slow_start_rate, excessive_wakeup_rate, captured_at
      FROM vitals_snapshots
      WHERE package_name = ${packageName} AND date >= ${sinceDate}
      ORDER BY date
    `;
    return rows.map((row) => mapVitals(row));
  }

  async recordAlert(input: Omit<AlertSent, "id">): Promise<{ inserted: boolean }> {
    await this.ready();
    const alertId = crypto.randomUUID();
    const rows = await this.sql`
      INSERT INTO alerts_sent (id, customer_id, product_id, kind, subject_key, sent_at)
      VALUES (${alertId}, ${input.customerId}, ${input.productId}, ${input.kind}, ${input.subjectKey}, ${input.sentAt})
      ON CONFLICT (customer_id, product_id, kind, subject_key) DO NOTHING
      RETURNING id
    `;
    return { inserted: rows.length > 0 };
  }

  async recordToolEvent(input: RecordToolEventInput): Promise<ToolEvent> {
    await this.ready();
    const eventId = crypto.randomUUID();
    const prefix = safeKeyPrefix(input.keyPrefix);
    const [row] = await this.sql`
      INSERT INTO mcp_usage (id, product_id, customer_id, key_prefix, tool_name, ok, latency_ms, created_at)
      VALUES (
        ${eventId}, ${input.productId}, ${input.customerId}, ${prefix}, ${input.toolName},
        ${input.ok}, ${input.latencyMs}, ${input.createdAt}
      )
      RETURNING id, product_id, customer_id, key_prefix, tool_name, ok, latency_ms, created_at
    `;
    return mapToolEvent(row);
  }

  async listToolEvents(input: { customerId?: string; productId?: string; limit?: number } = {}): Promise<ToolEvent[]> {
    await this.ready();
    const limit = clampLimit(input.limit);
    const rows = await this.sql`
      SELECT id, product_id, customer_id, key_prefix, tool_name, ok, latency_ms, created_at
      FROM mcp_usage
      WHERE (${input.customerId ?? null}::text IS NULL OR customer_id = ${input.customerId ?? null})
        AND (${input.productId ?? null}::text IS NULL OR product_id = ${input.productId ?? null})
      ORDER BY created_at DESC, id DESC
      LIMIT ${limit}
    `;
    return rows.map((row) => mapToolEvent(row));
  }

  async getMerchantCredentials(customerId: string): Promise<MerchantCredentialRecord | null> {
    await this.ready();
    const [row] = await this.sql`
      SELECT id, customer_id, iv, auth_tag, ciphertext, updated_at
      FROM merchant_credentials WHERE customer_id = ${customerId}
    `;
    return row ? mapAsc(row) : null;
  }

  async upsertMerchantCredentials(input: Omit<MerchantCredentialRecord, "id">): Promise<MerchantCredentialRecord> {
    await this.ready();
    const credentialId = crypto.randomUUID();
    const [row] = await this.sql`
      INSERT INTO merchant_credentials (id, customer_id, iv, auth_tag, ciphertext, updated_at)
      VALUES (${credentialId}, ${input.customerId}, ${input.iv}, ${input.authTag}, ${input.ciphertext}, ${input.updatedAt})
      ON CONFLICT (customer_id) DO UPDATE SET
        iv = EXCLUDED.iv,
        auth_tag = EXCLUDED.auth_tag,
        ciphertext = EXCLUDED.ciphertext,
        updated_at = EXCLUDED.updated_at
      RETURNING id, customer_id, iv, auth_tag, ciphertext, updated_at
    `;
    return mapAsc(row);
  }

  async getAscCredentials(customerId: string): Promise<AscCredentialRecord | null> {
    await this.ready();
    const [row] = await this.sql`
      SELECT id, customer_id, iv, auth_tag, ciphertext, updated_at
      FROM asc_credentials WHERE customer_id = ${customerId}
    `;
    return row ? mapAsc(row) : null;
  }

  async upsertAscCredentials(input: {
    customerId: string;
    iv: string;
    authTag: string;
    ciphertext: string;
    updatedAt: string;
  }): Promise<AscCredentialRecord> {
    await this.ready();
    const credentialId = crypto.randomUUID();
    const [row] = await this.sql`
      INSERT INTO asc_credentials (id, customer_id, iv, auth_tag, ciphertext, updated_at)
      VALUES (${credentialId}, ${input.customerId}, ${input.iv}, ${input.authTag}, ${input.ciphertext}, ${input.updatedAt})
      ON CONFLICT (customer_id) DO UPDATE SET
        iv = EXCLUDED.iv,
        auth_tag = EXCLUDED.auth_tag,
        ciphertext = EXCLUDED.ciphertext,
        updated_at = EXCLUDED.updated_at
      RETURNING id, customer_id, iv, auth_tag, ciphertext, updated_at
    `;
    return mapAsc(row);
  }
}

function clampLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return 100;
  return Math.min(500, Math.max(1, Math.floor(limit)));
}

function mapAsc(row: any): AscCredentialRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    iv: row.iv,
    authTag: row.auth_tag,
    ciphertext: row.ciphertext,
    updatedAt: iso(row.updated_at) ?? new Date().toISOString(),
  };
}

function mapToolEvent(row: any): ToolEvent {
  return {
    id: row.id,
    productId: row.product_id,
    customerId: row.customer_id,
    keyPrefix: row.key_prefix,
    toolName: row.tool_name,
    ok: Boolean(row.ok),
    latencyMs: row.latency_ms == null ? null : Number(row.latency_ms),
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
  };
}
