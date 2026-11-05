export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(message: OutboundEmail): Promise<void>;
}

export class MemoryEmailSender implements EmailSender {
  readonly sent: OutboundEmail[] = [];

  async send(message: OutboundEmail): Promise<void> {
    this.sent.push(message);
  }
}

export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: OutboundEmail): Promise<void> {
    const response = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend rejected the email (${response.status}): ${body.slice(0, 300)}`);
    }
  }
}

export function emailSenderFromEnv(env: NodeJS.ProcessEnv = process.env): EmailSender {
  const key = env.RESEND_API_KEY;
  if (!key) return new MemoryEmailSender();
  const from = env.RESEND_FROM || "AppVitals <alerts@mail.hostedmcp.dev>";
  return new ResendEmailSender(key, from);
}
