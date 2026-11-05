import { ProductTitle, WorksWithAppStore } from "@/components/BrandMarks";
import Link from "next/link";
import { ShipExamples } from "@/components/ShipExamples";
import { getProduct } from "@/lib/products";

export const metadata = {
  title: "ShipVitals · iOS · hostedmcp.dev",
  description: "iOS App Store Connect reviews, TestFlight, and release status in your MCP client.",
};

export default function ShipVitalsPage() {
  const product = getProduct("shipvitals");
  return (
    <main>
      <WorksWithAppStore />
      <ProductTitle brands={["appStore", "appStoreConnect"]}>ShipVitals</ProductTitle>
      <p className="lede">
        ShipVitals is for iOS. It reads App Store Connect: reviews, TestFlight, and version status.
        It does not read Google Play. The hosted plan uses the App Store Connect key you upload,
        not a key we share between customers.
      </p>
      <h2>What it does</h2>
      <ul>
        <li>Lists the Apple app ids you configured. Those ids are numeric. The bundle id is not enough.</li>
        <li>Fetches App Store customer reviews. You can filter to one star rating and one territory.</li>
        <li>Summarises the stars in the rows it fetched. That is not the public App Store rating. Apple does not return a lifetime average here.</li>
        <li>Reads the latest version state, release type, and phased release when a version has one.</li>
        <li>Lists recent TestFlight builds and their processing state.</li>
        <li>Summarises TestFlight crash and screenshot comments. Tester emails are left out. This is not the production crash rate.</li>
        <li>On your own machine, can download a vendor sales report or a monthly finance report. The vendor number comes from the environment, not from the tool call.</li>
        <li>Lists Analytics Report requests that already exist, so you can see whether Apple has been asked for performance data.</li>
        <li>Can reply to a review, but only when you pass confirm and writes are turned on for that process.</li>
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
      <h2>Run it yourself</h2>
      <p>
        The MCP is in this repo (<code>packages/shipvitals-mcp</code>) under the MIT licence. You can run it with your own Issuer ID, Key ID, and <code>.p8</code>, with no account here.
      </p>
      <h2>Hosted plan</h2>
      <p>
        Soft is US$9 a month for one iOS app. Team is US$19 a month for every iOS app on your key. 7 day trial. Checkout is Lemon Squeezy. After checkout,{" "}
        <Link href="/shipvitals/connect">save your App Store Connect key</Link>. We encrypt it and do not show the <code>.p8</code> again. Sales and finance reports run only if you also save your vendor number.
      </p>
      <p>AppVitals is the Google Play product. A Play and App Store bundle is not a checkout option.</p>
      {product ? (
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
      ) : null}
    </main>
  );
}
