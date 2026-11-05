import Link from "next/link";
import { redirect } from "next/navigation";
import { MerchantStoreFields } from "@/components/MerchantStoreFields";
import { merchantStoresFromForm, saveCustomerMerchantCredentials } from "@/lib/merchant-connect";
import { getRepo } from "@/lib/runtime";

export const metadata = {
  title: "Connect MerchantOps · hostedmcp.dev",
  description: "Save your own Lemon Squeezy and Paddle keys for hosted MerchantOps. Keys are encrypted and not shown again.",
  robots: { index: false, follow: false },
};

async function saveKeys(formData: FormData) {
  "use server";
  const result = await saveCustomerMerchantCredentials({
    repo: await getRepo(),
    token: String(formData.get("apiKey") ?? "").trim(),
    now: new Date(),
    env: process.env,
    stores: merchantStoresFromForm(formData),
  });
  // Only fixed messages or counts go in the redirect, never submitted credentials.
  if (!result.ok) redirect(`/merchantops/connect?error=${encodeURIComponent(result.message)}`);
  redirect(`/merchantops/connect?saved=${result.storeCount}`);
}

export default async function MerchantOpsConnectPage({ searchParams }: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  return (
    <main>
      <h1>Connect your stores</h1>
      <p className="lede">
        Use the hostedmcp.dev API key from your checkout email, then add your own Lemon Squeezy or Paddle keys. We check read access, encrypt the keys, and do not show them again. They are not written to the usage log.
      </p>
      <p>Solo allows one store and one provider key. Team allows multiple stores on either or both providers. For Paddle, each key covers its Paddle account.</p>
      <p>Saving replaces all your saved stores. Include every store you want to keep, and paste the keys again when changing them. A failed check leaves your saved keys as they were.</p>
      {params.error ? <p className="notice">{params.error}</p> : null}
      {params.saved && /^\d+$/.test(params.saved) ? <p className="notice">Store keys saved. They will not be shown again.</p> : null}
      <form className="card" action={saveKeys}>
        <label htmlFor="apiKey">hostedmcp.dev API key</label>
        <input id="apiKey" name="apiKey" type="password" autoComplete="off" required placeholder="av_..." />
        <MerchantStoreFields />
        <p><button type="submit">Save store keys</button></p>
      </form>
      <h2>Connect your MCP client</h2>
      <p>Use <code>https://hostedmcp.dev/api/mcp/merchantops</code> with <code>Authorization: Bearer YOUR_HOSTEDMCP_API_KEY</code>.</p>
      <p>Ask for <code>providers_status</code> to see your saved store ids. When you have more than one store on a provider, include its <code>store</code> id in tool calls.</p>
      <p><Link href="/merchantops">MerchantOps plans and self-hosting</Link></p>
    </main>
  );
}
