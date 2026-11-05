export const metadata = {
  title: "Account · hostedmcp.dev",
};

export default function AccountPage() {
  return (
    <main>
      <h1>Account</h1>
      <p>
        There is no password. Checkout creates the account against the email Lemon Squeezy has for
        you, and the API key in that email is how your tools sign in.
      </p>
      <p>
        The key is hub-wide. AppVitals is one product on it. If another MCP shows up here later, you
        use the same key, and you subscribe to that product on its own.
      </p>
      <p className="muted">
        We store a sha256 hash of the key, not the key itself. If you lose the email, subscribe
        again from the same address only issues a key when you do not already have one. Keep the
        email.
      </p>
    </main>
  );
}
