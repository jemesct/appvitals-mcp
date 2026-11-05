import { handleLemonEvent, verifyLemonSignature } from "@/lib/lemonsqueezy";
import { getEmail, getRepo } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json(
      { error: "LEMONSQUEEZY_WEBHOOK_SECRET is not set, so webhooks are refused." },
      { status: 503 },
    );
  }
  const raw = await request.text();
  if (!verifyLemonSignature(raw, request.headers.get("x-signature"), secret)) {
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }
  let event: unknown;
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Body is not JSON." }, { status: 400 });
  }
  const result = await handleLemonEvent({
    event: event as Parameters<typeof handleLemonEvent>[0]["event"],
    repo: await getRepo(),
    email: getEmail(),
    env: process.env,
    now: new Date(),
  });
  if (!result.ok) return Response.json({ error: result.message }, { status: 400 });
  return Response.json({ ok: true, ignored: result.ignored ?? false, apiKeyIssued: Boolean(result.apiKey) });
}
