import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** AES-256-GCM key length. `SHIPVITALS_CREDENTIALS_KEY` must decode to this many bytes. */
export const CREDENTIALS_KEY_BYTES = 32;

export interface CredentialBlob {
  iv: string;
  authTag: string;
  ciphertext: string;
}

export function parseCredentialsKey(raw: string | undefined): Buffer {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) {
    throw new Error("SHIPVITALS_CREDENTIALS_KEY is not set.");
  }
  const key = /^[0-9a-fA-F]{64}$/.test(trimmed) ? Buffer.from(trimmed, "hex") : Buffer.from(trimmed, "base64");
  if (key.length !== CREDENTIALS_KEY_BYTES) {
    throw new Error(
      "SHIPVITALS_CREDENTIALS_KEY must be 32 bytes: 64 hex characters, or base64 that decodes to 32 bytes.",
    );
  }
  return key;
}

export function encryptJson(value: unknown, key: Buffer): CredentialBlob {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptJson<T>(blob: CredentialBlob, key: Buffer): T {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(blob.iv, "base64"));
  decipher.setAuthTag(Buffer.from(blob.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

/** Drop private-key material if a library error quoted it. */
export function redactSecrets(message: string, secrets: string[]): string {
  let text = message;
  for (const secret of secrets) {
    const trimmed = secret.trim();
    if (trimmed.length >= 8) text = text.split(trimmed).join("[redacted]");
  }
  if (text.includes("PRIVATE KEY") || text.includes("-----BEGIN")) {
    return "The App Store Connect key was rejected. The private key is not included in this message.";
  }
  return text.slice(0, 400);
}
