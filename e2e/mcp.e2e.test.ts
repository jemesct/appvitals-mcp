import { once } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "packages/mcp/dist/cli.js");

function childEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }
  env.APPVITALS_MOCK = "1";
  env.APPVITALS_PACKAGES = "com.example.app";
  env.APPVITALS_ALLOW_WRITES = "true";
  return env;
}

const calls: Array<[string, Record<string, unknown>]> = [
  ["list_apps", {}],
  ["get_recent_reviews", { packageName: "com.example.app", maxResults: 5, maxStars: 5 }],
  ["get_ratings_summary", { packageName: "com.example.app" }],
  ["get_ratings_by_country", { packageName: "com.example.app" }],
  ["get_vitals", { packageName: "com.example.app", days: 7 }],
  ["get_vitals_breakdown", { packageName: "com.example.app", dimension: "country", days: 7 }],
  ["get_user_trends", { packageName: "com.example.app", days: 14 }],
  ["get_prelaunch_report", { packageName: "com.example.app" }],
  ["list_releases", { packageName: "com.example.app" }],
  ["check_16kb_readiness", { packageName: "com.example.app" }],
  [
    "reply_to_review",
    {
      packageName: "com.example.app",
      reviewId: "rev-1",
      replyText: "Thanks, we are looking into the crash.",
      confirm: true,
    },
  ],
];

async function exercise(client: Client): Promise<void> {
  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name);
  for (const [name] of calls) {
    expect(names, `missing ${name}`).toContain(name);
  }
  const reply = listed.tools.find((tool) => tool.name === "reply_to_review");
  expect(reply?.description?.startsWith("WRITE ACTION:")).toBe(true);
  for (const [name, args] of calls) {
    const result = await client.callTool({ name, arguments: args });
    const body = Array.isArray(result.content)
      ? result.content.map((item) => ("text" in item ? item.text : "")).join("\n")
      : "";
    expect(result.isError, `${name}: ${body}`).not.toBe(true);
    expect(body.length).toBeGreaterThan(0);
  }
}

describe("e2e", () => {
  const children: ChildProcess[] = [];

  afterEach(async () => {
    for (const child of children) {
      if (!child.killed) child.kill();
    }
    children.length = 0;
  });

  it("calls every tool over stdio", async () => {
    const transport = new StdioClientTransport({
      command: "node",
      args: [cli],
      env: childEnv(),
      stderr: "pipe",
    });
    const client = new Client({ name: "e2e-stdio", version: "0.0.0" });
    await client.connect(transport);
    try {
      await exercise(client);
    } finally {
      await client.close();
    }
  });

  it("calls every tool over Streamable HTTP", async () => {
    const port = 39331;
    const child = spawn("node", [cli, "--http", "--port", String(port)], {
      cwd: root,
      env: childEnv(),
      stdio: ["ignore", "ignore", "pipe"],
    });
    children.push(child);
    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server did not listen\n${stderr}`)), 10000);
      child.stderr?.on("data", (chunk: string) => {
        if (chunk.includes("listening")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`server exited ${code}\n${stderr}`));
      });
    });
    await ready;
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`));
    const client = new Client({ name: "e2e-http", version: "0.0.0" });
    try {
      await client.connect(transport);
      await exercise(client);
    } finally {
      await client.close().catch(() => undefined);
      child.kill();
      await once(child, "exit").catch(() => undefined);
    }
  });
});
