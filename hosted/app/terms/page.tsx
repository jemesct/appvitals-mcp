import Link from "next/link";

export const metadata = {
  title: "Terms · hostedmcp.dev",
  description: "Terms for the hosted plans on hostedmcp.dev.",
};

export default function TermsPage() {
  return (
    <main>
      <h1>Terms</h1>
      <p className="lede">
        These terms cover the hosted plans on hostedmcp.dev. They are between you and builtby_James.
        The <Link href="/privacy">privacy page</Link> says what we store.
      </p>
      <p className="muted">Last updated 5 November 2026.</p>

      <h2>The open source MCP and the hosted service</h2>
      <p>
        The MCP servers in this project are open source under the MIT licence. You can run them
        yourself, with your own Google, Apple, or store credentials. That copy does not need an account
        here, and these terms do not apply to it.
      </p>
      <p>
        Hosted AppVitals is Google Play: a URL, an API key, review history, and alert email. Hosted
        ShipVitals is iOS, via your own App Store Connect key, which we encrypt. We do not sell a
        shared Apple key. Hosted MerchantOps uses your own Lemon Squeezy or Paddle keys, which we encrypt. A bundle of these products is not included.
      </p>

      <h2>Accounts and API keys</h2>
      <p>
        There is no password. Lemon Squeezy collects the email at checkout, and that email is the
        account. We email one API key. The key signs your MCP client in to each hosted product you have subscribed to: AppVitals for Google Play, ShipVitals for iOS, and MerchantOps for Lemon Squeezy and Paddle.
      </p>
      <p>
        The key is a credential for the hosted service. It is not a sale of the software, and it is
        not a licence beyond the MIT licence on the open source MCP. Keep it private. You are
        responsible for calls made with it. We store a hash and a short prefix, so we cannot
        recover a lost key. Subscribing again from the same email does not issue a second key if
        one already exists.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Use the hosted MCP for your own apps and stores. Do not use it to break Google Play, App Store
        Connect, Lemon Squeezy, or Paddle rules. Do not probe other customers&apos; accounts, overload the
        service, or try to pull data the API key was not subscribed for. We can suspend a key that
        is being abused.
      </p>

      <h2>Fees, trials, and cancellation</h2>
      <p>
        Prices are on the product page, in US dollars. Checkout, the trial, and renewals go through
        Lemon Squeezy. They are the merchant of record, and their checkout terms apply to the
        payment. We do not see your card.
      </p>
      <p>
        When Lemon Squeezy marks the subscription cancelled, expired, or past due, that product
        stops accepting the key. Cancel in the Lemon Squeezy customer portal. We do not run a
        separate billing desk.
      </p>

      <h2>No warranty</h2>
      <p>
        The hosted service and the open source MCP are provided as is. Play and App Store Connect
        change their APIs, and some figures they do not offer at all. We do not warrant that the
        data is complete, that an alert will arrive, or that the service will stay up.
      </p>
      <p>
        To the extent the law allows, we are not liable for lost profits or for what happens to
        your app in a store. Nothing here excludes a right under the Australian Consumer Law that
        cannot be excluded.
      </p>

      <h2>Law</h2>
      <p>These terms are governed by the laws of Australia.</p>

      <h2>Contact</h2>
      <p>
        <a href="mailto:support@hostedmcp.dev">support@hostedmcp.dev</a>
      </p>
    </main>
  );
}
