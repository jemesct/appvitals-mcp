export const metadata = {
  title: "Privacy · hostedmcp.dev",
  description: "What hostedmcp.dev stores, and what it does not.",
};

export default function PrivacyPage() {
  return (
    <main>
      <h1>Privacy</h1>
      <p className="lede">
        hostedmcp.dev is run by builtby_James. This covers the hosted site and the hosted MCP
        products on it, including AppVitals and ShipVitals. A later MCP on the hub uses the same
        account. The open source MCP you run on your own machine does not send data here.
      </p>
      <p className="muted">Last updated 5 November 2026.</p>

      <h2>Account and email</h2>
      <p>
        Checkout is handled by Lemon Squeezy. They are the merchant of record. They collect your
        email and your payment details. We receive the email, the plan, the subscription status,
        and their subscription id. We do not receive or store card numbers.
      </p>
      <p>
        That email is the account. We use it to send the API key, and to send AppVitals alert mail.
        We do not run a newsletter.
      </p>

      <h2>API keys</h2>
      <p>
        We email the full API key once. After that we store a sha256 hash and an 8 character
        prefix. We cannot show the full key again. The prefix is enough for us to find an account.
      </p>

      <h2>Play data</h2>
      <p>
        Hosted AppVitals does not ask you to upload a Google service account JSON. The server uses
        a service account we operate. You invite that account in Play Console, and you send us the
        Android package names. We store those names.
      </p>
      <p>
        We also store the reviews Google returns (text, star rating, author name, and time) and the
        crash and ANR figures, so the hosted plan can keep history after Google drops the reviews
        and so alert emails can fire. A reply you send goes to Google. It is not copied into the
        usage log.
      </p>

      <h2>App Store Connect</h2>
      <p>
        Hosted ShipVitals does not ask you to upload an App Store Connect private key. One .p8, key
        id, and issuer id are configured on the server for that deployment&apos;s Apple team. We
        store the numeric app ids you register. We do not keep a database of App Store review text.
        A reply you send goes to Apple.
      </p>

      <h2>Usage</h2>
      <p>
        On the hosted AppVitals MCP we log each tool call: the time, the tool name, the 8 character
        key prefix, the customer id, whether it succeeded, and the latency. We do not log the
        arguments, the review text, or the full API key.
      </p>

      <h2>Email delivery</h2>
      <p>
        API key mail and AppVitals alerts are sent with Resend. Resend sees the recipient address
        and the message. The API key email contains the full key that one time.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep the account, the key hash, the subscription, the app list, alerts, and usage rows
        while the account exists. Play review and vitals history is kept against the package name,
        for the hosted history feature.
      </p>

      <h2>Deletion</h2>
      <p>
        Email <a href="mailto:james@turner.ooo">james@turner.ooo</a> and ask. We will delete your
        customer row, API key hashes, subscription record, app list, alert records, and usage rows.
        Review and vitals history is stored by package name. Say if you want that removed too, and
        we will delete it for the packages on your account.
      </p>
      <p>
        Lemon Squeezy keeps its own billing records. Google and Apple keep what is in Play Console
        and App Store Connect. We cannot delete those.
      </p>

      <h2>Contact</h2>
      <p>
        <a href="mailto:james@turner.ooo">james@turner.ooo</a>
      </p>
    </main>
  );
}
