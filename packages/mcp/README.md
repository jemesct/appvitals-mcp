# appvitals-mcp

Open source MCP server for Google Play reviews, vitals, and releases. MIT, copyright builtby_James.

It speaks stdio by default. `--http --port 3333` turns on Streamable HTTP. The hosted app on hostedmcp.dev imports these same tools and adds review history.

## Why

Play Console is about four clicks per app when you just want recent reviews or a crash rate. The reviews API only returns rows created or modified in the last 7 days. This server lets an MCP client ask those questions in one place, and it tells you straight when Google will not answer (page size alignment, lifetime rating).

## Google Cloud setup

1. Create a Google Cloud project.
2. Enable Google Play Android Developer API and Google Play Developer Reporting API.
3. Create a service account and a JSON key.
4. Play Console > Users and permissions > invite that service account email.
5. Grant "View app information and download bulk reports" and "View app quality information".
6. Grant "Reply to reviews" only if you want `reply_to_review` to work.

```bash
npm install
npm run build -w appvitals-mcp
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/key.json
export APPVITALS_PACKAGES=com.example.app
node packages/mcp/dist/cli.js
```

You can pass the key inline as `APPVITALS_SERVICE_ACCOUNT_JSON` instead of a file. Do not commit either.

`APPVITALS_ALLOW_WRITES` must be the string `true` before a reply is sent, and the tool call still has to pass `confirm: true`. Replies are capped at 350 characters.

## Mock mode

```bash
APPVITALS_MOCK=1 APPVITALS_PACKAGES=com.example.app APPVITALS_ALLOW_WRITES=true \
  node packages/mcp/dist/cli.js
```

Mock mode returns fixture reviews, vitals, and a production release. No Google call is made. Handy for checking a client config.

HTTP:

```bash
APPVITALS_MOCK=1 node packages/mcp/dist/cli.js --http --port 3333
```

## Claude Desktop

```json
{
  "mcpServers": {
    "appvitals": {
      "command": "node",
      "args": ["/absolute/path/to/appvitals/packages/mcp/dist/cli.js"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/absolute/path/to/key.json",
        "APPVITALS_PACKAGES": "com.example.app"
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
    "appvitals": {
      "command": "node",
      "args": ["/absolute/path/to/appvitals/packages/mcp/dist/cli.js"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/absolute/path/to/key.json",
        "APPVITALS_PACKAGES": "com.example.app"
      }
    }
  }
}
```

## Claude Code

```bash
claude mcp add appvitals \
  -e GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/key.json \
  -e APPVITALS_PACKAGES=com.example.app \
  -- node /absolute/path/to/appvitals/packages/mcp/dist/cli.js
```

## Tools

- `list_apps`
- `get_recent_reviews` (last 7 days only, star filters, optional translation)
- `reply_to_review` (write, needs confirm and `APPVITALS_ALLOW_WRITES=true`)
- `get_ratings_summary` (from those recent reviews, not a lifetime average)
- `get_ratings_by_country` (same 7-day reviews, grouped by `reviewerLanguage`; the reviews API has no country field)
- `get_vitals` (crash and ANR, flags 1.09% user-perceived crash and 0.47% ANR)
- `get_vitals_breakdown` (same vitals family, one dimension: `device`, `androidVersion`, or `country`)
- `get_user_trends` (daily `distinctUsers` from vitals; install/uninstall counts are not on the Reporting API)
- `get_prelaunch_report` (latest test-track version codes; pre-launch findings are not on the public Play APIs)
- `list_releases` (opens an edit and always deletes it)
- `check_16kb_readiness` (version codes plus a manual checklist, including `zipalign -c -P 16 -v 4 app.apk`)

Errors from Google come back as tool errors. A 401 or 403 tells you to add the service account in Play Console. A 404 means the package name. 429 and 5xx are retried up to 3 times with jitter, and `Retry-After` is honoured. You will not get a stack trace.

## Demo prompts

- How are crash and ANR rates looking for com.example.app over the last week?
- Show the 1 and 2 star reviews from the last week. Draft replies, but do not send them.
- Are we in shape for 16 KB page sizes? Tell me the deadline check is still a Play Console job.
- What version codes are on the production track?

## Build

From the repo root: `npm run build -w appvitals-mcp`. The bin is `appvitals-mcp` once `dist/` exists. This package is not published to npm.
