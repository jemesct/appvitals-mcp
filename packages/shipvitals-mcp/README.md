# shipvitals-mcp

Open source MCP server for App Store Connect reviews, TestFlight, version status, and sales reports. MIT, copyright builtby_James.

It speaks stdio by default. `--http --port 3334` turns on Streamable HTTP. The hosted app on hostedmcp.dev imports these same tools and gates them with a hub API key.

## Why

App Store Connect is a lot of clicks when you want recent reviews, whether a version is waiting for review, or what TestFlight testers just sent. This server lets an MCP client ask those questions in one place, and it says straight when Apple will not answer (lifetime rating, a live crash rate, a per-app sales JSON API).

## App Store Connect setup

1. Open App Store Connect, then Users and Access, then Integrations, then App Store Connect API.
2. Generate a Team key and download the `.p8` once. Note the Key ID and the Issuer ID.
3. Give the key a role that matches what you want to read. Admin covers all of the tools. Customer Support can read and reply to reviews. Sales can download sales reports. Finance (or Admin) is required for finance reports.
4. Copy the numeric Apple app id (App Information, or the URL in App Store Connect). The bundle id is not accepted.
5. For sales and finance tools, copy the vendor number from Payments and Financial Reports.

```bash
npm install
npm run build -w shipvitals-mcp
export SHIPVITALS_ISSUER_ID=your-issuer-id
export SHIPVITALS_KEY_ID=your-key-id
export SHIPVITALS_PRIVATE_KEY_PATH=/absolute/path/to/AuthKey.p8
export SHIPVITALS_APP_IDS=1234567890
export SHIPVITALS_VENDOR_NUMBER=80012345
node packages/shipvitals-mcp/dist/cli.js
```

You can pass the PEM inline as `SHIPVITALS_PRIVATE_KEY` instead of a file. Newlines can be real newlines or the two characters `\` and `n`. Do not commit the `.p8`.

The server mints an ES256 JWT (`aud` `appstoreconnect-v1`) that lives 15 minutes, under Apple's 20 minute maximum, and refreshes it. The private key is not written into errors.

`SHIPVITALS_ALLOW_WRITES` must be the string `true` before a review reply is sent, and the tool call still has to pass `confirm: true`. Replies are capped at 5,970 characters, which is Apple's limit on `customerReviewResponses`.

## Mock mode

```bash
SHIPVITALS_MOCK=1 SHIPVITALS_ALLOW_WRITES=true \
  node packages/shipvitals-mcp/dist/cli.js
```

Mock mode returns fixture reviews, a Ready for Sale version, a TestFlight build, tester feedback, a sales total, a finance total, and an analytics-report catalogue. No Apple call is made. The default app id is `1234567890` and the fixture vendor number used by the tools still has to be passed or set (`SHIPVITALS_VENDOR_NUMBER=80012345`) because the tool contract matches live mode.

HTTP:

```bash
SHIPVITALS_MOCK=1 SHIPVITALS_VENDOR_NUMBER=80012345 \
  node packages/shipvitals-mcp/dist/cli.js --http --port 3334
```

## Claude Desktop

```json
{
  "mcpServers": {
    "shipvitals": {
      "command": "node",
      "args": ["/absolute/path/to/appvitals/packages/shipvitals-mcp/dist/cli.js"],
      "env": {
        "SHIPVITALS_PRIVATE_KEY_PATH": "/absolute/path/to/AuthKey.p8",
        "SHIPVITALS_KEY_ID": "your-key-id",
        "SHIPVITALS_ISSUER_ID": "your-issuer-id",
        "SHIPVITALS_APP_IDS": "1234567890",
        "SHIPVITALS_VENDOR_NUMBER": "80012345"
      }
    }
  }
}
```

## Cursor

Put this in `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "shipvitals": {
      "command": "node",
      "args": ["/absolute/path/to/appvitals/packages/shipvitals-mcp/dist/cli.js"],
      "env": {
        "SHIPVITALS_PRIVATE_KEY_PATH": "/absolute/path/to/AuthKey.p8",
        "SHIPVITALS_KEY_ID": "your-key-id",
        "SHIPVITALS_ISSUER_ID": "your-issuer-id",
        "SHIPVITALS_APP_IDS": "1234567890"
      }
    }
  }
}
```

## Tools

- `list_apps`
- `list_reviews` (optional exact `rating` and `territory`; the average is only the rows returned)
- `reply_to_review` (write, needs confirm and `SHIPVITALS_ALLOW_WRITES=true`)
- `get_app_status` (app, latest versions, phased release when one exists)
- `list_testflight_builds`
- `get_testflight_feedback` (tester crashes and screenshots, emails omitted)
- `get_sales_summary` (vendor Sales and Trends SUMMARY file, optional SKU filter)
- `get_finance_summary` (one monthly region file)
- `get_perf_summary` (existing Analytics Report requests only)

Errors from Apple come back as tool errors. A 401 tells you to check the issuer, key id, and `.p8`. A 403 names the role you are missing. A 404 on a report usually means Apple has not published that date. 429 and 5xx are retried up to 3 times, and `Retry-After` is honoured. You will not get a stack trace or the private key.

## What Apple does not offer

Be careful with the numbers. Several things people expect from Play Console are not in this API.

- There is no lifetime App Store rating on the reviews endpoint. `list_reviews` can count the page it fetched. That is not the public rating.
- Sales and finance data are gzip TSV files for the whole vendor number, not JSON for one app. `appId` on those tools is only the entitlement check. Pass `sku` on sales if you want one product. `DETAILED` sales files are not downloaded. Proceeds in more than one currency are not added together.
- There is no MRR field, no payout date, and no account balance.
- Daily sales reports often lag by a day or two. Finance reports are monthly, per Apple financial region (`US`, `AU`, `GB`, `JP`, `EU`, and others), and they show up after Apple processes the fiscal month.
- There is no synchronous crash rate, hang rate, or launch-time query, and no bad-behaviour threshold like Play's 1.09% crash rate. Analytics Reports are asynchronous: someone creates a request, Apple generates a CSV, then you download it. `get_perf_summary` only lists requests that already exist. It does not create one, it does not download the CSV, and mock mode labels its catalogue as a fixture so it is not mistaken for a rate.
- TestFlight crash feedback is what testers submitted. It is not the production crash rate. Xcode Organizer is not in this API.
- A missing phased release is normal. Only versions that use one have that resource.
- One API key is one team. App Store Connect has no equivalent of inviting a Play service account into someone else's developer account.
- Metadata edits, screenshot uploads, review submission, price changes, and in-app purchase edits are not tools here. The only write is `reply_to_review`, and it is off unless you opt in.

## Hosted

Self-hosting the MCP is free. Paid hosting at [hostedmcp.dev/shipvitals](https://hostedmcp.dev/shipvitals) is a separate subscription from AppVitals (US$9 for one app, US$19 for unlimited apps on that deployment, 7 day trial). A Play and App Store bundle is not a checkout option yet.

Hosted ShipVitals uses the API key configured on the server (`SHIPVITALS_ISSUER_ID`, `SHIPVITALS_KEY_ID`, `SHIPVITALS_PRIVATE_KEY`). It cannot see a different Apple team. Register numeric app ids after checkout. To use your own team, run this package yourself.

## Demo prompts

- Show the 1 and 2 star App Store reviews for 1234567890. Draft replies, but do not send them.
- Is 1.4.0 ready for sale, and is a phased release running?
- What did TestFlight testers say about the latest build? Do not treat that as the production crash rate.
- Summarise the daily sales report for 2026-11-02. Remind me it is the whole vendor, not one app.
- Are there any Analytics Report requests for crashes? If not, say that a live crash rate is not available.

## Build

From the repo root: `npm run build -w shipvitals-mcp`. The bin is `shipvitals-mcp` once `dist/` exists. This package is not published to npm.
