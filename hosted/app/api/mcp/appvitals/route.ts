import { createAppVitalsServer } from "appvitals-mcp";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getPlayClient, getRepo } from "@/lib/runtime";
import { authenticateRequest } from "@/lib/auth";
import { forwardMcpRequest, recordAuthenticatedToolCall } from "@/lib/mcp-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: Request): Promise<Response> {
  const repo = await getRepo();
  const auth = await authenticateRequest(repo, req.headers.get("authorization"), "appvitals");
  if (!auth.ok) {
    return Response.json({ error: auth.message }, { status: auth.status });
  }
  const body = req.method === "GET" || req.method === "HEAD" ? "" : await req.text();
  const server = createAppVitalsServer({
    client: getPlayClient(),
    packages: auth.entitlement.packages,
    allowWrites: process.env.APPVITALS_ALLOW_WRITES === "true" || process.env.APPVITALS_ALLOW_WRITES === "1",
    reviewHistory: async (query) => {
      const rows = await repo.listReviewSnapshots({
        packageName: query.packageName,
        ...(query.since ? { since: query.since } : {}),
        ...(query.maxStars != null ? { maxStars: query.maxStars } : {}),
        limit: 100,
      });
      return rows;
    },
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
      productId: "appvitals",
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
