import { runAlerts } from "@/lib/alerts";
import { cronAuthorised, getEmail, getRepo } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return run(request);
}

export async function POST(request: Request): Promise<Response> {
  return run(request);
}

async function run(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not set." }, { status: 503 });
  }
  if (!cronAuthorised(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorised." }, { status: 401 });
  }
  const summary = await runAlerts({
    repo: await getRepo(),
    email: getEmail(),
    now: new Date(),
    productId: "appvitals",
  });
  return Response.json({ ok: true, ...summary });
}
