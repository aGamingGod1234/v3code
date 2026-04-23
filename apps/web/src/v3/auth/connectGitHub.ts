// V3 Phase 1e — GitHub connect orchestrator (renderer-side).
//
// Two flows, chosen at call-time by `isElectron`:
//
//   * Browser (cloud-mode / web): redirects the current window to the
//     server-hosted `/api/auth/github/authorize` endpoint. The server
//     302s to github.com, completes the callback, and returns to the
//     original page. Works because browser cookies carry the V3 session
//     through the whole dance.
//
//   * Desktop (Electron): defers to the main process via
//     `desktopBridge.openV3GitHubSignIn`, which starts a loopback HTTP
//     server on 127.0.0.1, opens the system browser at GitHub's
//     consent screen, captures the `code` on the loopback, and
//     exchanges it for an access token. The renderer then POSTs the
//     token to `/api/auth/github/bootstrap` so the server binds it to
//     the signed-in V3 user. This keeps the OAuth consent UI in the
//     user's real browser instead of hijacking the Electron window.
//
// This module also exposes:
//   - `fetchGitHubConnectionStatus` — reads /api/auth/github/status
//     to display the connected account in the UI.
//   - `disconnectGitHub` — POSTs /api/auth/github/disconnect.
//
// All calls thread through `resolvePrimaryEnvironmentHttpUrl` so they
// land on the correct origin regardless of Electron, dev server, or
// cloud bundle.

import {
  GitHubBootstrapResult,
  GitHubClientPublicConfig,
  GitHubConnectionStatus,
  GitHubDisconnectResult,
} from "@v3tools/contracts";
import { Schema } from "effect";

import { resolvePrimaryEnvironmentHttpUrl } from "../../environments/primary";
import { isElectron } from "../../env";

export const fetchGitHubClientConfig = async (
  signal?: AbortSignal,
): Promise<GitHubClientPublicConfig> => {
  const init: RequestInit = { credentials: "include", ...(signal ? { signal } : {}) };
  const response = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/auth/github/config"), init);
  if (!response.ok) {
    throw new Error(`github config request failed (status ${response.status})`);
  }
  return Schema.decodeUnknownSync(GitHubClientPublicConfig)(await response.json());
};

export const fetchGitHubConnectionStatus = async (
  signal?: AbortSignal,
): Promise<GitHubConnectionStatus> => {
  const init: RequestInit = { credentials: "include", ...(signal ? { signal } : {}) };
  const response = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/auth/github/status"), init);
  if (!response.ok) {
    throw new Error(`github status request failed (status ${response.status})`);
  }
  return Schema.decodeUnknownSync(GitHubConnectionStatus)(await response.json());
};

export class V3GitHubConnectError extends Error {
  readonly code: V3GitHubConnectErrorCode;
  constructor(code: V3GitHubConnectErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = "V3GitHubConnectError";
  }
}

export type V3GitHubConnectErrorCode =
  | "bridge-unavailable"
  | "user-cancelled"
  | "bootstrap-failed"
  | "network"
  | "not-configured";

export interface DesktopConnectGitHubResult {
  readonly connected: true;
  readonly username: string;
}

/**
 * Desktop-only: drive the loopback-based GitHub OAuth flow via the
 * Electron bridge and then POST the resulting access token to the V3
 * server's bootstrap endpoint so it's encrypted and bound to the
 * signed-in user. Caller awaits the promise and refreshes the
 * connection status UI on resolve.
 */
export const startConnectGitHubDesktop = async (
  scopes: string,
): Promise<DesktopConnectGitHubResult> => {
  const bridge = typeof window !== "undefined" ? window.desktopBridge : undefined;
  if (!bridge || bridge.openV3GitHubSignIn === undefined) {
    throw new V3GitHubConnectError(
      "bridge-unavailable",
      "GitHub sign-in requires the V3 desktop bridge.",
    );
  }

  const handoff = await bridge.openV3GitHubSignIn({ scopes }).catch((cause) => {
    const message = cause instanceof Error ? cause.message : String(cause);
    const lowered = message.toLowerCase();
    const code: V3GitHubConnectErrorCode = lowered.includes("cancel")
      ? "user-cancelled"
      : lowered.includes("not configured")
        ? "not-configured"
        : "bridge-unavailable";
    throw new V3GitHubConnectError(code, message, { cause });
  });

  const response = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/auth/github/bootstrap"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      accessToken: handoff.accessToken,
      scopes: handoff.scopes,
    }),
  }).catch((cause) => {
    throw new V3GitHubConnectError("network", "Failed to reach the V3 server.", { cause });
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new V3GitHubConnectError(
      "bootstrap-failed",
      `GitHub bootstrap rejected (${response.status}): ${text || "unknown error"}`,
    );
  }

  const body = Schema.decodeUnknownSync(GitHubBootstrapResult)(await response.json());
  return { connected: true, username: body.username };
};

/**
 * Kicks off the server-hosted GitHub connect redirect. The browser
 * navigates to `/api/auth/github/authorize` and will eventually land
 * back on `returnTo` once the callback persists the token.
 *
 * In the desktop build this is bypassed in favour of
 * `startConnectGitHubDesktop`, which runs the consent UI in the user's
 * external browser instead of hijacking the Electron window.
 */
export const startConnectGitHub = (returnTo?: string): void => {
  if (typeof window === "undefined") return;
  const resolvedReturnTo =
    returnTo ?? `${window.location.pathname}${window.location.search}${window.location.hash}`;
  // IMPORTANT: pass the path and search params SEPARATELY. The helper
  // does `url.pathname = pathname`, so if the path contains a literal
  // `?`, the URL constructor encodes it as `%3F` and the server sees
  // `/api/auth/github/authorize%3Freturn_to=...` which falls through
  // to the SPA handler (user just lands back on the app home).
  const searchParams: Record<string, string> = {};
  if (resolvedReturnTo.length > 0) {
    searchParams.return_to = resolvedReturnTo;
  }
  window.location.href = resolvePrimaryEnvironmentHttpUrl(
    "/api/auth/github/authorize",
    searchParams,
  );
};

/** True when the current runtime should use the desktop loopback flow. */
export const preferDesktopGitHubFlow = (): boolean =>
  isElectron &&
  typeof window !== "undefined" &&
  window.desktopBridge?.openV3GitHubSignIn !== undefined;

export const disconnectGitHub = async (): Promise<boolean> => {
  const response = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/auth/github/disconnect"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) {
    throw new Error(`github disconnect failed (status ${response.status})`);
  }
  const body = Schema.decodeUnknownSync(GitHubDisconnectResult)(await response.json());
  return body.disconnected;
};
