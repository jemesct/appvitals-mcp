import Link from "next/link";
import { ShipExamples } from "@/components/ShipExamples";
import { getProduct } from "@/lib/products";

export const metadata = {
  title: "ShipVitals · hostedmcp.dev",
  description: "App Store Connect reviews, TestFlight, and release status in your MCP client.",
};

export default function ShipVitalsPage() {
  const product = getProduct("shipvitals");
  if (!product) return null;
  return (
    <main>
      <h1>ShipVitals</h1>
      <p className="lede">
        App Store Connect is a lot of clicks when you want recent reviews, a version state, or what
        TestFlight testers just sent. ShipVitals is an MCP server that pulls those into the agent
        you already use.
      </p>
      <h2>What it does</h2>
      <ul>
        <li>Lists the Apple app ids you point it at. Those ids are numeric. The bundle id is not enough.</li>
        <li>Fetches App Store customer reviews. You can filter to one star rating and one territory.</li>
        <li>Summarises the stars in the rows it fetched. That is not the public App Store rating. Apple does not return a lifetime average here.</li>
        <li>Reads the latest version state, release type, and phased release when a version has one.</li>
        <li>Lists recent TestFlight builds and their processing state.</li>
        <li>Summarises TestFlight crash and screenshot comments. Tester emails are left out. This is not the production crash rate.</li>
        <li>Downloads a vendor sales report or a monthly finance report when the API key has the role and Apple has published the file.</li>
        <li>Lists Analytics Report requests that already exist, so you can see whether Apple has been asked for performance data.</li>
        <li>Can reply to a review, but only when you pass confirm and writes are turned on.</li>
      </ul>
      <h2>What Apple does not offer</h2>
      <ul>
        <li>No synchronous crash rate, hang rate, or launch time. There is no equivalent of Play&apos;s bad-behaviour threshold.</li>
        <li>Analytics Reports are a CSV you wait for. ShipVitals does not create the request and does not invent a rate.</li>
        <li>Xcode Organizer is not in the API.</li>
        <li>Sales and finance files cover the whole vendor, not one app. There is no MRR field, payout date, or balance.</li>
        <li>One API key is one team. You cannot invite this server into someone else&apos;s App Store Connect account the way Play Console invites a service account.</li>
      </ul>
      <h2>Example output</h2>
      <p>Ask in plain English. Your assistant calls the ShipVitals tool and should keep the gaps above when it answers.</p>
      <ShipExamples />
      <h2>Free and open source: the MCP</h2>
      <p>
        The MCP that talks to App Store Connect is in this repo (<code>packages/shipvitals-mcp</code>) under MIT, and it is free to self-host. You run it with your own Issuer ID, Key ID, and <code>.p8</code>. No account here, no fee.
      </p>
      <h2>What the hosted plans add</h2>
      <ul>
        <li>A managed MCP URL and the same hub API key as AppVitals. Nothing to install or keep running.</li>
        <li>An app allow-list, so a solo subscription only answers for one Apple app id.</li>
        <li>They do not add review history, crash alerts, or a shared Apple key. The deployment reads the team in the server environment.</li>
      </ul>
      <p>
        If that key is not your team, self-host the open MCP. Checkout still only unlocks this deployment.
      </p>
      <h2>Pricing</h2>
      <p>
        7 day free trial on both. Prices are US dollars per month. AppVitals stays a separate subscription. A Play and App Store bundle is not a checkout option yet.
      </p>
      <div className="prices">
        {product.plans.map((plan) => (
          <article className="card" key={plan.id}>
            <h3 style={{ margin: 0 }}>{plan.name}</h3>
            <p className="price">US${plan.priceUsdMonthly}/mo</p>
            <p>{plan.blurb}</p>
            <a className="button" href={`/api/checkout?plan=${plan.id}&product=shipvitals`}>
              Start trial
            </a>
          </article>
        ))}
      </div>
      <p>
        Your API key belongs to the hostedmcp.dev account. AppVitals and ShipVitals each need their own subscription.
      </p>
      <p>
        After checkout we email you an API key, if you do not already have one. Then{" "}
        <Link href="/shipvitals/connect">register an Apple app id</Link>.
      </p>
    </main>
  );
}
