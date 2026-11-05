#!/usr/bin/env node
// Optional Streamable HTTP entry for self-hosting. Stateless: one server per request.
// Requires MERCHANTOPS_HTTP_TOKEN (Bearer) unless in mock mode. Not the managed hostedmcp.dev service.
import { createServer as createHttp } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

const cfg = loadConfig();
const port = Number(process.env.MERCHANTOPS_HTTP_PORT ?? 8787);
const token = process.env.MERCHANTOPS_HTTP_TOKEN;
if (!token && !cfg.mock) { console.error("Set MERCHANTOPS_HTTP_TOKEN before exposing real API keys over HTTP."); process.exit(1); }

createHttp(async (req, res) => {
  if (req.url !== "/mcp") { res.writeHead(404).end(); return; }
  if (token && req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end("Unauthorised"); return; }
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
  const server = createServer(cfg);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, body);
}).listen(port, "127.0.0.1", () => console.error(`merchantops-mcp HTTP on http://127.0.0.1:${port}/mcp${cfg.mock ? " (mock mode)" : ""}`));
