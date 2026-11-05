import { addCustomerApps, parsePackageNames } from "@/lib/apps";
import { getRepo } from "@/lib/runtime";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: { apiKey?: string; packageNames?: string[] | string };
  try {
    body = (await request.json()) as { apiKey?: string; packageNames?: string[] | string };
  } catch {
    return Response.json({ error: "Body is not JSON." }, { status: 400 });
  }
  const token = body.apiKey?.trim() ?? "";
  const raw = Array.isArray(body.packageNames) ? body.packageNames.join(",") : (body.packageNames ?? "");
  const result = await addCustomerApps({
    repo: await getRepo(),
    token,
    productId: "appvitals",
    packageNames: parsePackageNames(raw),
    now: new Date(),
  });
  if (!result.ok) return Response.json({ error: result.message }, { status: result.status });
  return Response.json({ packages: result.packages });
}
