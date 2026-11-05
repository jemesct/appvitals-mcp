// Launches the built server in mock mode over stdio and calls a few tools.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({ command: "node", args: ["dist/index.js", "--mock"], env: { PATH: process.env.PATH ?? "" } });
const client = new Client({ name: "selfcheck", version: "0" });
await client.connect(transport);
const { tools } = await client.listTools();
console.log(`tools (${tools.length}): ${tools.map((t) => t.name).join(", ")}`);
for (const [name, args] of [["mrr_summary", { provider: "lemonsqueezy" }], ["mrr_summary", { provider: "paddle" }], ["license_key_revoke", { provider: "lemonsqueezy", id: "3001", confirm: true }]]) {
  const r = await client.callTool({ name, arguments: args });
  console.log(`\n${name} ${JSON.stringify(args)}\n${r.content[0].text.slice(0, 400)}`);
}
await client.close();
