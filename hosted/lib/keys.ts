import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function generateApiKey(): { token: string; keyHash: string; keyPrefix: string } {
  const token = `av_${randomBytes(32).toString("hex")}`;
  return { token, keyHash: sha256(token), keyPrefix: token.slice(0, 8) };
}

/** Usage rows keep the 8 character prefix from generateApiKey. A longer value is cut so a full key cannot be stored. */
export function safeKeyPrefix(prefix: string): string {
  return prefix.trim().slice(0, 8);
}

export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
