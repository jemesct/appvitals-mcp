-- hostedmcp.dev schema. Accounts and API keys are hub-wide.
-- Subscriptions and entitlements are per product.

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  product_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  trial_ends_at TIMESTAMPTZ,
  ls_subscription_id TEXT UNIQUE,
  status TEXT NOT NULL,
  alert_frequency TEXT NOT NULL DEFAULT 'daily',
  last_alert_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (customer_id, product_id)
);

-- package_name is the resource id for that product:
-- an Android application id for AppVitals, or a numeric Apple app id for ShipVitals.
CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  product_id TEXT NOT NULL,
  package_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (customer_id, product_id, package_name)
);

CREATE TABLE IF NOT EXISTS review_snapshots (
  id TEXT PRIMARY KEY,
  package_name TEXT NOT NULL,
  review_id TEXT NOT NULL,
  stars INTEGER NOT NULL,
  text TEXT,
  author TEXT,
  last_modified TIMESTAMPTZ,
  captured_at TIMESTAMPTZ NOT NULL,
  UNIQUE (package_name, review_id)
);

CREATE TABLE IF NOT EXISTS vitals_snapshots (
  id TEXT PRIMARY KEY,
  package_name TEXT NOT NULL,
  date DATE NOT NULL,
  crash_rate DOUBLE PRECISION,
  user_perceived_crash_rate DOUBLE PRECISION,
  anr_rate DOUBLE PRECISION,
  user_perceived_anr_rate DOUBLE PRECISION,
  distinct_users INTEGER,
  slow_start_rate DOUBLE PRECISION,
  excessive_wakeup_rate DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL,
  UNIQUE (package_name, date)
);

CREATE TABLE IF NOT EXISTS alerts_sent (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  product_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL,
  UNIQUE (customer_id, product_id, kind, subject_key)
);

-- Metadata for hosted MCP tools/call requests. No arguments, review text, or full API keys.
CREATE TABLE IF NOT EXISTS mcp_usage (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  key_prefix TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  ok BOOLEAN NOT NULL,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS mcp_usage_product_created
  ON mcp_usage (product_id, created_at DESC);

-- Per-customer App Store Connect key. The .p8, key id, issuer id, and vendor number
-- live in the ciphertext (AES-256-GCM). Nothing in this table is the plaintext key.
CREATE TABLE IF NOT EXISTS asc_credentials (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL UNIQUE REFERENCES customers(id),
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-customer MerchantOps store keys. Provider, store id, and environment are
-- encrypted together with the keys, using MERCHANTOPS_CREDENTIALS_KEY.
CREATE TABLE IF NOT EXISTS merchant_credentials (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL UNIQUE REFERENCES customers(id),
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
