import { generateKeyPairSync, verify, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { JWT_AUDIENCE, JWT_MAX_LIFETIME_SECONDS, mintAppStoreConnectJwt } from "../src/jwt.js";

function keyPair(): { pem: string; publicKey: KeyObject } {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return { pem, publicKey };
}

describe("app store connect jwt", () => {
  it("mints a short-lived ES256 token for appstoreconnect-v1", () => {
    const { pem, publicKey } = keyPair();
    const now = new Date("2026-11-04T00:00:00.000Z");
    const token = mintAppStoreConnectJwt({
      issuerId: "issuer-1",
      keyId: "KEY123",
      privateKeyPem: pem,
      now,
    });
    const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
    expect(encodedHeader).toBeTruthy();
    expect(encodedPayload).toBeTruthy();
    expect(encodedSignature).toBeTruthy();
    const header = JSON.parse(Buffer.from(encodedHeader ?? "", "base64url").toString()) as {
      alg: string;
      kid: string;
    };
    const payload = JSON.parse(Buffer.from(encodedPayload ?? "", "base64url").toString()) as {
      iss: string;
      aud: string;
      iat: number;
      exp: number;
    };
    expect(header).toEqual({ alg: "ES256", kid: "KEY123", typ: "JWT" });
    expect(payload.iss).toBe("issuer-1");
    expect(payload.aud).toBe(JWT_AUDIENCE);
    expect(payload.exp - payload.iat).toBe(15 * 60);
    expect(payload.exp - payload.iat).toBeLessThanOrEqual(JWT_MAX_LIFETIME_SECONDS);
    const signature = Buffer.from(encodedSignature ?? "", "base64url");
    expect(signature).toHaveLength(64);
    const ok = verify(
      "sha256",
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      signature,
    );
    expect(ok).toBe(true);
  });

  it("rejects a lifetime Apple will not accept, and does not echo a bad key", () => {
    const { pem } = keyPair();
    expect(() =>
      mintAppStoreConnectJwt({
        issuerId: "issuer-1",
        keyId: "KEY123",
        privateKeyPem: pem,
        lifetimeSeconds: 21 * 60,
      }),
    ).toThrow(/20 minutes/);
    const secret = "super-secret-key-material";
    expect(() =>
      mintAppStoreConnectJwt({
        issuerId: "issuer-1",
        keyId: "KEY123",
        privateKeyPem: `-----BEGIN PRIVATE KEY-----\n${secret}\n-----END PRIVATE KEY-----`,
      }),
    ).toThrow(/not included/);
    try {
      mintAppStoreConnectJwt({
        issuerId: "issuer-1",
        keyId: "KEY123",
        privateKeyPem: `-----BEGIN PRIVATE KEY-----\n${secret}\n-----END PRIVATE KEY-----`,
      });
    } catch (err) {
      expect(err instanceof Error ? err.message : "").not.toContain(secret);
    }
  });

  it("reads an inline key with escaped newlines and defaults mock app ids", () => {
    const config = loadConfig({
      SHIPVITALS_MOCK: "1",
      SHIPVITALS_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
      SHIPVITALS_ALLOW_WRITES: "true",
    });
    expect(config.mock).toBe(true);
    expect(config.appIds).toEqual(["1234567890"]);
    expect(config.allowWrites).toBe(true);
    expect(config.privateKey).toBe("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----");
    expect(config.port).toBe(3334);
    expect(() => loadConfig({}, ["--port", "nope"])).toThrow(/Invalid --port/);
  });
});
