// V3 Phase 1e — GitHub OAuth flow envelope helpers.
//
// GitHub's web-application OAuth flow is simpler than Google's: the
// client_secret replaces the PKCE verifier, so we only need to track
// a signed state nonce + a return-to URL across the redirect. The
// envelope also records the V3 user id whose session initiated the
// flow so the callback can verify it's still the same session that
// shows up at /api/auth/github/callback — this defends against a
// browser that opens two concurrent flows.
//
// The envelope is HMAC-signed with a key from `ServerSecretStore`
// (same pattern as the Google flow) so the server can reconstruct it
// from the query string without any server-side session storage.

import * as Crypto from "node:crypto";

const FLOW_VERSION = 1;
const FLOW_TTL_SECONDS = 10 * 60;
const NONCE_BYTES = 16;

export interface GitHubFlowEnvelope {
  readonly v: typeof FLOW_VERSION;
  readonly nonce: string;
  readonly userId: string;
  readonly returnTo: string;
  readonly exp: number;
}

const base64url = (input: Buffer): string =>
  input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// Distinct error class so callers (verifyGitHubFlowEnvelope) can map
// invalid-base64 failures to a specific "decode-failed" reason rather than
// reporting them as generic JSON parse errors.
export class Base64UrlDecodeError extends Error {
  override readonly name = "Base64UrlDecodeError";
  constructor(message: string) {
    super(message);
  }
}

const base64urlDecode = (input: string): Buffer => {
  const pad = input.length % 4 === 2 ? "==" : input.length % 4 === 3 ? "=" : "";
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const decoded = Buffer.from(normalized, "base64");
  // Round-trip guard: reject inputs that don't re-encode to the same value
  // (Buffer.from silently strips invalid characters; this catches that).
  const reencoded = decoded
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  if (reencoded !== input.replace(/=+$/, "")) {
    throw new Base64UrlDecodeError("base64url-decode: input contained invalid characters");
  }
  return decoded;
};

export const generateGitHubFlowNonce = (): string => base64url(Crypto.randomBytes(NONCE_BYTES));

export const flowExpiresAt = (nowSeconds: number): number => nowSeconds + FLOW_TTL_SECONDS;

export const signGitHubFlowEnvelope = (envelope: GitHubFlowEnvelope, key: Uint8Array): string => {
  const payload = JSON.stringify(envelope);
  const payloadB64 = base64url(Buffer.from(payload, "utf8"));
  const signature = base64url(Crypto.createHmac("sha256", key).update(payloadB64).digest());
  return `${payloadB64}.${signature}`;
};

export class GitHubFlowVerificationError extends Error {
  override readonly name = "GitHubFlowVerificationError";
  readonly reason:
    | "malformed"
    | "bad-signature"
    | "expired"
    | "wrong-version"
    | "decode-failed"
    | "schema-mismatch";
  constructor(reason: GitHubFlowVerificationError["reason"], message: string) {
    super(message);
    this.reason = reason;
  }
}

export const verifyGitHubFlowEnvelope = (
  signed: string,
  key: Uint8Array,
  nowSeconds: number,
): GitHubFlowEnvelope => {
  const dotIndex = signed.indexOf(".");
  if (dotIndex <= 0 || dotIndex === signed.length - 1) {
    throw new GitHubFlowVerificationError("malformed", "Signed envelope has no payload/signature.");
  }
  const payloadB64 = signed.slice(0, dotIndex);
  const signature = signed.slice(dotIndex + 1);
  const expected = base64url(Crypto.createHmac("sha256", key).update(payloadB64).digest());
  if (
    signature.length !== expected.length ||
    !Crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    throw new GitHubFlowVerificationError("bad-signature", "Envelope signature does not match.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(base64urlDecode(payloadB64).toString("utf8"));
  } catch (cause) {
    if (cause instanceof Base64UrlDecodeError) {
      throw new GitHubFlowVerificationError(
        "decode-failed",
        `Envelope payload base64url decode failed: ${cause.message}`,
      );
    }
    throw new GitHubFlowVerificationError(
      "decode-failed",
      `Envelope payload is not valid JSON: ${(cause as Error).message}`,
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new GitHubFlowVerificationError("schema-mismatch", "Envelope payload is not an object.");
  }
  const envelope = parsed as Partial<GitHubFlowEnvelope>;
  if (envelope.v !== FLOW_VERSION) {
    throw new GitHubFlowVerificationError(
      "wrong-version",
      `Unsupported envelope version ${envelope.v ?? "(missing)"}.`,
    );
  }
  if (
    typeof envelope.nonce !== "string" ||
    typeof envelope.userId !== "string" ||
    typeof envelope.returnTo !== "string" ||
    typeof envelope.exp !== "number"
  ) {
    throw new GitHubFlowVerificationError("schema-mismatch", "Envelope fields are malformed.");
  }
  if (envelope.exp < nowSeconds) {
    throw new GitHubFlowVerificationError(
      "expired",
      "Envelope has expired; start the sign-in flow again.",
    );
  }
  return {
    v: FLOW_VERSION,
    nonce: envelope.nonce,
    userId: envelope.userId,
    returnTo: envelope.returnTo,
    exp: envelope.exp,
  };
};

export const GITHUB_FLOW_COOKIE_NAME = "v3_github_oauth_flow";
export const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";

export interface BuildGitHubAuthorizeUrlInput {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly state: string;
  readonly scopes: string; // space-separated scope list
  readonly loginHint?: string | undefined;
  readonly allowSignup?: boolean;
}

export const buildGitHubAuthorizeUrl = (input: BuildGitHubAuthorizeUrlInput): string => {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    scope: input.scopes.trim(),
    allow_signup: input.allowSignup === false ? "false" : "true",
  });
  if (input.loginHint && input.loginHint.length > 0) {
    params.set("login", input.loginHint);
  }
  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
};

export const resolveGitHubRedirectUri = (publicUrl: string | undefined, origin: string): string => {
  const base = (publicUrl ?? origin).replace(/\/$/, "");
  return `${base}/api/auth/github/callback`;
};

export const sanitizeGitHubReturnTo = (input: string | null, origin: string): string => {
  if (!input) return "/app/";
  const trimmed = input.trim();
  if (trimmed.length === 0) return "/app/";
  if (trimmed.startsWith("/")) {
    if (trimmed.startsWith("//")) return "/app/";
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.origin === origin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/app/";
    }
  } catch {
    /* fall through */
  }
  return "/app/";
};
