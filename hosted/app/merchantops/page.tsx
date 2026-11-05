import { ProductTitle, WorksWithStores } from "@/components/BrandMarks";
import Link from "next/link";

export const metadata = {
  title: "MerchantOps · Lemon Squeezy and Paddle · hostedmcp.dev",
  description: "MCP for Lemon Squeezy and Paddle merchant ops: MRR, subscriptions, churn, failed payments, refunds, licence keys, and discounts.",
};

export default function MerchantOpsPage() {
  return (
    <main>
      <ProductTitle worksWith={<WorksWithStores />}>MerchantOps</ProductTitle>
      <p className="lede">
        MerchantOps is for your Lemon Squeezy or Paddle store. It is not Google Play and it is not iOS or App Store Connect. Ask an agent for revenue, subscriptions, refunds, and keys instead of opening two dashboards.
      </p>
      <h2>What it reads</h2>
      <ul>
        <li>MRR and subscription counts, with currencies kept separate.</li>
        <li>Churn, failed payments, and refunds.</li>
        <li>Lemon Squeezy licence keys, and discount codes on both providers.</li>
      </ul>
      <p>
        Writes (a refund, a revoked key, a new discount) stay off unless you opt in on the server and the tool call confirms. Paddle has no licence keys. Lemon Squeezy cannot mint a key on demand.
      </p>
      <h2>Self-host</h2>
      <p>
        The open-source package is private for now:{" "}
        <a href="https://github.com/jemesct/merchantops-mcp">jemesct/merchantops-mcp</a>. When you have access, run it with your own <code>LEMONSQUEEZY_API_KEY</code> and <code>PADDLE_API_KEY</code>. Mock mode needs no keys.
      </p>
      <h2>Hosted plan</h2>
      <p>
        There is no hosted checkout yet. We are not selling a shared store key, and this page does not take API keys. A hosted plan can come later, the same way ShipVitals keeps each customer&apos;s key separate.
      </p>
      <p>
        <Link href="/appvitals">AppVitals is Google Play</Link>. <Link href="/shipvitals">ShipVitals is iOS</Link>.
      </p>
    </main>
  );
}