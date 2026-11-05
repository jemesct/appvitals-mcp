import { WorksWithPlay } from "@/components/PlayMark";
import Link from "next/link";
import { products } from "@/lib/products";

export default function HomePage() {
  const first = products[0];
  return (
    <main>
      <h1>hostedmcp.dev</h1>
      <p className="lede">
        A small hub for niche MCP servers we host, so you can plug them into Claude, Cursor, or
        anything else that speaks MCP.
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
            First product on the hub. It reads Play reviews, crash and ANR rates, and releases.
            Google only keeps about 7 days of reviews, so the hosted plans snapshot them daily and keep the history.
          </p>
          <p>
            <Link className="button" href={first.path}>
              See AppVitals
            </Link>
          </p>
        </section>
      ) : null}
    </main>
  );
}
