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

The same row shape is written for an authenticated call to `/api/mcp/shipvitals`. That route is not a public product. See below.

## ShipVitals

ShipVitals is the open source package in `packages/shipvitals-mcp`. Checkout for `product=shipvitals` returns 403. The connect page does not save Apple app ids. Webhooks for that product are ignored, so a Lemon Squeezy event does not create a subscription.

`/api/mcp/shipvitals` stays closed unless `SHIPVITALS_MOCK` is on or `SHIPVITALS_ALLOWED_APP_IDS` lists numeric app ids. Those ids come from the environment. Apps saved on a customer account are not read. `SHIPVITALS_APP_IDS` does not open the route. Sales and finance tools are not registered, and review replies stay off. A hub API key still needs a `shipvitals` subscription row, which this app will not create from checkout.

Follow-up, not built: a per-customer encrypted `.p8`, so each account would use its own App Store Connect key. Do not serve customers from the deployment key.
