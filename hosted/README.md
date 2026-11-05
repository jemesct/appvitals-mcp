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
