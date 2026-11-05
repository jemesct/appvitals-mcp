export const metadata = {
  title: "Privacy · hostedmcp.dev",
  description: "What hostedmcp.dev stores, and what it does not.",
};

export default function PrivacyPage() {
  return (
    <main>
      <h1>Privacy</h1>
      <p className="lede">
        hostedmcp.dev is run by builtby_James. AppVitals is the hosted Google Play product. ShipVitals is the hosted iOS product: you upload your own App Store Connect key. Hosted MerchantOps uses the Lemon Squeezy and Paddle keys you save. A copy of an MCP you run yourself does not send data here.
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

      <h2>Google Play</h2>
      <p>
        Hosted AppVitals does not ask you to upload a Google service account JSON. The server uses
        a service account we operate. You invite that account in Play Console, and you send us the
        Android package names. We store those names. This is Google Play data, not App Store Connect.
      </p>
      <p>
        We also store the reviews Google returns (text, star rating, author name, and time) and the
        crash and ANR figures, so the hosted plan can keep history after Google drops the reviews
        and so alert emails can fire. A reply you send goes to Google. It is not copied into the
        usage log.
      </p>

      <h2>App Store Connect</h2>
      <p>
        Hosted ShipVitals is iOS only. You upload your App Store Connect Key ID, Issuer ID, <code>.p8</code>, and an optional vendor number. We encrypt that bundle with AES-256-GCM before it is stored. The master key stays in <code>SHIPVITALS_CREDENTIALS_KEY</code> on the server. We decrypt it only to call Apple for your account. We do not return the <code>.p8</code> after save, and we do not use one customer&apos;s key for another customer. Sales and finance reports use the vendor number you saved, or they stay off.
      </p>
      <h2>Lemon Squeezy and Paddle store keys</h2>
      <p>
        Hosted MerchantOps stores your provider keys, store ids, and Paddle environments together as AES-256-GCM ciphertext. The encryption key stays on the server, separate from the database. Your keys are used only for your account and are not shown again after save. Store data is returned to your MCP client without being kept as history here. If you self-host, your store keys stay on your machine.
      </p>

      <h2>Usage</h2>
      <p>
        On a hosted MCP call we log the time, the tool name, the 8 character key prefix, the
        customer id, whether it succeeded, and the latency. That covers AppVitals (Google Play) and
        ShipVitals (iOS), and MerchantOps. We do not log the arguments, store keys, store data, the review text, the <code>.p8</code>, or the
        full API key.
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
        Email <a href="mailto:support@hostedmcp.dev">support@hostedmcp.dev</a> and ask. We will delete your
        customer row, API key hashes, saved App Store Connect and store credentials, subscription record, app list, alert records, and usage rows.
        Review and vitals history is stored by package name. Say if you want that removed too, and
        we will delete it for the packages on your account.
      </p>
      <p>
        Lemon Squeezy keeps its own billing records. Google and Apple keep what is in Play Console
        and App Store Connect. We cannot delete those.
      </p>

      <h2>Contact</h2>
      <p>
        <a href="mailto:support@hostedmcp.dev">support@hostedmcp.dev</a>
      </p>
    </main>
  );
}
