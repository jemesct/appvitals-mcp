import Link from "next/link";
import { redirect } from "next/navigation";
import { appIdsFromForm, saveCustomerAscCredentials } from "@/lib/asc-connect";
import { getRepo } from "@/lib/runtime";

export const metadata = {
  title: "Connect ShipVitals · iOS · hostedmcp.dev",
  description: "Save your own App Store Connect key for hosted ShipVitals. The .p8 is encrypted and not shown again.",
};

async function saveKey(formData: FormData) {
  "use server";
  const result = await saveCustomerAscCredentials({
    repo: await getRepo(),
    token: String(formData.get("apiKey") ?? "").trim(),
    now: new Date(),
    env: process.env,
    keyId: String(formData.get("keyId") ?? ""),
    issuerId: String(formData.get("issuerId") ?? ""),
    privateKeyPem: String(formData.get("privateKey") ?? ""),
    vendorNumber: String(formData.get("vendorNumber") ?? ""),
    appIds: appIdsFromForm(String(formData.get("appIds") ?? "")),
  });
  if (!result.ok) {
    redirect(`/shipvitals/connect?error=${encodeURIComponent(result.message)}`);
  }
  const note = `Key ${result.keyId} saved.${result.vendorSaved ? " Vendor number saved." : ""}`;
  redirect(`/shipvitals/connect?saved=${encodeURIComponent(note)}`);
}

export default async function ShipVitalsConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  return (
    <main>
      <h1>Connect an iOS app</h1>
      <p className="lede">
        ShipVitals on this site calls App Store Connect with your key, for your Apple team. Paste the Key ID, the Issuer ID, and the <code>.p8</code>. We check the key can sign a token, encrypt it, and store the ciphertext. The <code>.p8</code> is not shown again and is not written to the usage log.
      </p>
      <p>
        This is not Google Play. AppVitals is the Play Console product.{" "}
        <Link href="/appvitals">AppVitals</Link>
      </p>
      {params.error ? <p className="notice">{params.error}</p> : null}
      {params.saved ? <p className="notice">{params.saved}</p> : null}
      <form className="card" action={saveKey}>
        <label htmlFor="apiKey">hostedmcp.dev API key</label>
        <input id="apiKey" name="apiKey" type="password" autoComplete="off" required placeholder="av_..." />
        <label htmlFor="keyId">Key ID</label>
        <input id="keyId" name="keyId" required autoComplete="off" placeholder="ABC123DEFG" />
        <label htmlFor="issuerId">Issuer ID</label>
        <input id="issuerId" name="issuerId" required autoComplete="off" placeholder="00000000-0000-0000-0000-000000000000" />
        <label htmlFor="privateKey">.p8 private key</label>
        <textarea id="privateKey" name="privateKey" rows={8} required placeholder="-----BEGIN PRIVATE KEY-----" />
        <label htmlFor="vendorNumber">Vendor number (optional)</label>
        <input id="vendorNumber" name="vendorNumber" autoComplete="off" placeholder="80012345" />
        <p className="muted">
          Sales and finance reports run only when this is set. It is your vendor number, not one shared with other customers. Leave it blank to skip those tools.
        </p>
        <label htmlFor="appIds">Apple app ids (optional)</label>
        <textarea id="appIds" name="appIds" rows={3} placeholder="1234567890" />
        <p className="muted">
          Numeric App Store ids, not bundle ids. Soft allows one. If you leave this blank, ShipVitals uses the iOS apps your key can list, still capped by the plan.
        </p>
        <button type="submit">Save key</button>
      </form>
      <p className="muted">
        You can still self-host <code>packages/shipvitals-mcp</code> and keep the <code>.p8</code> on your machine.
      </p>
    </main>
  );
}
