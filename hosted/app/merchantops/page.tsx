import { ProductTitle, WorksWithStores } from "@/components/BrandMarks";
import Link from "next/link";
import { getProduct } from "@/lib/products";
import { checkoutConfigError } from "@/lib/lemonsqueezy";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "MerchantOps · Lemon Squeezy and Paddle · hostedmcp.dev",
  description: "MCP for Lemon Squeezy and Paddle merchant ops: MRR, subscriptions, churn, failed payments, refunds, licence keys, and discounts.",
};

export default function MerchantOpsPage() {
  const product = getProduct("merchantops")!;
  const checkoutUnavailable = checkoutConfigError(process.env, "merchantops");
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
        Writes (a refund, a revoked key, a new discount) stay off unless the server allows them and the tool call confirms. Paddle has no licence keys. Lemon Squeezy cannot mint a key on demand.
      </p>
      <h2>Self-host</h2>
      <p>
        The MCP is included here in <code>packages/merchantops-mcp</code> under the MIT licence, from{" "}
        <a href="https://github.com/jemesct/merchantops-mcp">jemesct/merchantops-mcp</a>. You can run it yourself with your own <code>LEMONSQUEEZY_API_KEY</code> and <code>PADDLE_API_KEY</code>. Mock mode needs no keys.
      </p>
      <h2>Hosted plan</h2>
      <p>
        Solo is US$9 a month for one store with one provider key. Team is US$19 a month for multiple stores on Lemon Squeezy, Paddle, or both. 7 day trial. Checkout is Lemon Squeezy. After checkout, we email your hostedmcp.dev API key. Then{" "}
        <Link href="/merchantops/connect">save your store keys</Link>. Each customer uses their own keys. We encrypt them before saving and do not show them again. There is no shared store key.
      </p>
      {checkoutUnavailable ? <p className="notice">Checkout is not available yet. You can self-host MerchantOps while the hosted plans are being set up.</p> : null}
      <div className="prices">
        {product.plans.map((plan) => (
          <article className="card" key={plan.id}>
            <h3 style={{ margin: 0 }}>{plan.name}</h3>
            <p className="price">US${plan.priceUsdMonthly}/mo</p>
            <p>{plan.blurb}</p>
            {checkoutUnavailable ? <p className="muted">Checkout unavailable</p> : (
              <a className="button" href={`/api/checkout?plan=${plan.id}&product=merchantops`}>Start trial</a>
            )}
          </article>
        ))}
      </div>
      <p>
        <Link href="/appvitals">AppVitals is Google Play</Link>. <Link href="/shipvitals">ShipVitals is iOS</Link>.
      </p>
    </main>
  );
}