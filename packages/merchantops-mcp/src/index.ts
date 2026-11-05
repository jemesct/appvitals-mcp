#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

const cfg = loadConfig();
const server = createServer(cfg);
await server.connect(new StdioServerTransport());
console.error(`merchantops-mcp running on stdio${cfg.mock ? " (mock mode)" : ""}${cfg.allowWrites ? " (writes enabled)" : ""}`);
