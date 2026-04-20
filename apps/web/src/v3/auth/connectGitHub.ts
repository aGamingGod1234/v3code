// V3 Phase 1e — GitHub connect orchestrator (renderer-side).
//
// Drives the "Connect GitHub" flow from any page in the V3 web app by
// redirecting the browser to the server-hosted
// `/api/auth/github/authorize` endpoint. The browser navigates away;
// on return the callback has already dropped the encrypted token on
// the server and redirected back to the caller-specified page.
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
  GitHubClientPublicConfig,
  GitHubConnectionStatus,
  GitHubDisconnectResult,
} from "@v3tools/contracts";
import { Schema } from "effect";

import { resolvePrimaryEnvironmentHttpUrl } from "../../environments/primary";

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

/**
 * Kicks off the server-hosted GitHub connect redirect. The browser
 * navigates to `/api/auth/github/authorize` and will eventually land
 * back on `returnTo` once the callback persists the token.
 */
export const startConnectGitHub = (returnTo?: string): void => {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams();
  const resolvedReturnTo =
    returnTo ?? `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (resolvedReturnTo.length > 0) params.set("return_to", resolvedReturnTo);
  window.location.href = resolvePrimaryEnvironmentHttpUrl(
    `/api/auth/github/authorize?${params.toString()}`,
  );
};

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
