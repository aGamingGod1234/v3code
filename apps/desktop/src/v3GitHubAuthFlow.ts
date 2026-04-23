// V3 GitHub sign-in (Electron main-process side) — loopback redirect.
//
// Mirrors `v3GoogleAuthFlow.ts`: the renderer asks main to open the
// system browser at GitHub's consent screen; GitHub redirects to an
// ephemeral `127.0.0.1:<port>/callback` server we spin up just before
// opening the browser; that server captures the `?code=…` callback,
// closes itself, and we exchange the code for an `access_token` that
// the renderer then hands to the server via
// `POST /api/auth/github/bootstrap`.
//
// Why loopback instead of a server-hosted redirect: the V3 server runs
// inside the Electron bundle at 127.0.0.1 with session cookies stored
// in Electron's isolated cookie jar. An external browser doesn't share
// that jar, so `/api/auth/github/authorize` (which requires a V3
// session) would 401. The loopback pattern cleanly decouples the
// browser-side OAuth from the Electron session and matches how Google
// sign-in already works desktop-side.
//
// Single in-flight flow: starting a second flow cancels the first and
// closes its loopback server. The renderer is expected to disable its
// Connect GitHub button while a flow is outstanding; we defend in
// depth here.

import type { GitHubOAuthScope, GitHubTokenBundle } from "@v3tools/contracts";
import * as Crypto from "node:crypto";
import * as Http from "node:http";
import type { AddressInfo } from "node:net";

const TOKEN_ENDPOINT = "https://github.com/login/oauth/access_token";
const AUTH_ENDPOINT = "https://github.com/login/oauth/authorize";
const FLOW_TIMEOUT_MS = 5 * 60 * 1000;

export interface LoopbackServer {
  readonly redirectUri: string;
  readonly close: () => void;
}

interface PendingFlow {
  readonly state: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
  readonly server: LoopbackServer;
  readonly resolve: (result: GitHubTokenBundle | null) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
}

let pendingFlow: PendingFlow | null = null;

const CALLBACK_SUCCESS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>V3 Code — GitHub connected</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: #0a0a0a; color: #f8fafc; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .card { text-align: center; padding: 40px; max-width: 420px; }
  h1 { margin: 0 0 12px 0; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
  p { margin: 0; color: #9ca3af; font-size: 14px; line-height: 1.5; }
</style>
</head>
<body>
  <div class="card">
    <h1>GitHub connected</h1>
    <p>You can close this tab and return to V3 Code.</p>
  </div>
</body>
</html>
`;

const CALLBACK_ERROR_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>V3 Code — GitHub sign-in failed</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: #0a0a0a; color: #f8fafc; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
  .card { text-align: center; padding: 40px; max-width: 420px; }
  h1 { margin: 0 0 12px 0; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; color: #f87171; }
  p { margin: 0; color: #9ca3af; font-size: 14px; line-height: 1.5; }
</style>
</head>
<body>
  <div class="card">
    <h1>GitHub sign-in did not complete</h1>
    <p>You can close this tab and try again in V3 Code.</p>
  </div>
</body>
</html>
`;

const base64UrlEncode = (buffer: Buffer): string =>
  buffer.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

const generateState = (): string => base64UrlEncode(Crypto.randomBytes(24));

const buildAuthUrl = (input: {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly state: string;
  readonly scopes: string;
}): string => {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    scope: input.scopes.trim(),
    allow_signup: "true",
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

export interface V3GitHubAuthFlow {
  readonly start: (input: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly scopes: string;
  }) => Promise<GitHubTokenBundle>;
  readonly cancel: () => void;
}

export interface V3GitHubAuthFlowDeps {
  readonly openExternal: (url: string) => Promise<void>;
  readonly fetch: typeof fetch;
  readonly createLoopbackServer?: (onCallback: (url: URL) => void) => Promise<LoopbackServer>;
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
          server.close();
        },
      });
    });
  });

export const createV3GitHubAuthFlow = (deps: V3GitHubAuthFlowDeps): V3GitHubAuthFlow => {
  const createLoopbackServer = deps.createLoopbackServer ?? defaultCreateLoopbackServer;

  const exchangeCodeForTokens = async (input: {
    readonly code: string;
    readonly clientId: string;
    readonly clientSecret: string;
    readonly redirectUri: string;
  }): Promise<GitHubTokenBundle> => {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: input.clientId,
      client_secret: input.clientSecret,
    });
    const response = await deps.fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": "V3-Code-Desktop",
      },
      body: body.toString(),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`GitHub token exchange failed (${response.status}): ${text}`);
    }
    const json = (await response.json()) as {
      access_token?: unknown;
      scope?: unknown;
      token_type?: unknown;
      error?: unknown;
      error_description?: unknown;
    };
    if (typeof json.error === "string" && json.error.length > 0) {
      const description = typeof json.error_description === "string" ? json.error_description : "";
      throw new Error(
        `GitHub rejected the exchange: ${json.error}${description ? ` — ${description}` : ""}`,
      );
    }
    if (typeof json.access_token !== "string" || json.access_token.length === 0) {
      throw new Error("GitHub token response did not include an access_token.");
    }
    // GitHub returns the granted scope list as a comma-separated string
    // (e.g. "repo,read:user"). We brand each trimmed entry in place so
    // the bundle matches the contract's GitHubTokenBundle shape —
    // TrimmedNonEmptyString.brand<"GitHubOAuthScope">.
    const scopes: ReadonlyArray<GitHubOAuthScope> =
      typeof json.scope === "string" && json.scope.length > 0
        ? json.scope
            .split(",")
            .map((scope) => scope.trim())
            .filter((scope) => scope.length > 0)
            .map((scope) => scope as GitHubOAuthScope)
        : [];
    return {
      accessToken: json.access_token,
      scopes,
      tokenType: typeof json.token_type === "string" ? json.token_type : null,
    };
  };

  const handleCallback = (url: URL): void => {
    if (pendingFlow === null) return;
    const flow = pendingFlow;

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error !== null) {
      closePending();
      flow.reject(new Error(`GitHub returned error: ${error}`));
      return;
    }
    if (state !== flow.state) {
      // Hostile or stale callback. Ignore — the real callback or the
      // timeout will clean up.
      return;
    }
    if (code === null || code.length === 0) {
      closePending();
      flow.reject(new Error("GitHub callback did not include an authorization code."));
      return;
    }

    closePending();

    exchangeCodeForTokens({
      code,
      clientId: flow.clientId,
      clientSecret: flow.clientSecret,
      redirectUri: flow.redirectUri,
    })
      .then((tokens) => flow.resolve(tokens))
      .catch((cause) => flow.reject(cause instanceof Error ? cause : new Error(String(cause))));
  };

  const start: V3GitHubAuthFlow["start"] = async ({ clientId, clientSecret, scopes }) => {
    if (clientId.length === 0) {
      throw new Error("GitHub client id is empty.");
    }
    if (clientSecret.length === 0) {
      throw new Error("GitHub client secret is empty.");
    }
    cancelPending("Superseded by a new GitHub sign-in attempt.");

    const state = generateState();
    const server = await createLoopbackServer(handleCallback);

    const handoff = new Promise<GitHubTokenBundle | null>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cancelPending("GitHub sign-in timed out.");
      }, FLOW_TIMEOUT_MS);
      pendingFlow = {
        state,
        clientId,
        clientSecret,
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
          scopes,
        }),
      )
      .catch((cause) => {
        cancelPending("Failed to open the system browser.");
        throw cause;
      });

    const result = await handoff;
    if (result === null) {
      throw new Error("GitHub sign-in was cancelled by the user.");
    }
    return result;
  };

  const cancel: V3GitHubAuthFlow["cancel"] = () => {
    cancelPending("Sign-in cancelled.");
  };

  return { start, cancel };
};

// Process-wide singleton — same pattern as the Google flow so IPC
// handlers and tests share state. Built lazily to keep `electron` out
// of the unit-test module graph.
let sharedFlow: V3GitHubAuthFlow | null = null;

export const getSharedV3GitHubAuthFlow = (): V3GitHubAuthFlow => {
  if (sharedFlow === null) {
    const { shell } = require("electron") as typeof import("electron");
    sharedFlow = createV3GitHubAuthFlow({
      openExternal: (url) => shell.openExternal(url),
      fetch: globalThis.fetch.bind(globalThis),
    });
  }
  return sharedFlow;
};
