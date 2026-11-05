import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadConfig } from "../src/config.js";
import { createMockFetch } from "../src/mock/fetch.js";
import { createServer } from "../src/server.js";

export type Call = { method: string; url: string; body?: unknown };

export async function connect(env: Record<string, string> = {}) {
  const calls: Call[] = [];
  const cfg = loadConfig({ MERCHANTOPS_MOCK: "1", ...env }, []);
  const server = createServer(cfg, createMockFetch(calls));
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean };
    const text = r.content[0].text;
    let data: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    try { data = JSON.parse(text); } catch { data = text; }
    return { isError: !!r.isError, text, data };
  };
  return { client, call, calls };
}
