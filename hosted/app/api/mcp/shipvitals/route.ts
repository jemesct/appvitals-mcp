import { createAscClientFromEnv, createShipVitalsServer } from "shipvitals-mcp";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getRepo } from "@/lib/runtime";
import { authenticateRequest } from "@/lib/auth";
import { forwardMcpRequest, recordAuthenticatedToolCall } from "@/lib/mcp-usage";
import { resolveHostedShipVitals } from "@/lib/shipvitals-host";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-customer encrypted .p8 is the follow-up that would make this multi-tenant.
// Until then, app ids come only from resolveHostedShipVitals (env allowlist or mock).
// Do not pass the customer's saved app list into the App Store Connect client.

async function handle(req: Request): Promise<Response> {
  const gate = resolveHostedShipVitals(process.env);
  if (!gate.open) {
    return Response.json({ error: gate.message }, { status: 403 });
  }
  const repo = await getRepo();
  const auth = await authenticateRequest(repo, req.headers.get("authorization"), "shipvitals");
  if (!auth.ok) {
    return Response.json({ error: auth.message }, { status: auth.status });
  }
  const body = req.method === "GET" || req.method === "HEAD" ? "" : await req.text();
  const server = createShipVitalsServer({
    client: createAscClientFromEnv(process.env),
    appIds: gate.appIds,
    allowWrites: gate.allowWrites,
    vendorNumber: null,
    salesReports: gate.salesReports,
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  const started = Date.now();
  let response: Response | null = null;
  let failed = false;
  try {
    response = await transport.handleRequest(forwardMcpRequest(req, body));
    return response;
  } catch (err) {
    failed = true;
    throw err;
  } finally {
    await recordAuthenticatedToolCall({
      repo,
      productId: "shipvitals",
      customerId: auth.entitlement.customerId,
      keyPrefix: auth.entitlement.keyPrefix,
      body,
      response,
      startedAt: started,
      failed,
    });
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
