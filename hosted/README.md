# hostedmcp.dev

Next.js app for the hub. It serves the product pages, Lemon Squeezy checkout, and the remote MCP routes.

```bash
npm run dev -w hostedmcp
```

Without `DATABASE_URL` the app keeps accounts in memory. With it, `hosted/db/schema.sql` is applied on first use.

## AppVitals usage

`POST /api/mcp/appvitals` writes one `mcp_usage` row for each authenticated `tools/call`. The row stores the time, tool name, API key prefix (8 characters), customer id, whether the tool result was an error, and latency in milliseconds.

Arguments, review text, and the rest of the API key are not stored. `tools/list` and other MCP methods are not rows. There is no admin HTTP endpoint. Read the table directly:

```sql
SELECT created_at, tool_name, key_prefix, customer_id, ok, latency_ms
FROM mcp_usage
WHERE product_id = 'appvitals'
ORDER BY created_at DESC
LIMIT 50;
```

The same row shape is written for an authenticated call to `/api/mcp/shipvitals`. Arguments, review text, and the `.p8` are not stored in that table.

## ShipVitals (iOS)

Hosted ShipVitals is App Store Connect, not Google Play. Checkout uses `LEMONSQUEEZY_VARIANT_SHIPVITALS_SOLO` (Soft, US$9) and `LEMONSQUEEZY_VARIANT_SHIPVITALS_UNLIMITED` (Team, US$19), plus the shared `LEMONSQUEEZY_API_KEY` and `LEMONSQUEEZY_STORE_ID`.

Each customer pastes their own Key ID, Issuer ID, and `.p8` on `/shipvitals/connect`. Optional vendor number turns on sales and finance for that customer only. A caller cannot pass a different vendor number.

`SHIPVITALS_CREDENTIALS_KEY` is required before a key can be saved. It must be 32 bytes: 64 hex characters, or base64 that decodes to 32 bytes. Generate one with `openssl rand -base64 32`. Do not commit it. The database stores AES-256-GCM ciphertext only. The connect response does not include the `.p8`.

`/api/mcp/shipvitals` decrypts that customer's row and lists apps with their key. Registered app ids are kept only when that key can see them. Another customer's key is never used.

`SHIPVITALS_MOCK=1` serves fixtures when the account has no saved key. `SHIPVITALS_OPERATOR_CUSTOMER_ID` with `SHIPVITALS_ALLOWED_APP_IDS` is a single-account fallback that still uses the deployment key from `SHIPVITALS_ISSUER_ID`, `SHIPVITALS_KEY_ID`, and `SHIPVITALS_PRIVATE_KEY`. Leave the operator id unset in production if every customer uploads a key. `SHIPVITALS_ALLOW_WRITES=true` allows review replies for customer keys. It stays off for the operator fallback.

## MerchantOps

`/merchantops` explains the Lemon Squeezy and Paddle MCP. There is no checkout and no credential form. The package lives in the private repo `jemesct/merchantops-mcp`.
