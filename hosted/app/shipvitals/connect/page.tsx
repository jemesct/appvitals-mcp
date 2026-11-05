import { redirect } from "next/navigation";
import { addCustomerApps, parsePackageNames } from "@/lib/apps";
import { getRepo } from "@/lib/runtime";

export const metadata = {
  title: "Connect ShipVitals · hostedmcp.dev",
};

async function saveApps(formData: FormData) {
  "use server";
  const token = String(formData.get("apiKey") ?? "");
  const raw = String(formData.get("packages") ?? "");
  const result = await addCustomerApps({
    repo: await getRepo(),
    token: token.trim(),
    productId: "shipvitals",
    packageNames: parsePackageNames(raw),
    now: new Date(),
  });
  if (!result.ok) {
    redirect(`/shipvitals/connect?error=${encodeURIComponent(result.message)}`);
  }
  redirect(`/shipvitals/connect?saved=${encodeURIComponent(result.packages.join(","))}`);
}

export default async function ShipVitalsConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const keyId = process.env.SHIPVITALS_KEY_ID?.trim();
  const issuerId = process.env.SHIPVITALS_ISSUER_ID?.trim();
  const mock = process.env.SHIPVITALS_MOCK === "1" || process.env.SHIPVITALS_MOCK === "true";
  return (
    <main>
      <h1>Connect an iOS app</h1>
      <p>
        ShipVitals reads App Store Connect with one API key on this server. App Store Connect does
        not let you invite an outside key into your team, so this deployment only sees the team
        that key belongs to. The private key stays in the server environment. It is not stored on
        your account.
      </p>
      <ul>
        <li>
          Key ID: <span className="mono">{keyId || "not set (SHIPVITALS_KEY_ID)"}</span>
        </li>
        <li>
          Issuer ID: <span className="mono">{issuerId || "not set (SHIPVITALS_ISSUER_ID)"}</span>
        </li>
        <li>{mock ? "Mock mode is on. Apple is not called." : "Live mode uses SHIPVITALS_PRIVATE_KEY or SHIPVITALS_PRIVATE_KEY_PATH."}</li>
        <li>Replies stay off unless SHIPVITALS_ALLOW_WRITES=true on the server. This form does not turn that on.</li>
      </ul>
      {params.error ? <p className="notice">{params.error}</p> : null}
      {params.saved ? <p className="notice">Saved. This key can read: {params.saved}</p> : null}
      <form className="card" action={saveApps}>
        <label htmlFor="apiKey">API key</label>
        <input id="apiKey" name="apiKey" type="password" autoComplete="off" required placeholder="av_..." />
        <label htmlFor="packages">Apple app ids</label>
        <textarea id="packages" name="packages" rows={4} required placeholder="1234567890" />
        <p className="muted">
          One numeric Apple app id per line, or comma separated. Not the bundle id. The solo plan allows one app. Sales and finance reports still cover the whole vendor number on the server.
        </p>
        <button type="submit">Save apps</button>
      </form>
    </main>
  );
}
