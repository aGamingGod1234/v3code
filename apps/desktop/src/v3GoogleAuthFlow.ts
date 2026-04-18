// V3 Google sign-in (Electron main-process side).
//
// Renderer asks main to open the system browser at Google's consent
// screen, capture the `v3://auth/google/callback?code=…` deep link that
// fires after the user consents, exchange the code for an `id_token`, and
// return that id_token to the renderer. The renderer then POSTs it to the
// V3 server's /api/auth/google/bootstrap. See
// apps/web/src/v3/auth/googleSignIn.ts for the renderer half.
//
// Why PKCE: this is an installed-app OAuth client. We cannot ship the
// client secret in the desktop bundle, so PKCE (RFC 7636) is the only
// secure way to bind the auth code to this specific request without a
// server secret.
//
// Single in-flight flow: starting a second flow cancels the first. The
// renderer is expected to disable its sign-in button while a flow is
// outstanding, but we defend in depth here.

import * as Crypto from "node:crypto";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const REDIRECT_URI = "v3://auth/google/callback";
const FLOW_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — generous for users who switch tabs.

interface PendingFlow {
  readonly state: string;
  readonly codeVerifier: string;
  readonly clientId: string;
  readonly resolve: (result: { readonly idToken: string } | null) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
}

let pendingFlow: PendingFlow | null = null;

const base64UrlEncode = (buffer: Buffer): string =>
  buffer.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

const generateState = (): string => base64UrlEncode(Crypto.randomBytes(24));

const generateCodeVerifier = (): string => base64UrlEncode(Crypto.randomBytes(32));

const generateCodeChallenge = (verifier: string): string =>
  base64UrlEncode(Crypto.createHash("sha256").update(verifier).digest());

const buildAuthUrl = (input: {
  readonly clientId: string;
  readonly state: string;
  readonly codeChallenge: string;
}): string => {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
    access_type: "offline",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
};

const cancelPending = (reason: string): void => {
  if (pendingFlow === null) return;
  const flow = pendingFlow;
  pendingFlow = null;
  clearTimeout(flow.timeout);
  flow.reject(new Error(reason));
};

export interface V3GoogleAuthFlow {
  readonly start: (input: { readonly clientId: string }) => Promise<{ readonly idToken: string }>;
  readonly handleDeepLink: (url: string) => boolean;
  readonly cancel: () => void;
}

export interface V3GoogleAuthFlowDeps {
  // Electron's `shell.openExternal` in main.ts; tests pass a recorder.
  readonly openExternal: (url: string) => Promise<void>;
  // `globalThis.fetch` in main.ts; tests inject a stub. Bound function
  // expected (no `this` reference inside).
  readonly fetch: typeof fetch;
}

export const createV3GoogleAuthFlow = (deps: V3GoogleAuthFlowDeps): V3GoogleAuthFlow => {
  const exchangeCodeForIdToken = async (input: {
    readonly code: string;
    readonly clientId: string;
    readonly codeVerifier: string;
  }): Promise<string> => {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: REDIRECT_URI,
      client_id: input.clientId,
      code_verifier: input.codeVerifier,
    });
    const response = await deps.fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Google token exchange failed (${response.status}): ${text}`);
    }
    const json = (await response.json()) as { id_token?: unknown };
    if (typeof json.id_token !== "string" || json.id_token.length === 0) {
      throw new Error("Google token response did not include an id_token.");
    }
    return json.id_token;
  };

  const start: V3GoogleAuthFlow["start"] = async ({ clientId }) => {
    if (clientId.length === 0) {
      throw new Error("Google client id is empty.");
    }
    cancelPending("Superseded by a new sign-in attempt.");

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const handoff = new Promise<{ readonly idToken: string } | null>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cancelPending("Google sign-in timed out.");
      }, FLOW_TIMEOUT_MS);
      pendingFlow = { state, codeVerifier, clientId, resolve, reject, timeout };
    });

    await deps.openExternal(buildAuthUrl({ clientId, state, codeChallenge })).catch((cause) => {
      cancelPending("Failed to open the system browser.");
      throw cause;
    });

    const result = await handoff;
    if (result === null) {
      throw new Error("Google sign-in was cancelled by the user.");
    }
    return result;
  };

  const handleDeepLink: V3GoogleAuthFlow["handleDeepLink"] = (rawUrl) => {
    if (pendingFlow === null) return false;
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return false;
    }
    if (url.protocol !== "v3:") return false;
    // URL parses `v3://auth/google/callback` as host=auth, pathname=/google/callback.
    const path = `${url.host}${url.pathname}`.replace(/\/+$/, "");
    if (path !== "auth/google/callback") return false;

    const flow = pendingFlow;
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error !== null) {
      pendingFlow = null;
      clearTimeout(flow.timeout);
      flow.reject(new Error(`Google returned error: ${error}`));
      return true;
    }
    if (state !== flow.state) {
      // Hostile or stale callback. Don't disturb the pending flow.
      return false;
    }
    if (code === null || code.length === 0) {
      pendingFlow = null;
      clearTimeout(flow.timeout);
      flow.reject(new Error("Google callback did not include an authorization code."));
      return true;
    }

    pendingFlow = null;
    clearTimeout(flow.timeout);

    exchangeCodeForIdToken({ code, clientId: flow.clientId, codeVerifier: flow.codeVerifier })
      .then((idToken) => flow.resolve({ idToken }))
      .catch((cause) => flow.reject(cause instanceof Error ? cause : new Error(String(cause))));
    return true;
  };

  const cancel: V3GoogleAuthFlow["cancel"] = () => {
    cancelPending("Sign-in cancelled.");
  };

  return { start, handleDeepLink, cancel };
};

// A process-wide singleton so renderer requests through IPC and
// `app.on("open-url"/"second-instance")` listeners share the same pending
// flow registry. Built lazily so tests that import `createV3GoogleAuthFlow`
// directly don't pull in `electron`.
let sharedFlow: V3GoogleAuthFlow | null = null;

export const getSharedV3GoogleAuthFlow = (): V3GoogleAuthFlow => {
  if (sharedFlow === null) {
    // Late require keeps `electron` out of vitest's module graph for unit
    // tests that exercise the pure factory.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { shell } = require("electron") as typeof import("electron");
    sharedFlow = createV3GoogleAuthFlow({
      openExternal: (url) => shell.openExternal(url),
      fetch: globalThis.fetch.bind(globalThis),
    });
  }
  return sharedFlow;
};
