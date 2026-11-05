# AppVitals

Open-source MCP server for Google Play reviews, ratings, crash and ANR rates, and releases. Part of [hostedmcp.dev](https://hostedmcp.dev).

Open core under MIT. The MCP that talks to Play is free to self-host. The [hosted plans](https://hostedmcp.dev/appvitals) add a managed URL and API key, daily review history (Play only keeps about seven days), and alert emails when crash or ANR rates cross Play's limits or a new 1 or 2 star review lands.

## Layout

- `packages/mcp` (`appvitals-mcp`) — the open source MCP server
- `hosted/` — the Next.js app that runs on [hostedmcp.dev](https://hostedmcp.dev)

## Scripts

```bash
npm install
npm run typecheck
npm run build
npm run test
npm run test:e2e
```

`test:e2e` expects `packages/mcp/dist/cli.js`, so build first.

## Google Cloud setup

1. Create a Google Cloud project.
2. Enable **Google Play Android Developer API** and **Google Play Developer Reporting API**.
3. Create a service account and download a JSON key.
4. In Play Console, open Users and permissions and invite the service account email.
5. Grant **View app information and download bulk reports** and **View app quality information**. Add **Reply to reviews** only if you want the write tool.
6. The first API call can take a day or so after the invite. That wait is on Google's side.

Point the server at the key with `GOOGLE_APPLICATION_CREDENTIALS` (a file path) or `APPVITALS_SERVICE_ACCOUNT_JSON` (the JSON on one line). `APPVITALS_PACKAGES` is a comma separated list of application ids.

Mock mode skips Google entirely:

```bash
APPVITALS_MOCK=1 APPVITALS_PACKAGES=com.example.app node packages/mcp/dist/cli.js
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

`.cursor/mcp.json`:

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

## Hosted

Self-hosting the MCP is free. Paid hosting at [hostedmcp.dev/appvitals](https://hostedmcp.dev/appvitals) adds review history past seven days, daily or weekly alert emails, more than one app on the Unlimited plan, and you skip creating your own Google Cloud project.

- US$9 per month, one app
- US$19 per month, unlimited apps
- 7 day free trial

## Licence

MIT. Copyright (c) 2026 builtby_James.
