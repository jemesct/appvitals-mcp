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

`/merchantops` offers Solo (US$9/month, one store and one provider key) and Team (US$19/month, multiple stores on either or both providers). Both have a 7 day trial. `/api/mcp/merchantops` uses the same hub-wide bearer API key and per-product subscription checks as ShipVitals.

After checkout the email links to `/merchantops/connect`. Customers save their own keys, a numeric store id for each Lemon Squeezy store, and a production/sandbox environment for each Paddle key. Saving checks read access and replaces the entire store set atomically. Failed checks leave the previous set intact. Keys are password fields and are never returned after save, put in redirects, or logged in `mcp_usage`. The usage table records metadata only, just like ShipVitals.

Set `MERCHANTOPS_CREDENTIALS_KEY` to an independent random 32-byte key (`openssl rand -base64 32`). Hex (64 characters) is also accepted. Do not reuse `SHIPVITALS_CREDENTIALS_KEY` or commit either key. Back it up securely: changing it without re-encrypting the stored rows means customers must save their keys again. The additive `merchant_credentials` table is applied on first database use, along with the existing schema. Production needs persistent `DATABASE_URL`; the memory fallback is for local development only.

Each request decrypts only the authenticated customer's bundle. There is no fallback to `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `PADDLE_API_KEY`, or mock credentials. Those first two variables remain the hub's billing credentials, separate from customer store keys. Solo is checked at save and again at request time, so a downgrade cannot keep multiple stores active. A downgraded customer saves a single store to resume.

`providers_status` lists saved ids (`store-1`, `store-2`, ... in form order). Other tools accept an optional `store` id; it is required when the selected provider has multiple stores. Lemon Squeezy reads are filtered to the saved store, and direct refund/licence writes check ownership before executing. Paddle entries cover the account belonging to that key. `MERCHANTOPS_ALLOW_WRITES=1` (or `true`) enables hosted writes, still requiring `confirm: true` per call. Leave it unset for read-only hosting and dry runs.

### Manual billing setup (not performed by this branch)

1. Create two Lemon Squeezy **test-mode** subscription products/variants: MerchantOps Solo at US$9/month and MerchantOps Team at US$19/month, each with a 7 day free trial.
2. Set `LEMONSQUEEZY_VARIANT_MERCHANTOPS_SOLO` and `LEMONSQUEEZY_VARIANT_MERCHANTOPS_UNLIMITED` to their test-mode variant ids. Neither has a default or a committed value. Use the matching test-mode billing API key/store when testing in an isolated environment; do not replace live shared billing settings.
3. Set the independent `MERCHANTOPS_CREDENTIALS_KEY`, persistent database, and existing webhook/email configuration in the intended environment. Verify signed subscription-created/updated/cancelled events reach `/api/webhooks/lemonsqueezy`.
4. Test checkout, emailed hub key, store-key save, both MCP providers, Team downgrade, and cancellation in that isolated environment. No deployment or live billing changes are part of this PR.

When variants are missing, the MerchantOps page shows checkout as unavailable and `/api/checkout?product=merchantops&plan=solo` returns the existing 503 configuration message without contacting Lemon Squeezy.

### Branch deployment guard

`vercel.json` and `hosted/vercel.json` disable automatic Vercel Git deployments for `hosted-merchantops` only, covering either project root so pushing this PR does not create a preview. Other branches keep their existing behavior. No deployment command or live project setting is changed.

### Package provenance

`packages/merchantops-mcp` was copied from `jemesct/merchantops-mcp` commit `44434a18000bce327ec365ca50209a7a50d47c6e`, including its MIT licence, source, fixtures, tests, and stdio selfcheck. It is a workspace package like ShipVitals, not a runtime dependency on a private GitHub checkout. Its existing tools are reused; the server factory adds optional named-store connections. The SDK version and Zod dependency follow the hub's existing versions. Future upstream changes must be synced deliberately.
