export class AscApiError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(status: number, message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = "AscApiError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

const AUTH_HELP = [
  "The App Store Connect API rejected the JWT.",
  "Fix:",
  "1. In App Store Connect, open Users and Access, then Integrations, then App Store Connect API.",
  "2. Check SHIPVITALS_ISSUER_ID, SHIPVITALS_KEY_ID, and the .p8 are the same key.",
  "3. The key has to be an ES256 Team key. Tokens last at most 20 minutes. This server mints a shorter one and refreshes it.",
].join("\n");

const PERMISSION_HELP = [
  "The API key authenticated, but this call is not allowed for its role.",
  "Fix:",
  "1. Reading reviews needs Admin, App Manager, or Customer Support.",
  "2. Replying to a review needs Admin or Customer Support.",
  "3. Sales reports need Admin, Finance, or Sales. Finance reports need Admin or Finance.",
  "4. Analytics report requests need a role that can view analytics. Admin is the safe choice.",
].join("\n");

export function readableAscError(err: unknown): string {
  if (err instanceof AscApiError) {
    const detail = safeDetail(err.message);
    if (err.status === 401) {
      return detail ? `${AUTH_HELP}\nApple said: ${detail}` : AUTH_HELP;
    }
    if (err.status === 403) {
      return detail ? `${PERMISSION_HELP}\nApple said: ${detail}` : PERMISSION_HELP;
    }
    if (err.status === 404) {
      return detail
        ? `App Store Connect could not find that resource. ${detail}`
        : "App Store Connect could not find that resource. Check the Apple app id. For a sales or finance report, a 404 usually means Apple has not published that date.";
    }
    return detail ? `App Store Connect API error ${err.status}: ${detail}` : `App Store Connect API error ${err.status}.`;
  }
  if (err instanceof Error) {
    return safeDetail(err.message) ?? "The request failed.";
  }
  return "The request failed.";
}

export function ascErrorDetail(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const errors = (body as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const first = errors[0];
  if (!first || typeof first !== "object") return null;
  const record = first as { title?: unknown; detail?: unknown; code?: unknown };
  const parts = [record.title, record.detail, record.code].filter((part) => typeof part === "string" && part.trim());
  if (parts.length === 0) return null;
  return parts.join(": ");
}

function safeDetail(message: string): string | null {
  const trimmed = message.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
  if (trimmed.includes("BEGIN PRIVATE KEY") || trimmed.includes("BEGIN EC PRIVATE KEY")) return null;
  if (trimmed.includes(" at ") && trimmed.includes(".js:")) return null;
  if (trimmed.length > 400) return trimmed.slice(0, 400);
  return trimmed;
}

export function parseRetryAfter(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const when = Date.parse(trimmed);
  if (Number.isNaN(when)) return null;
  return Math.max(0, when - now);
}
