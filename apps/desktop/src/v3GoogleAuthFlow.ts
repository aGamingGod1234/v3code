// V3 Google sign-in (Electron main-process side) — loopback redirect.
//
// Renderer asks main to open the system browser at Google's consent
// screen. The consent screen redirects to an ephemeral HTTP server we
// start on `127.0.0.1:0` just before opening the browser; that server
// captures the `?code=…` callback, closes itself, and we exchange the
// code for an `id_token` + `access_token`. Single in-flight flow: a
// new sign-in supersedes the previous one.
//
// Requested scopes:
//   * openid + email + profile — standard identity claims for the JWT
//   * drive.appdata — per-app hidden folder in the user's Drive, scoped
//     only to V3's own blob (spec §3.4 cross-device server-URL discovery)
//
// Why loopback, not a custom URI scheme: Google rejects `v3://` (and
// other non-https URIs) on Web application OAuth clients — the Cloud
// Console UI surfaces "must end with a public top-level domain." The
// documented replacement for installed apps is a loopback redirect to
// `http://127.0.0.1:<any-port>/callback`. The Web OAuth client only
// needs `http://127.0.0.1` registered as an authorized redirect URI;
// Google accepts any port at runtime.
//
// Why PKCE: this is an installed-app OAuth client. We cannot rely on
// the client secret for token exchange even though it happens to be
// embedded in the bundle today, so PKCE (RFC 7636) binds the auth code
// to this specific request.
//
// Single in-flight flow: starting a second flow cancels the first and
// closes its loopback server. The renderer is expected to disable its
// sign-in button while a flow is outstanding; we defend in depth here.

import type { GoogleTokenBundle } from "@v3tools/contracts";
import { withGoogleTokenExpiry } from "@v3tools/shared/googleTokens";
import * as Crypto from "node:crypto";
import * as Http from "node:http";
import type { AddressInfo } from "node:net";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const FLOW_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes — generous for users who switch tabs.

type TokenExchangeResult = GoogleTokenBundle;

export interface LoopbackServer {
  readonly redirectUri: string;
  readonly close: () => void;
}

interface PendingFlow {
  readonly state: string;
  readonly codeVerifier: string;
  readonly clientId: string;
  readonly clientSecret: string | null;
  readonly redirectUri: string;
  readonly server: LoopbackServer;
  readonly resolve: (result: TokenExchangeResult | null) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
}

let pendingFlow: PendingFlow | null = null;

// The HTML served back to the user's browser after Google redirects to
// our loopback. Kept small + self-contained; the browser tab is usually
// closed by the user within seconds.
const CALLBACK_SUCCESS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>V3 Code — signed in</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: #0a0a0a; color: #f8fafc; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .card { text-align: center; padding: 40px; max-width: 420px; }
  h1 { margin: 0 0 12px 0; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
  p { margin: 0; color: #9ca3af; font-size: 14px; line-height: 1.5; }
</style>
</head>
<body>
  <div class="card">
    <h1>Signed in</h1>
    <p>You can close this tab and return to V3 Code.</p>
  </div>
</body>
</html>
`;

const CALLBACK_ERROR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>V3 Code — sign-in failed</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: #0a0a0a; color: #f8fafc; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .card { text-align: center; padding: 40px; max-width: 420px; }
  h1 { margin: 0 0 12px 0; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; color: #f87171; }
  p { margin: 0; color: #9ca3af; font-size: 14px; line-height: 1.5; }
</style>
</head>
<body>
  <div class="card">
    <h1>Sign-in did not complete</h1>
    <p>You can close this tab and try again in V3 Code.</p>
  </div>
</body>
</html>
`;

const base64UrlEncode = (buffer: Buffer): string =>
  buffer.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

const generateState = (): string => base64UrlEncode(Crypto.randomBytes(24));

const generateCodeVerifier = (): string => base64UrlEncode(Crypto.randomBytes(32));

const generateCodeChallenge = (verifier: string): string =>
  base64UrlEncode(Crypto.createHash("sha256").update(verifier).digest());

const buildAuthUrl = (input: {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly state: string;
  readonly codeChallenge: string;
}): string => {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: "openid email profile https://www.googleapis.com/auth/drive.appdata",
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
    access_type: "offline",
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
};

const closePending = (): PendingFlow | null => {
  if (pendingFlow === null) return null;
  const flow = pendingFlow;
  pendingFlow = null;
  clearTimeout(flow.timeout);
  try {
    flow.server.close();
  } catch {
    // swallow — the server may already be closed
  }
  return flow;
};

const cancelPending = (reason: string): void => {
  const flow = closePending();
  if (flow !== null) {
    flow.reject(new Error(reason));
  }
};

export interface V3GoogleAuthFlow {
  readonly start: (input: { readonly clientId: string }) => Promise<TokenExchangeResult>;
  // Kept as a no-op for loopback flow — main.ts still wires v3:// deep
  // links into this handler for backwards compatibility with older
  // client versions that might still fire one. Returning `false` tells
  // callers the URL wasn't consumed so they can fall through to other
  // handlers (e.g. pairing links) once those exist.
  readonly handleDeepLink: (url: string) => boolean;
  readonly cancel: () => void;
}

export interface V3GoogleAuthFlowDeps {
  // Electron's `shell.openExternal` in main.ts; tests pass a recorder.
  readonly openExternal: (url: string) => Promise<void>;
  // `globalThis.fetch` in main.ts; tests inject a stub. Bound function
  // expected (no `this` reference inside).
  readonly fetch: typeof fetch;
  // Loopback server factory — pluggable for tests. Default uses
  // `node:http` bound to 127.0.0.1 on an OS-assigned port.
  readonly createLoopbackServer?: (onCallback: (url: URL) => void) => Promise<LoopbackServer>;
  // Google Cloud OAuth client secret. REQUIRED when the OAuth client
  // type is "Web application" — Google rejects the token exchange with
  // `invalid_request: client_secret is missing` without it even though
  // we're using PKCE. "Desktop application" clients would not need this.
  // Null/undefined means the exchange sends only the PKCE verifier, which
  // works only for Desktop-type OAuth clients.
  readonly clientSecret?: string | null;
}

const defaultCreateLoopbackServer = (onCallback: (url: URL) => void): Promise<LoopbackServer> =>
  new Promise((resolve, reject) => {
    const server = Http.createServer((req, res) => {
      if (req.url === undefined || req.url === null) {
        res.writeHead(400).end();
        return;
      }
      const reqUrl = new URL(req.url, "http://127.0.0.1");
      if (reqUrl.pathname !== "/callback") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
        return;
      }
      const hasError = reqUrl.searchParams.get("error") !== null;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(hasError ? CALLBACK_ERROR_HTML : CALLBACK_SUCCESS_HTML);
      onCallback(reqUrl);
    });
    server.once("error", reject);
    // Bind to the loopback interface on an ephemeral port. `0` asks the
    // OS to pick a free port; we read it back from `server.address()`.
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo | null;
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Loopback server failed to bind."));
        return;
      }
      resolve({
        redirectUri: `http://127.0.0.1:${address.port}/callback`,
        close: () => {
          // `close()` stops accepting new connections; any already-open
          // ones finish their response. That's fine — we only serve one
          // request per flow.
          server.close();
        },
      });
    });
  });

export const createV3GoogleAuthFlow = (deps: V3GoogleAuthFlowDeps): V3GoogleAuthFlow => {
  const createLoopbackServer = deps.createLoopbackServer ?? defaultCreateLoopbackServer;

  const exchangeCodeForTokens = async (input: {
    readonly code: string;
    readonly clientId: string;
    readonly clientSecret: string | null;
    readonly codeVerifier: string;
    readonly redirectUri: string;
  }): Promise<TokenExchangeResult> => {
    const bodyParams: Record<string, string> = {
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: input.clientId,
      code_verifier: input.codeVerifier,
    };
    if (input.clientSecret !== null && input.clientSecret.length > 0) {
      bodyParams.client_secret = input.clientSecret;
    }
    const body = new URLSearchParams(bodyParams);
    const response = await deps.fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Google token exchange failed (${response.status}): ${text}`);
    }
    const json = (await response.json()) as {
      id_token?: unknown;
      access_token?: unknown;
      refresh_token?: unknown;
      expires_in?: unknown;
      scope?: unknown;
      token_type?: unknown;
    };
    if (typeof json.id_token !== "string" || json.id_token.length === 0) {
      throw new Error("Google token response did not include an id_token.");
    }
    if (typeof json.access_token !== "string" || json.access_token.length === 0) {
      throw new Error("Google token response did not include an access_token.");
    }
    return withGoogleTokenExpiry(
      {
        idToken: json.id_token,
        accessToken: json.access_token,
        refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
        scope: typeof json.scope === "string" ? json.scope : null,
        tokenType: typeof json.token_type === "string" ? json.token_type : null,
      },
      typeof json.expires_in === "number" ? json.expires_in : 3600,
    );
  };

  const handleCallback = (url: URL): void => {
    if (pendingFlow === null) return;
    const flow = pendingFlow;

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error !== null) {
      closePending();
      flow.reject(new Error(`Google returned error: ${error}`));
      return;
    }
    if (state !== flow.state) {
      // Hostile or stale callback. Ignore — the real callback or the
      // timeout will clean up.
      return;
    }
    if (code === null || code.length === 0) {
      closePending();
      flow.reject(new Error("Google callback did not include an authorization code."));
      return;
    }

    closePending();

    exchangeCodeForTokens({
      code,
      clientId: flow.clientId,
      clientSecret: flow.clientSecret,
      codeVerifier: flow.codeVerifier,
      redirectUri: flow.redirectUri,
    })
      .then((tokens) => flow.resolve(tokens))
      .catch((cause) => flow.reject(cause instanceof Error ? cause : new Error(String(cause))));
  };

  const start: V3GoogleAuthFlow["start"] = async ({ clientId }) => {
    if (clientId.length === 0) {
      throw new Error("Google client id is empty.");
    }
    cancelPending("Superseded by a new sign-in attempt.");

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const server = await createLoopbackServer(handleCallback);

    const handoff = new Promise<TokenExchangeResult | null>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cancelPending("Google sign-in timed out.");
      }, FLOW_TIMEOUT_MS);
      pendingFlow = {
        state,
        codeVerifier,
        clientId,
        clientSecret: deps.clientSecret ?? null,
        redirectUri: server.redirectUri,
        server,
        resolve,
        reject,
        timeout,
      };
    });

    await deps
      .openExternal(
        buildAuthUrl({
          clientId,
          redirectUri: server.redirectUri,
          state,
          codeChallenge,
        }),
      )
      .catch((cause) => {
        cancelPending("Failed to open the system browser.");
        throw cause;
      });

    const result = await handoff;
    if (result === null) {
      throw new Error("Google sign-in was cancelled by the user.");
    }
    return result;
  };

  // No-op: kept so existing callers that pipe `v3://` deep links (e.g.
  // main.ts's `second-instance` / `open-url` handlers) don't need to be
  // updated in lockstep. The loopback flow doesn't use deep links.
  const handleDeepLink: V3GoogleAuthFlow["handleDeepLink"] = () => false;

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
    const { shell } = require("electron") as typeof import("electron");
    // Pull the baked-in OAuth client secret. Web-application OAuth clients
    // require it on the token exchange even with PKCE; the factory builds
    // a flow without it if the bundle wasn't compiled with credentials.
    const { EMBEDDED_GOOGLE_CLIENT_SECRET } =
      require("./embeddedAuthConfig.ts") as typeof import("./embeddedAuthConfig.ts");
    sharedFlow = createV3GoogleAuthFlow({
      openExternal: (url) => shell.openExternal(url),
      fetch: globalThis.fetch.bind(globalThis),
      clientSecret: EMBEDDED_GOOGLE_CLIENT_SECRET ?? null,
    });
  }
  return sharedFlow;
};
