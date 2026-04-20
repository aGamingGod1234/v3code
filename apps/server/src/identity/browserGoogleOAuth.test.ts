import { describe, expect, it } from "vitest";

import {
  buildGoogleAuthorizeUrl,
  exchangeAuthorizationCode,
  flowExpiresAt,
  generateNonce,
  generatePkcePair,
  GoogleTokenExchangeError,
  OAuthFlowVerificationError,
  resolveRedirectUri,
  sanitizeReturnTo,
  signFlowEnvelope,
  verifyFlowEnvelope,
  type OAuthFlowEnvelope,
} from "./browserGoogleOAuth.ts";

const SIGNING_KEY = new Uint8Array(
  Array.from({ length: 32 }, (_, index) => (index * 7 + 3) & 0xff),
);

const makeEnvelope = (overrides: Partial<OAuthFlowEnvelope> = {}): OAuthFlowEnvelope => ({
  v: 1,
  verifier: "abc123-verifier",
  nonce: "test-nonce",
  deviceId: "device-xyz",
  deviceName: "Pixel 9 Pro",
  platform: "android",
  kind: "phone",
  capabilities: ["view_only"],
  appVersion: "0.1.0",
  returnTo: "/app/",
  exp: flowExpiresAt(0),
  ...overrides,
});

describe("generatePkcePair", () => {
  it("produces a verifier between 43 and 128 URL-safe chars (RFC 7636)", () => {
    const { verifier, challenge } = generatePkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(verifier.length).toBeLessThanOrEqual(128);
    expect(/^[A-Za-z0-9_-]+$/.test(verifier)).toBe(true);
    // S256 challenge is sha256(verifier) base64url-encoded → always 43 chars.
    expect(challenge.length).toBe(43);
    expect(/^[A-Za-z0-9_-]+$/.test(challenge)).toBe(true);
  });

  it("yields a fresh verifier on every call", () => {
    const a = generatePkcePair();
    const b = generatePkcePair();
    expect(a.verifier).not.toEqual(b.verifier);
    expect(a.challenge).not.toEqual(b.challenge);
  });
});

describe("generateNonce", () => {
  it("returns a unique URL-safe string of reasonable length", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(16);
    expect(/^[A-Za-z0-9_-]+$/.test(a)).toBe(true);
  });
});

describe("signFlowEnvelope / verifyFlowEnvelope", () => {
  it("round-trips a valid envelope", () => {
    const envelope = makeEnvelope();
    const signed = signFlowEnvelope(envelope, SIGNING_KEY);
    const decoded = verifyFlowEnvelope(signed, SIGNING_KEY, 0);
    expect(decoded).toEqual(envelope);
  });

  it("rejects envelopes signed with the wrong key", () => {
    const signed = signFlowEnvelope(makeEnvelope(), SIGNING_KEY);
    const wrongKey = new Uint8Array(SIGNING_KEY).map((byte) => byte ^ 0xff);
    expect(() => verifyFlowEnvelope(signed, wrongKey, 0)).toThrow(OAuthFlowVerificationError);
  });

  it("rejects tampered payloads", () => {
    const signed = signFlowEnvelope(makeEnvelope(), SIGNING_KEY);
    const [payload, signature] = signed.split(".");
    const tampered = `${payload}x.${signature}`;
    try {
      verifyFlowEnvelope(tampered, SIGNING_KEY, 0);
      expect.fail("expected to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(OAuthFlowVerificationError);
      expect((error as OAuthFlowVerificationError).reason).toBe("bad-signature");
    }
  });

  it("rejects expired envelopes", () => {
    const envelope = makeEnvelope({ exp: 100 });
    const signed = signFlowEnvelope(envelope, SIGNING_KEY);
    try {
      verifyFlowEnvelope(signed, SIGNING_KEY, 200);
      expect.fail("expected to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(OAuthFlowVerificationError);
      expect((error as OAuthFlowVerificationError).reason).toBe("expired");
    }
  });

  it("rejects wrong version envelopes", () => {
    const envelope = { ...makeEnvelope(), v: 2 };
    // Bypass the narrow typing on signFlowEnvelope so we can exercise the
    // `verifyFlowEnvelope` version-mismatch branch. A real caller would
    // never do this because the literal type on `OAuthFlowEnvelope.v` is
    // `1`; this test only exists to guarantee the runtime check still
    // fires when a future version ships and gets rolled back.
    const signed = signFlowEnvelope(envelope as unknown as OAuthFlowEnvelope, SIGNING_KEY);
    try {
      verifyFlowEnvelope(signed, SIGNING_KEY, 0);
      expect.fail("expected to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(OAuthFlowVerificationError);
      expect((error as OAuthFlowVerificationError).reason).toBe("wrong-version");
    }
  });

  it("rejects malformed strings", () => {
    expect(() => verifyFlowEnvelope("no-dot-here", SIGNING_KEY, 0)).toThrow(
      OAuthFlowVerificationError,
    );
  });
});

describe("buildGoogleAuthorizeUrl", () => {
  it("encodes every required OAuth parameter", () => {
    const url = new URL(
      buildGoogleAuthorizeUrl({
        clientId: "cid.apps.googleusercontent.com",
        redirectUri: "https://v3.example.com/api/auth/google/callback",
        codeChallenge: "challenge",
        state: "state",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("cid.apps.googleusercontent.com");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://v3.example.com/api/auth/google/callback",
    );
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge")).toBe("challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("state");
    expect(url.searchParams.get("scope")).toContain("openid");
    expect(url.searchParams.get("scope")).toContain("drive.appdata");
    expect(url.searchParams.get("prompt")).toBe("select_account");
  });

  it("forwards login_hint when provided", () => {
    const url = new URL(
      buildGoogleAuthorizeUrl({
        clientId: "cid",
        redirectUri: "https://v3.example.com/cb",
        codeChallenge: "c",
        state: "s",
        loginHint: "lucas@example.com",
      }),
    );
    expect(url.searchParams.get("login_hint")).toBe("lucas@example.com");
  });
});

const makeTokenFetch = (
  status: number,
  body: string,
): { fetchImpl: typeof fetch; calls: Array<{ url: string; body: string }> } => {
  const calls: Array<{ url: string; body: string }> = [];
  // Bun's `fetch` type has a mandatory `preconnect` method; `typeof fetch`
  // under `@types/bun` therefore demands it on any stub. Cast via
  // `unknown` so tests don't need to reimplement the noop.
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    calls.push({ url, body: String((init ?? {}).body) });
    return new Response(body, { status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
};

describe("exchangeAuthorizationCode", () => {
  it("returns the decoded Google token response on success", async () => {
    const { fetchImpl, calls } = makeTokenFetch(
      200,
      JSON.stringify({
        id_token: "id",
        access_token: "access",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "openid email profile",
      }),
    );
    const result = await exchangeAuthorizationCode({
      clientId: "cid",
      clientSecret: "secret",
      code: "the-code",
      codeVerifier: "the-verifier",
      redirectUri: "https://v3.example.com/cb",
      fetchImpl,
    });
    expect(result.id_token).toBe("id");
    expect(result.access_token).toBe("access");
    expect(calls).toHaveLength(1);
    const firstCall = calls[0];
    if (!firstCall) throw new Error("expected one captured call");
    expect(firstCall.body).toContain("grant_type=authorization_code");
    expect(firstCall.body).toContain("code_verifier=the-verifier");
    expect(firstCall.body).toContain("client_secret=secret");
  });

  it("raises a tagged error on non-2xx", async () => {
    const { fetchImpl } = makeTokenFetch(400, JSON.stringify({ error: "invalid_grant" }));
    await expect(
      exchangeAuthorizationCode({
        clientId: "cid",
        clientSecret: "secret",
        code: "c",
        codeVerifier: "v",
        redirectUri: "r",
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(GoogleTokenExchangeError);
  });

  it("raises a tagged error when the response is missing id_token", async () => {
    const { fetchImpl } = makeTokenFetch(200, JSON.stringify({ access_token: "a", expires_in: 1 }));
    await expect(
      exchangeAuthorizationCode({
        clientId: "cid",
        clientSecret: "secret",
        code: "c",
        codeVerifier: "v",
        redirectUri: "r",
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(GoogleTokenExchangeError);
  });
});

describe("resolveRedirectUri", () => {
  it("prefers the operator public URL", () => {
    expect(
      resolveRedirectUri({
        publicUrl: "https://v3.agaminggod.com",
        requestOrigin: "http://localhost:3773",
      }),
    ).toBe("https://v3.agaminggod.com/api/auth/google/callback");
  });

  it("strips trailing slashes", () => {
    expect(
      resolveRedirectUri({
        publicUrl: "https://v3.agaminggod.com/",
        requestOrigin: "http://localhost:3773",
      }),
    ).toBe("https://v3.agaminggod.com/api/auth/google/callback");
  });

  it("falls back to the request origin when public URL is undefined", () => {
    expect(
      resolveRedirectUri({ publicUrl: undefined, requestOrigin: "http://localhost:3773" }),
    ).toBe("http://localhost:3773/api/auth/google/callback");
  });
});

describe("sanitizeReturnTo", () => {
  it("accepts relative paths starting with /", () => {
    expect(sanitizeReturnTo("/app/_chat/x/y", "https://v3.example.com")).toBe("/app/_chat/x/y");
  });

  it("rejects protocol-relative URLs", () => {
    expect(sanitizeReturnTo("//evil.com/steal", "https://v3.example.com")).toBe("/app/");
  });

  it("accepts same-origin absolute URLs", () => {
    expect(sanitizeReturnTo("https://v3.example.com/app/foo?bar=1", "https://v3.example.com")).toBe(
      "/app/foo?bar=1",
    );
  });

  it("rejects cross-origin redirects", () => {
    expect(sanitizeReturnTo("https://evil.com/oops", "https://v3.example.com")).toBe("/app/");
  });

  it("falls back on empty input", () => {
    expect(sanitizeReturnTo("", "https://v3.example.com")).toBe("/app/");
    expect(sanitizeReturnTo("   ", "https://v3.example.com")).toBe("/app/");
  });
});
