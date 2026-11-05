import { createPrivateKey, sign, type KeyObject } from "node:crypto";

export const JWT_MAX_LIFETIME_SECONDS = 20 * 60;
export const JWT_DEFAULT_LIFETIME_SECONDS = 15 * 60;
export const JWT_AUDIENCE = "appstoreconnect-v1";

export function mintAppStoreConnectJwt(opts: {
  issuerId: string;
  keyId: string;
  privateKeyPem: string;
  now?: Date;
  lifetimeSeconds?: number;
}): string {
  const lifetime = opts.lifetimeSeconds ?? JWT_DEFAULT_LIFETIME_SECONDS;
  if (!Number.isInteger(lifetime) || lifetime < 60 || lifetime > JWT_MAX_LIFETIME_SECONDS) {
    throw new Error(
      `App Store Connect JWTs must live between 60 seconds and 20 minutes. Apple rejects longer tokens.`,
    );
  }
  const now = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  const header = { alg: "ES256", kid: opts.keyId, typ: "JWT" };
  const payload = {
    iss: opts.issuerId,
    iat: now,
    exp: now + lifetime,
    aud: JWT_AUDIENCE,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  let key: KeyObject;
  try {
    key = createPrivateKey(opts.privateKeyPem);
  } catch {
    throw new Error(
      "Could not read the App Store Connect private key. Expected a PKCS#8 .p8 PEM. The key was not included in this error.",
    );
  }
  let signature: Buffer;
  try {
    signature = sign("sha256", Buffer.from(signingInput), { key, dsaEncoding: "ieee-p1363" });
  } catch {
    throw new Error(
      "Could not sign the App Store Connect JWT. The key must be an ES256 (P-256) private key. The key was not included in this error.",
    );
  }
  return `${signingInput}.${base64url(signature)}`;
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}
