import { describe, expect, it } from "vitest";

import {
  buildGitHubAuthorizeUrl,
  flowExpiresAt,
  generateGitHubFlowNonce,
  GitHubFlowVerificationError,
  resolveGitHubRedirectUri,
  sanitizeGitHubReturnTo,
  signGitHubFlowEnvelope,
  verifyGitHubFlowEnvelope,
  type GitHubFlowEnvelope,
} from "./browserGitHubOAuth.ts";

const SIGNING_KEY = new Uint8Array(
  Array.from({ length: 32 }, (_, index) => (index * 11 + 5) & 0xff),
);

const makeEnvelope = (overrides: Partial<GitHubFlowEnvelope> = {}): GitHubFlowEnvelope => ({
  v: 1,
  nonce: "abc",
  userId: "user-123",
  returnTo: "/app/",
  exp: flowExpiresAt(0),
  ...overrides,
});

describe("generateGitHubFlowNonce", () => {
  it("returns a unique URL-safe base64 string", () => {
    const a = generateGitHubFlowNonce();
    const b = generateGitHubFlowNonce();
    expect(a).not.toEqual(b);
    expect(/^[A-Za-z0-9_-]+$/.test(a)).toBe(true);
  });
});

describe("signGitHubFlowEnvelope / verifyGitHubFlowEnvelope", () => {
  it("round-trips a valid envelope", () => {
    const envelope = makeEnvelope();
    const signed = signGitHubFlowEnvelope(envelope, SIGNING_KEY);
    expect(verifyGitHubFlowEnvelope(signed, SIGNING_KEY, 0)).toEqual(envelope);
  });

  it("rejects the envelope when signed with a different key", () => {
    const signed = signGitHubFlowEnvelope(makeEnvelope(), SIGNING_KEY);
    const wrongKey = new Uint8Array(SIGNING_KEY).map((byte) => byte ^ 0xff);
    expect(() => verifyGitHubFlowEnvelope(signed, wrongKey, 0)).toThrow(
      GitHubFlowVerificationError,
    );
  });

  it("rejects expired envelopes", () => {
    const envelope = makeEnvelope({ exp: 10 });
    const signed = signGitHubFlowEnvelope(envelope, SIGNING_KEY);
    try {
      verifyGitHubFlowEnvelope(signed, SIGNING_KEY, 1000);
      expect.fail("expected to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(GitHubFlowVerificationError);
      expect((error as GitHubFlowVerificationError).reason).toBe("expired");
    }
  });

  it("rejects tampered payloads", () => {
    const signed = signGitHubFlowEnvelope(makeEnvelope(), SIGNING_KEY);
    const [payload, signature] = signed.split(".");
    expect(() => verifyGitHubFlowEnvelope(`${payload}x.${signature}`, SIGNING_KEY, 0)).toThrow(
      GitHubFlowVerificationError,
    );
  });

  it("rejects malformed strings with no dot", () => {
    expect(() => verifyGitHubFlowEnvelope("no-dot-here", SIGNING_KEY, 0)).toThrow(
      GitHubFlowVerificationError,
    );
  });
});

describe("buildGitHubAuthorizeUrl", () => {
  it("encodes every required OAuth parameter", () => {
    const url = new URL(
      buildGitHubAuthorizeUrl({
        clientId: "Iv1.abc",
        redirectUri: "https://v3.example.com/api/auth/github/callback",
        state: "state",
        scopes: "repo read:user",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("Iv1.abc");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://v3.example.com/api/auth/github/callback",
    );
    expect(url.searchParams.get("state")).toBe("state");
    expect(url.searchParams.get("scope")).toBe("repo read:user");
    expect(url.searchParams.get("allow_signup")).toBe("true");
  });

  it("passes login hint when provided", () => {
    const url = new URL(
      buildGitHubAuthorizeUrl({
        clientId: "x",
        redirectUri: "r",
        state: "s",
        scopes: "repo",
        loginHint: "aGamingGod1234",
      }),
    );
    expect(url.searchParams.get("login")).toBe("aGamingGod1234");
  });

  it("respects allowSignup=false", () => {
    const url = new URL(
      buildGitHubAuthorizeUrl({
        clientId: "x",
        redirectUri: "r",
        state: "s",
        scopes: "repo",
        allowSignup: false,
      }),
    );
    expect(url.searchParams.get("allow_signup")).toBe("false");
  });
});

describe("resolveGitHubRedirectUri", () => {
  it("prefers the public URL", () => {
    expect(resolveGitHubRedirectUri("https://v3.agaminggod.com", "http://localhost:3773")).toBe(
      "https://v3.agaminggod.com/api/auth/github/callback",
    );
  });

  it("falls back to request origin when public URL is undefined", () => {
    expect(resolveGitHubRedirectUri(undefined, "http://localhost:3773")).toBe(
      "http://localhost:3773/api/auth/github/callback",
    );
  });
});

describe("sanitizeGitHubReturnTo", () => {
  it("accepts relative paths", () => {
    expect(sanitizeGitHubReturnTo("/app/settings/devices", "https://v3.example.com")).toBe(
      "/app/settings/devices",
    );
  });

  it("rejects protocol-relative paths", () => {
    expect(sanitizeGitHubReturnTo("//evil.com/steal", "https://v3.example.com")).toBe("/app/");
  });

  it("accepts same-origin absolute URLs", () => {
    expect(sanitizeGitHubReturnTo("https://v3.example.com/app/x", "https://v3.example.com")).toBe(
      "/app/x",
    );
  });

  it("rejects cross-origin redirects", () => {
    expect(sanitizeGitHubReturnTo("https://evil.com/", "https://v3.example.com")).toBe("/app/");
  });

  it("falls back for empty / null input", () => {
    expect(sanitizeGitHubReturnTo(null, "https://v3.example.com")).toBe("/app/");
    expect(sanitizeGitHubReturnTo("", "https://v3.example.com")).toBe("/app/");
    expect(sanitizeGitHubReturnTo("   ", "https://v3.example.com")).toBe("/app/");
  });
});
