import { handleCheckoutRequest } from "@/lib/lemonsqueezy";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const result = await handleCheckoutRequest({ requestUrl: request.url, env: process.env });
  if ("redirect" in result) return Response.redirect(result.redirect, 302);
  return Response.json(result.body, { status: result.status });
}
