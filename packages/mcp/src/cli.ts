#!/usr/bin/env node
import { createServer } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { createServerFromEnv } from "./server.js";

function log(message: string): void {
  process.stderr.write(`${message}\n`);
}

async function startStdio(): Promise<void> {
  const server = createServerFromEnv();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function startHttp(port: number): Promise<void> {
  const http = createServer(async (req, res) => {
    try {
      const server = createServerFromEnv();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res);
      res.on("close", () => {
        void transport.close().catch(() => undefined);
        void server.close().catch(() => undefined);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Server error";
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: message }));
      } else {
        res.end();
      }
    }
  });
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(port, "127.0.0.1", () => resolve());
  });
  log(`appvitals-mcp listening on http://127.0.0.1:${port}/mcp`);
}

async function main(): Promise<void> {
  const config = loadConfig(process.env, process.argv.slice(2));
  if (config.http) {
    await startHttp(config.port);
    return;
  }
  await startStdio();
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  log(message);
  process.exit(1);
});
