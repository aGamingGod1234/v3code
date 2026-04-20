// V3 Phase 7 — browser Google sign-in helpers.
//
// The desktop flow (P1d) uses PKCE with a system browser + Electron
// deep-link callback. In cloud mode the client is just a plain browser,
// so we need a **server-hosted OAuth callback** that does the
// code-for-token exchange using the operator's Google OAuth client
// secret. This module holds the crypto + encoding primitives used by
// `identity/http.ts` to serve the two routes that cover the flow:
//
//   GET  /api/auth/google/authorize
//   GET  /api/auth/google/callback
//
// State machine:
//
//   1. Browser hits /authorize with the device's local id / name /
//      capabilities and a `return_to` URL on the cloud bundle.
//   2. Server generates a fresh PKCE code_verifier + cookie-scoped flow
//      nonce, signs the whole thing as a short-lived envelope, and sets
//      an HttpOnly cookie (`v3_oauth_flow`). The `state` parameter sent
//      to Google is the same signed envelope so the server can recover
//      the flow even if the browser swapped cookies between start and
//      callback (iOS PWA edge case).
//   3. Server responds with a 302 to Google's consent URL.
//   4. Google calls back to /callback with `code` + `state`.
//   5. Server verifies the signature, extracts the flow payload, posts
//      the authorization_code + verifier + client_secret to Google's
//      token endpoint, parses `id_token` + `access_token`, runs the
//      existing V3 bootstrap machinery, sets the session cookie, and
//      redirects the browser to the original `return_to`.
//
// Everything user-controllable (device_name, return_to) is length-
// capped and origin-checked before being embedded in the cookie so an
// open-redirect bug here doesn't turn into a phishing vector.

import * as Crypto from "node:crypto";

const FLOW_VERSION = 1;
const FLOW_TTL_SECONDS = 10 * 60; // 10 minutes — Google's OAuth code expires in 10.
const NONCE_BYTES = 16;
const VERIFIER_BYTES = 64; // 64 bytes → 86-char base64url. Inside the 43-128 PKCE range.

export interface OAuthFlowEnvelope {
  readonly v: typeof FLOW_VERSION;
  readonly verifier: string;
  readonly nonce: string;
  readonly deviceId: string;
  readonly deviceName: string;
  readonly platform: string;
  readonly kind: string;
  readonly capabilities: ReadonlyArray<string>;
  readonly appVersion: string;
  readonly returnTo: string;
  readonly exp: number;
}

const base64url = (input: Buffer): string =>
  input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const base64urlDecode = (input: string): Buffer => {
  const pad = input.length % 4 === 2 ? "==" : input.length % 4 === 3 ? "=" : "";
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(normalized, "base64");
};

export const generatePkcePair = (): { readonly verifier: string; readonly challenge: string } => {
  const verifierBytes = Crypto.randomBytes(VERIFIER_BYTES);
  const verifier = base64url(verifierBytes);
  const challenge = base64url(Crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
};

export const generateNonce = (): string => base64url(Crypto.randomBytes(NONCE_BYTES));

export const signFlowEnvelope = (envelope: OAuthFlowEnvelope, key: Uint8Array): string => {
  const payload = JSON.stringify(envelope);
  const payloadB64 = base64url(Buffer.from(payload, "utf8"));
  const hmac = Crypto.createHmac("sha256", key);
  hmac.update(payloadB64);
  const signature = base64url(hmac.digest());
  return `${payloadB64}.${signature}`;
};

export class OAuthFlowVerificationError extends Error {
  override readonly name = "OAuthFlowVerificationError";
  readonly reason:
    | "malformed"
    | "bad-signature"
    | "expired"
    | "wrong-version"
    | "decode-failed"
    | "schema-mismatch";
  constructor(
    reason:
      | "malformed"
      | "bad-signature"
      | "expired"
      | "wrong-version"
      | "decode-failed"
      | "schema-mismatch",
    message: string,
  ) {
    super(message);
    this.reason = reason;
  }
}

export const verifyFlowEnvelope = (
  signed: string,
  key: Uint8Array,
  nowSeconds: number,
): OAuthFlowEnvelope => {
  const dotIndex = signed.indexOf(".");
  if (dotIndex <= 0 || dotIndex === signed.length - 1) {
    throw new OAuthFlowVerificationError("malformed", "Signed envelope has no payload/signature.");
  }
  const payloadB64 = signed.slice(0, dotIndex);
  const signature = signed.slice(dotIndex + 1);
  const hmac = Crypto.createHmac("sha256", key);
  hmac.update(payloadB64);
  const expected = base64url(hmac.digest());
  // Use timing-safe compare so attackers can't use reply-time to probe the secret.
  if (
    signature.length !== expected.length ||
    !Crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    throw new OAuthFlowVerificationError("bad-signature", "Envelope signature does not match.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(base64urlDecode(payloadB64).toString("utf8"));
  } catch (cause) {
    throw new OAuthFlowVerificationError(
      "decode-failed",
      `Envelope payload is not valid JSON: ${(cause as Error).message}`,
    );
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new OAuthFlowVerificationError("schema-mismatch", "Envelope payload is not an object.");
  }
  const envelope = parsed as Partial<OAuthFlowEnvelope>;
  if (envelope.v !== FLOW_VERSION) {
    throw new OAuthFlowVerificationError(
      "wrong-version",
      `Unsupported envelope version ${envelope.v ?? "(missing)"}.`,
    );
  }
  if (
    typeof envelope.verifier !== "string" ||
    typeof envelope.nonce !== "string" ||
    typeof envelope.deviceId !== "string" ||
    typeof envelope.deviceName !== "string" ||
    typeof envelope.platform !== "string" ||
    typeof envelope.kind !== "string" ||
    !Array.isArray(envelope.capabilities) ||
    typeof envelope.appVersion !== "string" ||
    typeof envelope.returnTo !== "string" ||
    typeof envelope.exp !== "number"
  ) {
    throw new OAuthFlowVerificationError("schema-mismatch", "Envelope fields are malformed.");
  }
  if (envelope.exp < nowSeconds) {
    throw new OAuthFlowVerificationError(
      "expired",
      "Envelope has expired; start the sign-in flow again.",
    );
  }
  return {
    v: FLOW_VERSION,
    verifier: envelope.verifier,
    nonce: envelope.nonce,
    deviceId: envelope.deviceId,
    deviceName: envelope.deviceName,
    platform: envelope.platform,
    kind: envelope.kind,
    capabilities: envelope.capabilities.filter(
      (entry): entry is string => typeof entry === "string",
    ),
    appVersion: envelope.appVersion,
    returnTo: envelope.returnTo,
    exp: envelope.exp,
  };
};

export const flowExpiresAt = (nowSeconds: number): number => nowSeconds + FLOW_TTL_SECONDS;

export const OAUTH_FLOW_COOKIE_NAME = "v3_oauth_flow";
export const OAUTH_FLOW_QUERY_PARAM = "state";
export const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

// Google's scope minimum for a sign-in flow. Drive App Data scope
// (drive.appdata) is requested too so browser-mode users can still
// participate in cross-device server-URL discovery without a second
// consent screen.
export const GOOGLE_BROWSER_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/drive.appdata",
].join(" ");

export interface GoogleAuthorizeUrlInput {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly codeChallenge: string;
  readonly state: string;
  readonly loginHint?: string | undefined;
  readonly prompt?: "select_account" | "consent" | undefined;
}

export const buildGoogleAuthorizeUrl = (input: GoogleAuthorizeUrlInput): string => {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: GOOGLE_BROWSER_SCOPES,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: input.prompt ?? "select_account",
  });
  if (input.loginHint && input.loginHint.length > 0) {
    params.set("login_hint", input.loginHint);
  }
  return `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
};

export interface GoogleTokenResponse {
  readonly id_token: string;
  readonly access_token: string;
  readonly expires_in: number;
  readonly refresh_token?: string;
  readonly scope?: string;
  readonly token_type?: string;
}

const isGoogleTokenResponse = (body: unknown): body is GoogleTokenResponse => {
  if (typeof body !== "object" || body === null) return false;
  const maybe = body as Record<string, unknown>;
  return typeof maybe.id_token === "string" && typeof maybe.access_token === "string";
};

export class GoogleTokenExchangeError extends Error {
  override readonly name = "GoogleTokenExchangeError";
  readonly status: number;
  readonly body: string;
  constructor(status: number, body: string) {
    super(`Google token exchange failed with ${status}: ${body.slice(0, 200)}`);
    this.status = status;
    this.body = body;
  }
}

export interface ExchangeCodeInput {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly code: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
  readonly fetchImpl: typeof fetch;
}

export const exchangeAuthorizationCode = async (
  input: ExchangeCodeInput,
): Promise<GoogleTokenResponse> => {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    code_verifier: input.codeVerifier,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    redirect_uri: input.redirectUri,
  });
  const response = await input.fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new GoogleTokenExchangeError(response.status, text);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new GoogleTokenExchangeError(response.status, `Not JSON: ${(cause as Error).message}`);
  }
  if (!isGoogleTokenResponse(parsed)) {
    throw new GoogleTokenExchangeError(response.status, "Response missing id_token / access_token");
  }
  return parsed;
};

export interface BuildRedirectUriInput {
  readonly publicUrl: string | undefined;
  readonly requestOrigin: string;
}

/**
 * Pick the externally-visible origin for the OAuth callback. Prefer the
 * operator-configured public URL (set by the setup wizard + the deploy
 * templates), fall back to the request origin for local dev. Google
 * rejects callbacks whose origin isn't registered on the OAuth client,
 * so an operator who hasn't configured `server_public_url` MUST use the
 * same address they registered (e.g. the `http://localhost:PORT` that
 * Electron dev uses).
 */
export const resolveRedirectUri = (input: BuildRedirectUriInput): string => {
  const base = (input.publicUrl ?? input.requestOrigin).replace(/\/$/, "");
  return `${base}/api/auth/google/callback`;
};

/**
 * Guard against open-redirect by restricting the post-sign-in
 * destination to same-origin paths on the server's public URL.
 * Accepts either an absolute URL that matches the public origin, or a
 * relative path beginning with `/`. Everything else falls back to
 * `/app/`.
 */
export const sanitizeReturnTo = (input: string, origin: string): string => {
  if (!input) return "/app/";
  const trimmed = input.trim();
  if (trimmed.length === 0) return "/app/";
  if (trimmed.startsWith("/")) {
    // Disallow protocol-relative (`//evil.com/...`).
    if (trimmed.startsWith("//")) return "/app/";
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    const parsedOrigin = parsed.origin;
    if (parsedOrigin === origin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/app/";
    }
  } catch {
    /* fall through */
  }
  return "/app/";
};
