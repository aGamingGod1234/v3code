import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import * as jose from "jose";

import { makeGoogleIdentityServiceWith } from "./GoogleIdentityService.ts";

// End-to-end test of the Google identity verifier using an in-memory keypair.
// No network access is performed: we mint test ID tokens locally and inject a
// jwks resolver that always returns our own public key.

type GeneratedKey = Awaited<ReturnType<typeof jose.generateKeyPair>>["privateKey"];

interface Fixture {
  readonly privateKey: GeneratedKey;
  readonly publicKey: GeneratedKey;
  readonly jwks: jose.JWTVerifyGetKey;
}

const makeFixture = async (): Promise<Fixture> => {
  const { privateKey, publicKey } = await jose.generateKeyPair("RS256", { extractable: true });
  const jwks: jose.JWTVerifyGetKey = async () => publicKey;
  return { privateKey, publicKey, jwks };
};

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const SUB = "108327419372419276132";

const mintToken = async (
  privateKey: GeneratedKey,
  overrides: Record<string, unknown> = {},
): Promise<string> => {
  const baseClaims = {
    sub: SUB,
    email: "lucas@example.com",
    email_verified: true,
    name: "Lucas",
    picture: "https://example.com/avatar.png",
  } as const;
  const claims = { ...baseClaims, ...overrides };
  return await new jose.SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
    .setIssuer(
      typeof overrides.issuer === "string" ? overrides.issuer : "https://accounts.google.com",
    )
    .setAudience(typeof overrides.audience === "string" ? overrides.audience : CLIENT_ID)
    .setExpirationTime("5m")
    .setIssuedAt()
    .sign(privateKey);
};

describe("GoogleIdentityService (verifier)", () => {
  it("accepts a well-formed Google ID token and returns a VerifiedGoogleIdentity", async () => {
    const { privateKey, jwks } = await makeFixture();
    const svc = makeGoogleIdentityServiceWith({ jwks, clientId: CLIENT_ID });
    const token = await mintToken(privateKey);

    const result = await Effect.runPromise(svc.verifyIdToken(token));

    expect(result.googleSub).toBe(SUB);
    expect(result.email).toBe("lucas@example.com");
    expect(result.emailVerified).toBe(true);
    expect(result.displayName).toBe("Lucas");
    expect(result.avatarUrl).toBe("https://example.com/avatar.png");
  });

  it("rejects a token whose audience is not the configured client id", async () => {
    const { privateKey, jwks } = await makeFixture();
    const svc = makeGoogleIdentityServiceWith({ jwks, clientId: CLIENT_ID });
    const token = await mintToken(privateKey, {
      audience: "other-client.apps.googleusercontent.com",
    });

    const err = await Effect.runPromise(Effect.flip(svc.verifyIdToken(token)));
    expect(err.reason).toBe("wrong-audience");
  });

  it("rejects a token whose issuer is not Google", async () => {
    const { privateKey, jwks } = await makeFixture();
    const svc = makeGoogleIdentityServiceWith({ jwks, clientId: CLIENT_ID });
    const token = await mintToken(privateKey, { issuer: "https://evil.example.com" });

    const err = await Effect.runPromise(Effect.flip(svc.verifyIdToken(token)));
    expect(err.reason).toBe("wrong-issuer");
  });

  it("rejects a token where email_verified is false", async () => {
    const { privateKey, jwks } = await makeFixture();
    const svc = makeGoogleIdentityServiceWith({ jwks, clientId: CLIENT_ID });
    const token = await mintToken(privateKey, { email_verified: false });

    const err = await Effect.runPromise(Effect.flip(svc.verifyIdToken(token)));
    expect(err.reason).toBe("email-not-verified");
  });

  it("rejects a token missing the email claim", async () => {
    const { privateKey, jwks } = await makeFixture();
    const svc = makeGoogleIdentityServiceWith({ jwks, clientId: CLIENT_ID });
    const token = await mintToken(privateKey, { email: undefined });

    const err = await Effect.runPromise(Effect.flip(svc.verifyIdToken(token)));
    expect(err.reason).toBe("invalid-token");
  });

  it("rejects a token signed with a different key", async () => {
    const { jwks } = await makeFixture();
    const svc = makeGoogleIdentityServiceWith({ jwks, clientId: CLIENT_ID });
    // Mint a token with a DIFFERENT private key than the one our jwks returns.
    const { privateKey: attackerPrivateKey } = await jose.generateKeyPair("RS256", {
      extractable: true,
    });
    const token = await mintToken(attackerPrivateKey);

    const err = await Effect.runPromise(Effect.flip(svc.verifyIdToken(token)));
    expect(["invalid-token", "unknown"]).toContain(err.reason);
  });

  it("rejects an expired token with a specific token-expired reason", async () => {
    const { privateKey, jwks } = await makeFixture();
    const svc = makeGoogleIdentityServiceWith({ jwks, clientId: CLIENT_ID });
    // Mint with an explicit expired exp claim (setExpirationTime accepts seconds offset)
    const token = await new jose.SignJWT({
      sub: SUB,
      email: "lucas@example.com",
      email_verified: true,
    })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer("https://accounts.google.com")
      .setAudience(CLIENT_ID)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey);

    const err = await Effect.runPromise(Effect.flip(svc.verifyIdToken(token)));
    expect(err.reason).toBe("token-expired");
  });
});
