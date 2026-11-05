# merchantops-mcp

An open-core MCP server for merchant ops on **Lemon Squeezy** and **Paddle Billing**. Ask your AI client for MRR, churn, failed payments, refunds, license keys and discount codes, without opening two dashboards.

By builtby_James, [hostedmcp.dev](https://hostedmcp.dev). MIT licensed.

## Install

```bash
git clone https://github.com/jemesct/appvitals-mcp.git
cd appvitals-mcp
npm install
npm run build -w merchantops-mcp
cd packages/merchantops-mcp
```

Needs Node 20 or later.

## Mock mode quickstart

Mock mode serves realistic fixture data for both providers and never calls a real API. No keys needed.

```bash
npm run start:mock                 # stdio server, same as: node dist/index.js --mock
npm run selfcheck                  # launches the server in mock mode and calls a few tools
npx @modelcontextprotocol/inspector node dist/index.js --mock   # browse tools in the Inspector
```

You can also set `MERCHANTOPS_MOCK=1` (or `MOCK=1`) instead of `--mock`.

## Environment variables

The self-host entry points read keys from the environment. Set only the variables you need below; never commit real values.

| Variable | Purpose |
| --- | --- |
| `LEMONSQUEEZY_API_KEY` | Lemon Squeezy API key (Settings > API) |
| `LEMONSQUEEZY_STORE_ID` | Optional store filter. Required for `discount_create` |
| `PADDLE_API_KEY` | Paddle Billing API key |
| `PADDLE_ENV` | `sandbox` (default) or `production` |
| `MERCHANTOPS_MOCK` | `1` for mock mode |
| `MERCHANTOPS_ALLOW_WRITES` | `1` to allow writes (see below) |
| `MERCHANTOPS_HTTP_PORT`, `MERCHANTOPS_HTTP_TOKEN` | Optional HTTP entry |

Configure one provider or both. Tools for an unconfigured provider return a clear error.

## MCP client config

```json
{
  "mcpServers": {
    "merchantops": {
      "command": "node",
      "args": ["/path/to/merchantops-mcp/dist/index.js"],
      "env": {
        "LEMONSQUEEZY_API_KEY": "...",
        "PADDLE_API_KEY": "...",
        "PADDLE_ENV": "production"
      }
    }
  }
}
```

Add `"--mock"` to `args` to try it with fixture data.

## Tools

Every tool takes `provider`: `lemonsqueezy` or `paddle`. Amounts are in minor units (cents).

| Tool | What it does |
| --- | --- |
| `providers_status` | Configured providers, mock and writes flags, what each provider supports |
| `mrr_summary` | MRR and ARR per currency, counts by status. `include_trials` optional |
| `subscriptions_list` | Normalised subscriptions, optional `status` filter |
| `churned_subscriptions` | Cancelled or expired in the last `since_days` (default 30), with lost MRR |
| `failed_payments` | Past due subscriptions, failed orders (Lemon Squeezy) or past due transactions (Paddle) |
| `refunds_list` | Refunded orders (Lemon Squeezy) or refund adjustments (Paddle) |
| `refund_issue` | **Write.** Full or partial order refund (Lemon Squeezy), full transaction refund (Paddle) |
| `license_keys_list` | License keys (Lemon Squeezy only) |
| `license_key_issue` | Explains why neither API can mint keys on demand |
| `license_key_revoke` | **Write.** Disables a Lemon Squeezy key |
| `discounts_list` | Discount codes |
| `discount_create` | **Write.** Percent or fixed discount code |

### Provider support

| Capability | Lemon Squeezy | Paddle Billing |
| --- | --- | --- |
| Subscriptions, MRR, churn | Yes | Yes |
| Failed payments | Past due or unpaid subscriptions, failed orders | Past due transactions and subscriptions |
| List refunds | Yes (orders with refunds) | Yes (`/adjustments?action=refund`) |
| Issue refund | Full or partial (`POST /v1/orders/:id/refund`) | Full only (`POST /adjustments`). Live refunds usually wait for Paddle approval |
| License keys list / revoke | Yes | No, Paddle Billing has no native license keys |
| License key issue | No API endpoint (keys are created on purchase) | No |
| Discounts list / create | Yes (create needs `LEMONSQUEEZY_STORE_ID`) | Yes (fixed needs a currency) |

## Writes policy

Writes are dry runs by default. A write only happens when **both**:

1. the server runs with `MERCHANTOPS_ALLOW_WRITES=1`, and
2. the tool call passes `confirm: true`.

Otherwise the tool returns `dryRun: true` with the exact request it would send, so you can check it first. Use a read-only or restricted API key where the provider allows it if you don't need writes.

## MRR maths

MRR counts active and past due subscriptions (trials only with `include_trials`). Each subscription's per-period amount (unit price x quantity, summed over items) is normalised to a month: yearly / 12, quarterly / 3, weekly x 52 / 12, daily x 365 / 12. Currencies are kept separate with no FX conversion. Discounts, tax and usage-based charges are not modelled.

## Optional HTTP entry

`npm run start:http` starts a stateless Streamable HTTP endpoint at `http://127.0.0.1:8787/mcp`. It needs `MERCHANTOPS_HTTP_TOKEN` (sent as a Bearer token) unless in mock mode. It binds to localhost; put it behind your own TLS proxy to expose it. The managed service is implemented by `hosted/app/api/mcp/merchantops` in this workspace.

## Development

```bash
# From the monorepo root
npm run typecheck && npm test && npm run build
```

## Limitations

- Lemon Squeezy MRR uses each subscription's first item price (`first_subscription_item`), looked up via `/v1/prices/:id`. Multi-item or usage-based subscriptions may be undercounted.
- Lemon Squeezy has no "failed" invoice status, so failed payments are past due or unpaid subscriptions plus failed orders.
- Paddle partial refunds need per-item amounts and aren't supported yet.
- Lists fetch every page (up to 100 pages) and filter locally; large stores will be slow.
- Churn uses the cancellation time where known, otherwise the end date.

## Licence

MIT. See [LICENSE](LICENSE).

## Hosted integration

Imported from `jemesct/merchantops-mcp` at `44434a18000bce327ec365ca50209a7a50d47c6e`. Provider tools, calculations, fixtures, and self-host entry points are reused. Dependencies use the hub's existing SDK and Zod versions.

The server factory accepts optional named `StoreConnection[]` as its third argument. Each connection has its own explicit `Config` and optional scoped fetch function. `providers_status` exposes only ids and provider metadata. Other tools accept `store` to choose a connection; ambiguous or unknown ids fail before an API request. Calls without named connections retain the self-host behavior.

The hub decrypts customer keys, enforces the plan, and passes these explicit connections. It does not call `loadConfig` or use a deployment store key. See `../../hosted/README.md` for credential storage and manual billing setup.
