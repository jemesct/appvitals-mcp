import { createAscClientFromEnv, createShipVitalsServer, loadConfig } from "shipvitals-mcp";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getRepo } from "@/lib/runtime";
import { authenticateRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: Request): Promise<Response> {
  const repo = await getRepo();
  const auth = await authenticateRequest(repo, req.headers.get("authorization"), "shipvitals");
  if (!auth.ok) {
    return Response.json({ error: auth.message }, { status: auth.status });
  }
  const config = loadConfig(process.env);
  const server = createShipVitalsServer({
    client: createAscClientFromEnv(process.env),
    appIds: auth.entitlement.packages,
    allowWrites: config.allowWrites,
    vendorNumber: config.vendorNumber,
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

export function GET(req: Request): Promise<Response> {
  return handle(req);
}

export function POST(req: Request): Promise<Response> {
  return handle(req);
}

export function DELETE(req: Request): Promise<Response> {
  return handle(req);
}
