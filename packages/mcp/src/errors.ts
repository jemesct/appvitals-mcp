export class PlayApiError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;
  readonly packageName?: string;

  constructor(
    status: number,
    message: string,
    retryAfterMs: number | null = null,
    packageName?: string,
  ) {
    super(message);
    this.name = "PlayApiError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.packageName = packageName;
  }
}

const PERMISSION_HELP = [
  "The service account is not added in Play Console, or it is missing permission.",
  "Fix:",
  "1. Open Play Console > Users and permissions.",
  "2. Invite the service account email.",
  "3. Grant \"View app information and download bulk reports\" and \"View app quality information\".",
  "4. To reply to reviews, also grant \"Reply to reviews\".",
].join("\n");

export function readablePlayError(err: unknown): string {
  if (err instanceof PlayApiError) {
    if (err.status === 401 || err.status === 403) {
      const extra = safeGoogleDetail(err.message);
      return extra ? `${PERMISSION_HELP}\nGoogle said: ${extra}` : PERMISSION_HELP;
    }
    if (err.status === 404) {
      const pkg = err.packageName ? ` (${err.packageName})` : "";
      return `Play could not find that package or resource${pkg}. Check the package name matches the app in the Play Console account this service account can access.`;
    }
    const detail = safeGoogleDetail(err.message);
    return detail
      ? `Play API error ${err.status}: ${detail}`
      : `Play API error ${err.status}.`;
  }
  if (err instanceof Error) {
    return safeGoogleDetail(err.message) ?? "The request failed.";
  }
  return "The request failed.";
}

function safeGoogleDetail(message: string): string | null {
  const trimmed = message.replace(/\s+/g, " ").trim();
  if (!trimmed) return null;
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
