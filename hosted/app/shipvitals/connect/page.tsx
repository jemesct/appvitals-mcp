import Link from "next/link";

export const metadata = {
  title: "Self-host ShipVitals · hostedmcp.dev",
  description: "ShipVitals is self-hosted. This page does not register Apple app ids.",
};

export default function ShipVitalsConnectPage() {
  return (
    <main>
      <h1>Self-host ShipVitals</h1>
      <p>
        Hosted ShipVitals is not a public product. There is no form here, and nothing you submit is
        attached to an App Store Connect key on this server.
      </p>
      <p>
        Run <code>packages/shipvitals-mcp</code> on your own machine with your own API key. Setup is
        in the{" "}
        <a href="https://github.com/jemesct/appvitals-mcp/blob/main/packages/shipvitals-mcp/README.md">
          package README
        </a>
        . The key stays with you. We do not ask for it.
      </p>
      <p>
        A later version could keep a separate encrypted key per customer. That is not built. This
        page will not take a <code>.p8</code>.
      </p>
      <p>
        <Link href="/shipvitals">Back to ShipVitals</Link>
      </p>
    </main>
  );
}
