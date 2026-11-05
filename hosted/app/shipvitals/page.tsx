import Link from "next/link";
import { ShipExamples } from "@/components/ShipExamples";

export const metadata = {
  title: "ShipVitals · hostedmcp.dev",
  description: "Open source MCP for App Store Connect reviews, TestFlight, and release status.",
};

export default function ShipVitalsPage() {
  return (
    <main>
      <h1>ShipVitals</h1>
      <p className="lede">
        App Store Connect is a lot of clicks when you want recent reviews, a version state, or what
        TestFlight testers just sent. ShipVitals is an open source MCP server that pulls those into
        the agent you already use. You run it with your own API key.
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
        The MCP is in this repo (<code>packages/shipvitals-mcp</code>) under the MIT licence. You run it with your own Issuer ID, Key ID, and <code>.p8</code>. No account here, no fee.{" "}
        <Link href="/shipvitals/connect">Self-host notes</Link>.
      </p>
      <h2>Not a hosted plan</h2>
      <p>
        We do not sell ShipVitals, and we do not host a shared App Store Connect key for customers. There is no trial button and no Lemon Squeezy checkout. This site does not take Apple app ids or a <code>.p8</code>.
      </p>
      <p>
        AppVitals, for Google Play, is the hosted product. A Play and App Store bundle is not a checkout option.
      </p>
    </main>
  );
}
