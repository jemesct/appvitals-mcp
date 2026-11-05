import { WorksWithPlay } from "@/components/PlayMark";
import { Examples } from "@/components/Examples";
import Link from "next/link";
import { getProduct } from "@/lib/products";

export const metadata = {
  title: "AppVitals · hostedmcp.dev",
  description: "Play reviews, vitals, and releases in your MCP client.",
};

export default function AppVitalsPage() {
  const product = getProduct("appvitals");
  if (!product) return null;
  return (
    <main>
      <WorksWithPlay />
      <h1>AppVitals</h1>
      <p className="lede">
        Play Console is about four clicks deep for every app, and the reviews API only keeps seven
        days. AppVitals is an MCP server that pulls reviews, ratings, vitals, and releases into the
        agent you already use.
      </p>
      <h2>What it does</h2>
      <ul>
        <li>Lists the apps you point it at.</li>
        <li>Fetches reviews from the last 7 days. That is all Google returns.</li>
        <li>Summarises star ratings from those reviews. Lifetime average is not in the API.</li>
        <li>
          Reads crash and ANR rates, and flags the bad-behaviour thresholds (1.09% user-perceived
          crash, 0.47% ANR).
        </li>
        <li>Lists tracks and releases.</li>
        <li>
          Gives you a 16 KB page-size checklist. Play does not expose alignment in the API, so you
          still check Play Console for your app&apos;s deadline.
        </li>
        <li>Can reply to a review, but only when you pass confirm and writes are turned on.</li>
      </ul>
      <h2>Example output</h2>
      <p>Ask in plain English. Your assistant calls the AppVitals tool and explains what comes back.</p>
      <Examples />
      <h2>Free and open source: the MCP</h2>
      <p>
        The MCP that talks to Google Play is <a href="https://github.com/jemesct/appvitals-mcp">open source (MIT) on GitHub</a> and free to self-host. It gives you
        live reviews, ratings, vitals, and releases. You run it with your own Google Cloud service
        account and an invite in Play Console. No account here, no fee.
      </p>
      <p>
        It only sees what Google returns right now, so no history past 7 days and no alerts. To get
        those yourself you would need to run your own server, database, and scheduled jobs.
      </p>
      <h2>What the hosted plans add</h2>
      <ul>
        <li>A managed MCP URL and API key. Nothing to install or keep running.</li>
        <li>Daily snapshots of your reviews, so you keep the history after Play drops them.</li>
        <li>Alert emails when crash or ANR rates cross Play&apos;s bad-behaviour thresholds, or a new 1 or 2 star review lands.</li>
        <li>No Google Cloud project of your own. You invite our service account instead.</li>
        <li>More than one app, on the Unlimited plan.</li>
      </ul>
      <h2>Pricing</h2>
      <p>7 day free trial on both. Prices are US dollars per month.</p>
      <div className="prices">
        {product.plans.map((plan) => (
          <article className="card" key={plan.id}>
            <h3 style={{ margin: 0 }}>{plan.name}</h3>
            <p className="price">US${plan.priceUsdMonthly}/mo</p>
            <p>{plan.blurb}</p>
            <a className="button" href={`/api/checkout?plan=${plan.id}&product=appvitals`}>
              Start trial
            </a>
          </article>
        ))}
      </div>
      <p>
        Your API key belongs to the hostedmcp.dev account, not just AppVitals. Later products use
        the same key. Each product has its own subscription.
      </p>
      <p>
        After checkout we email you an API key. Then <Link href="/appvitals/connect">connect a Play app</Link>.
      </p>
    </main>
  );
}
