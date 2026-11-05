import { redirect } from "next/navigation";
import { addCustomerApps, parsePackageNames } from "@/lib/apps";
import { getRepo } from "@/lib/runtime";

export const metadata = {
  title: "Connect AppVitals · hostedmcp.dev",
};

const PLACEHOLDER = "your-service-account@project.iam.gserviceaccount.com";

async function saveApps(formData: FormData) {
  "use server";
  const token = String(formData.get("apiKey") ?? "");
  const raw = String(formData.get("packages") ?? "");
  const frequency = String(formData.get("alertFrequency") ?? "daily");
  const result = await addCustomerApps({
    repo: await getRepo(),
    token: token.trim(),
    productId: "appvitals",
    packageNames: parsePackageNames(raw),
    alertFrequency: frequency === "weekly" ? "weekly" : "daily",
    now: new Date(),
  });
  if (!result.ok) {
    redirect(`/appvitals/connect?error=${encodeURIComponent(result.message)}`);
  }
  redirect(`/appvitals/connect?saved=${encodeURIComponent(result.packages.join(","))}`);
}

export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const email = process.env.APPVITALS_SERVICE_ACCOUNT_EMAIL || PLACEHOLDER;
  const placeholder = email === PLACEHOLDER;
  return (
    <main>
      <h1>Connect an app</h1>
      <p>
        AppVitals reads your Play data with one service account. You invite that account on the
        apps you care about. You do not hand us a Google Cloud key of your own.
      </p>
      <ol>
        <li>Open Play Console, then Users and permissions.</li>
        <li>
          Invite{" "}
          <span className="mono">
            {email}
          </span>
          {placeholder ? " (placeholder until APPVITALS_SERVICE_ACCOUNT_EMAIL is set)" : ""}.
        </li>
        <li>
          Grant read-only access: &quot;View app information and download bulk reports&quot; and
          &quot;View app quality information&quot;.
        </li>
        <li>Optional: also grant &quot;Reply to reviews&quot; if you want the write tool.</li>
        <li>Paste your hostedmcp.dev API key and the package names below.</li>
      </ol>
      {params.error ? <p className="notice">{params.error}</p> : null}
      {params.saved ? (
        <p className="notice">Saved. This key can read: {params.saved}</p>
      ) : null}
      <form className="card" action={saveApps}>
        <label htmlFor="apiKey">API key</label>
        <input id="apiKey" name="apiKey" type="password" autoComplete="off" required placeholder="av_..." />
        <label htmlFor="packages">Package names</label>
        <textarea
          id="packages"
          name="packages"
          rows={4}
          required
          placeholder="com.example.app"
        />
        <label htmlFor="alertFrequency">Alert emails</label>
        <select id="alertFrequency" name="alertFrequency" defaultValue="daily">
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
        <p className="muted">One package per line, or comma separated. The solo plan allows one app. Alerts cover new 1 and 2 star reviews and crash or ANR spikes.</p>
        <button type="submit">Save apps</button>
      </form>
    </main>
  );
}
