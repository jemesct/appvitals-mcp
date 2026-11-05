import { WorksWithPlay } from "@/components/PlayMark";
import Link from "next/link";
import { products } from "@/lib/products";

export default function HomePage() {
  const first = products[0];
  return (
    <main>
      <h1>hostedmcp.dev</h1>
      <p className="lede">
        A small hub for niche MCP servers. AppVitals is Google Play. ShipVitals is iOS, via App Store Connect. MerchantOps is Lemon Squeezy and Paddle.
      </p>
      <p>
        Each product is open core. The MCP that talks to the service is open source and free to
        self-host (<a href="https://github.com/jemesct/appvitals-mcp">AppVitals on GitHub</a>). The hosted plans add the parts that need a server running all day: a managed URL
        and API key, stored history, and alerts.
      </p>
      {first ? (
        <section className="card">
          <WorksWithPlay />
          <h2 style={{ marginTop: 0, display: "block", width: "fit-content" }}>{first.name}</h2>
          <p>{first.summary}</p>
          <p className="muted">
            Google Play only. It reads Play Console reviews, crash and ANR rates, and releases.
            Google only keeps about 7 days of reviews, so the hosted plans snapshot them daily and keep the history.
          </p>
          <p>
            <Link className="button" href={first.path}>
              See AppVitals
            </Link>
          </p>
        </section>
      ) : null}
      <section className="card">
        <h2 style={{ marginTop: 0 }}>ShipVitals</h2>
        <p>iOS only. App Store Connect reviews, TestFlight, and version status. Not Google Play.</p>
        <p className="muted">
          Hosted plans use the App Store Connect key you upload. It is encrypted, and it is not shared with other customers. You can also self-host the open MCP.
        </p>
        <p>
          <Link href="/shipvitals">See ShipVitals</Link>
        </p>
      </section>
      <section className="card">
        <h2 style={{ marginTop: 0 }}>MerchantOps</h2>
        <p>Lemon Squeezy and Paddle: MRR, subscriptions, churn, failed payments, refunds, licence keys, and discounts.</p>
        <p className="muted">
          Store ops, not App Store Connect and not Google Play. The open-source package is private for now. Self-host it with your own store keys. There is no hosted checkout yet.
        </p>
        <p>
          <Link href="/merchantops">See MerchantOps</Link>
        </p>
      </section>
    </main>
  );
}
