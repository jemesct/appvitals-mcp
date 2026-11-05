import { createShipVitalsServer } from "shipvitals-mcp";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getRepo } from "@/lib/runtime";
import { authenticateRequest } from "@/lib/auth";
import { forwardMcpRequest, recordAuthenticatedToolCall } from "@/lib/mcp-usage";
import { openHostedShipVitals } from "@/lib/shipvitals-host";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Each paying customer uses the App Store Connect key they saved. The ciphertext
// is decrypted for this request only. Do not log it, and do not fall back to
// another customer's key or a shared deployment .p8.

async function handle(req: Request): Promise<Response> {
  const repo = await getRepo();
  const auth = await authenticateRequest(repo, req.headers.get("authorization"), "shipvitals");
  if (!auth.ok) {
    return Response.json({ error: auth.message }, { status: auth.status });
  }
  const record = await repo.getAscCredentials(auth.entitlement.customerId);
  const opened = await openHostedShipVitals({
    env: process.env,
    customerId: auth.entitlement.customerId,
    plan: auth.entitlement.plan,
    registeredAppIds: auth.entitlement.packages,
    record,
  });
  if (!opened.ok) {
    return Response.json({ error: opened.message }, { status: opened.status });
  }
  const body = req.method === "GET" || req.method === "HEAD" ? "" : await req.text();
  const server = createShipVitalsServer({
    client: opened.session.client,
    appIds: opened.session.appIds,
    allowWrites: opened.session.allowWrites,
    vendorNumber: opened.session.vendorNumber,
    salesReports: opened.session.salesReports,
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
