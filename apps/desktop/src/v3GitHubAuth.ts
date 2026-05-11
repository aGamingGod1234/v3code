// V3 GitHub Device Flow (main process).
//
// Token handling lives entirely here — the renderer drives the dialog UI by
// calling start/getDeviceFlowStatus/cancel against opaque deviceCodeHandles.
// After success the renderer can consume the token once to bootstrap it into
// the authenticated V3 server session. Polling cadence is owned by main:
// after `startDeviceFlow`, this module schedules its own setTimeout-based
// poll loop against GitHub's token endpoint. The renderer's
// `getDeviceFlowStatus` IPC just reads the cached state.
//
// Tokens are persisted via Electron `safeStorage` in
// <userData>/github-auth.enc.json. If safeStorage is unavailable on the OS
// profile, the flow short-circuits with a clear error and remains
// disconnected — we never persist plaintext.
//
// Public Device Flow has no client secret, so disconnect() can only delete
// the local copy. The UI exposes a "Revoke on GitHub…" link to
// https://github.com/settings/applications for manual grant revocation.

import * as Crypto from "node:crypto";
import * as FS from "node:fs/promises";
import * as Path from "node:path";

import { app, ipcMain, safeStorage } from "electron";

import type {
  GitHubAuthBootstrapState,
  GitHubAuthStatus,
  GitHubDeviceFlowClientConfig,
  GitHubDeviceFlowStart,
  GitHubDeviceFlowState,
  GitHubDeviceFlowStatus,
  GitHubTokenBundle,
  GitHubTokenValidation,
} from "@v3tools/contracts";
import { EMBEDDED_GITHUB_CLIENT_ID } from "./embeddedAuthConfig.ts";

export const V3_GITHUB_AUTH_CHANNELS = {
  SET_CLIENT_ID_OVERRIDE: "desktop:v3-github-set-client-id-override",
  GET_CLIENT_CONFIG: "desktop:v3-github-get-client-config",
  START_DEVICE_FLOW: "desktop:v3-github-start-device-flow",
  GET_DEVICE_FLOW_STATUS: "desktop:v3-github-get-device-flow-status",
  CONSUME_DEVICE_FLOW_TOKEN: "desktop:v3-github-consume-device-flow-token",
  CANCEL_DEVICE_FLOW: "desktop:v3-github-cancel-device-flow",
  GET_STATUS: "desktop:v3-github-get-status",
  DISCONNECT: "desktop:v3-github-disconnect",
  VALIDATE_TOKEN: "desktop:v3-github-validate-token",
  MANUAL_REVOKE_URL: "desktop:v3-github-manual-revoke-url",
} as const;

const TOKEN_FILE_NAME = "github-auth.enc.json";
const MANUAL_REVOKE_URL = "https://github.com/settings/applications";
const DEVICE_CODE_URL = "https://github.com/login/device/code";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";
const VALIDATION_DEBOUNCE_MS = 60 * 1000;
const SLOW_DOWN_BUMP_S = 5;

const REDACT_KEYS = /token|secret|code|access[_-]?token/i;
const REDACT_TOKEN_PATTERN = /gh[opsu]_[A-Za-z0-9_]+/g;

const redactValue = (value: unknown): unknown => {
  if (typeof value === "string") {
    return value.replace(REDACT_TOKEN_PATTERN, "[REDACTED]");
  }
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = REDACT_KEYS.test(key) ? "[REDACTED]" : redactValue(inner);
    }
    return out;
  }
  return value;
};

const log = (event: string, fields: Record<string, unknown> = {}): void => {
  console.log(`[v3-github-auth] ${event}`, redactValue(fields));
};

interface StoredTokenBlob {
  readonly token: string;
  readonly login: string | null;
  readonly scopes: ReadonlyArray<string>;
  readonly avatarUrl: string | null;
  readonly obtainedAt: string;
  readonly tokenSource: "device-flow";
}

interface DeviceFlowEntry {
  readonly clientId: string;
  readonly deviceCode: string;
  readonly expiresAt: number;
  readonly scopes: ReadonlyArray<string>;
  state: GitHubDeviceFlowState;
  error: string | null;
  lastPolledAt: string | null;
  pollIntervalSeconds: number;
  cancelToken: AbortController;
  pollTimer: NodeJS.Timeout | null;
  bootstrapToken: GitHubTokenBundle | null;
}

interface CachedStatus {
  readonly status: GitHubAuthStatus;
  readonly cachedAt: number;
}

interface MainState {
  buildTimeClientId: string | null;
  rendererClientIdOverride: string | null;
  inFlight: Map<string, DeviceFlowEntry>;
  cachedStatus: CachedStatus | null;
  lastValidationAt: number;
}

const state: MainState = {
  buildTimeClientId:
    process.env.V3CODE_GITHUB_PUBLIC_CLIENT_ID ||
    process.env.V3CODE_GITHUB_CLIENT_ID ||
    EMBEDDED_GITHUB_CLIENT_ID ||
    null,
  rendererClientIdOverride: null,
  inFlight: new Map(),
  cachedStatus: null,
  lastValidationAt: 0,
};

// --- Token storage --------------------------------------------------------

const tokenPath = (): string => Path.join(app.getPath("userData"), TOKEN_FILE_NAME);
const tokenTmpPath = (): string => `${tokenPath()}.tmp`;

const writeTokenAtomically = async (blob: StoredTokenBlob): Promise<void> => {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure storage is unavailable on this OS profile. Sign-in cannot persist.");
  }
  const json = JSON.stringify(blob);
  const encrypted = safeStorage.encryptString(json);
  const tmp = tokenTmpPath();
  await FS.mkdir(Path.dirname(tmp), { recursive: true });
  const handle = await FS.open(tmp, "w", 0o600);
  try {
    await handle.write(encrypted);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await FS.rename(tmp, tokenPath());
  if (process.platform !== "win32") {
    try {
      await FS.chmod(tokenPath(), 0o600);
    } catch {
      // best-effort
    }
  }
};

const readTokenIfPresent = async (): Promise<StoredTokenBlob | null> => {
  if (!safeStorage.isEncryptionAvailable()) return null;
  let buffer: Buffer;
  try {
    buffer = await FS.readFile(tokenPath());
  } catch {
    return null;
  }
  try {
    const json = safeStorage.decryptString(buffer);
    const parsed = JSON.parse(json) as StoredTokenBlob;
    if (typeof parsed.token !== "string" || parsed.token.length === 0) return null;
    return parsed;
  } catch (cause) {
    log("decrypt-failed", { error: cause instanceof Error ? cause.message : String(cause) });
    return null;
  }
};

const clearTokenFile = async (): Promise<void> => {
  try {
    await FS.unlink(tokenPath());
  } catch {
    // ignore — already gone
  }
};

// --- Status caching -------------------------------------------------------

const buildDisconnectedStatus = (): GitHubAuthStatus => ({
  connected: false,
  partial: false,
  login: null,
  scopes: [],
  avatarUrl: null,
  tokenSource: null,
  lastValidatedAt: null,
  bootstrapState: "skipped",
  needsReconnect: false,
  reconnectReason: null,
});

const refreshCachedStatus = async (): Promise<GitHubAuthStatus> => {
  const blob = await readTokenIfPresent();
  if (!blob) {
    const status = buildDisconnectedStatus();
    state.cachedStatus = { status, cachedAt: Date.now() };
    return status;
  }
  // Bootstrap state stays "skipped" until we wire the server bootstrap relay.
  // The connected chip surfaces "local-only" via partial=true, so the UI is
  // honest about cloud-handoff being unavailable.
  const status: GitHubAuthStatus = {
    connected: true,
    partial: true,
    login: blob.login,
    scopes: blob.scopes,
    avatarUrl: blob.avatarUrl,
    tokenSource: blob.tokenSource,
    lastValidatedAt:
      state.lastValidationAt > 0 ? new Date(state.lastValidationAt).toISOString() : null,
    bootstrapState: "skipped",
    needsReconnect: false,
    reconnectReason: null,
  };
  state.cachedStatus = { status, cachedAt: Date.now() };
  return status;
};

// --- Client ID resolution -------------------------------------------------

const resolveClientId = (override?: string | null): string | null => {
  return resolveClientIdWithSource(override).clientId;
};

const resolveClientIdWithSource = (
  override?: string | null,
): {
  readonly clientId: string | null;
  readonly source: GitHubDeviceFlowClientConfig["source"];
} => {
  if (typeof override === "string" && override.trim().length > 0) {
    return { clientId: override.trim(), source: "override" };
  }
  if (state.rendererClientIdOverride) {
    return { clientId: state.rendererClientIdOverride, source: "override" };
  }
  if (state.buildTimeClientId) {
    return { clientId: state.buildTimeClientId, source: "build-time" };
  }
  return { clientId: null, source: "missing" };
};

// --- Device Flow polling --------------------------------------------------

interface TokenSuccess {
  readonly type: "success";
  readonly accessToken: string;
  readonly tokenScopes: ReadonlyArray<string>;
}
interface TokenFailure {
  readonly type: "failure";
  readonly state: GitHubDeviceFlowState;
  readonly error: string | null;
}
interface TokenPending {
  readonly type: "pending";
  readonly slowDown: boolean;
}

const parseScopeString = (raw: string | null | undefined): ReadonlyArray<string> => {
  if (!raw) return [];
  return raw
    .split(/[ ,]+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
};

const callTokenEndpoint = async (
  entry: DeviceFlowEntry,
): Promise<TokenSuccess | TokenFailure | TokenPending> => {
  const body = new URLSearchParams({
    client_id: entry.clientId,
    device_code: entry.deviceCode,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  });
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: entry.cancelToken.signal,
    });
  } catch (cause) {
    if ((cause as { name?: string }).name === "AbortError") {
      return { type: "failure", state: "cancelled", error: null };
    }
    return { type: "failure", state: "unknown_error", error: "network-error" };
  }
  let payload: Record<string, unknown>;
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    return { type: "failure", state: "unknown_error", error: "invalid-json" };
  }
  if (typeof payload.error === "string") {
    switch (payload.error) {
      case "authorization_pending":
        return { type: "pending", slowDown: false };
      case "slow_down":
        return { type: "pending", slowDown: true };
      case "expired_token":
        return { type: "failure", state: "expired_token", error: null };
      case "access_denied":
        return { type: "failure", state: "access_denied", error: null };
      case "incorrect_device_code":
        return { type: "failure", state: "incorrect_device_code", error: null };
      case "incorrect_client_credentials":
        return {
          type: "failure",
          state: "incorrect_client_credentials",
          error: typeof payload.error_description === "string" ? payload.error_description : null,
        };
      default:
        return {
          type: "failure",
          state: "unknown_error",
          error:
            typeof payload.error_description === "string"
              ? payload.error_description
              : String(payload.error),
        };
    }
  }
  const accessToken = typeof payload.access_token === "string" ? payload.access_token : null;
  if (!accessToken) {
    return { type: "failure", state: "unknown_error", error: "missing-access-token" };
  }
  const scopeStr = typeof payload.scope === "string" ? payload.scope : null;
  return { type: "success", accessToken, tokenScopes: parseScopeString(scopeStr) };
};

const fetchUserProfile = async (
  accessToken: string,
): Promise<{
  readonly login: string | null;
  readonly avatarUrl: string | null;
  readonly headerScopes: ReadonlyArray<string>;
}> => {
  let response: Response;
  try {
    response = await fetch(USER_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "V3Code-Desktop",
      },
    });
  } catch {
    return { login: null, avatarUrl: null, headerScopes: [] };
  }
  if (!response.ok) {
    return { login: null, avatarUrl: null, headerScopes: [] };
  }
  const headerScopes = parseScopeString(response.headers.get("X-OAuth-Scopes"));
  let login: string | null = null;
  let avatarUrl: string | null = null;
  try {
    const body = (await response.json()) as Record<string, unknown>;
    if (typeof body.login === "string") login = body.login;
    if (typeof body.avatar_url === "string") avatarUrl = body.avatar_url;
  } catch {
    // ignore
  }
  return { login, avatarUrl, headerScopes };
};

const onDeviceFlowSuccess = async (entry: DeviceFlowEntry, result: TokenSuccess): Promise<void> => {
  try {
    const profile = await fetchUserProfile(result.accessToken);
    const scopes = profile.headerScopes.length > 0 ? profile.headerScopes : result.tokenScopes;
    const blob: StoredTokenBlob = {
      token: result.accessToken,
      login: profile.login,
      scopes,
      avatarUrl: profile.avatarUrl,
      obtainedAt: new Date().toISOString(),
      tokenSource: "device-flow",
    };
    await writeTokenAtomically(blob);
    state.lastValidationAt = Date.now();
    await refreshCachedStatus();
    entry.bootstrapToken = {
      accessToken: result.accessToken as GitHubTokenBundle["accessToken"],
      scopes: scopes.map((scope) => scope as GitHubTokenBundle["scopes"][number]),
      tokenType: "bearer",
    };
    entry.state = "success";
    entry.error = null;
    log("device-flow-success", { login: profile.login, scopeCount: scopes.length });
  } catch (cause) {
    entry.state = "unknown_error";
    entry.error = cause instanceof Error ? cause.message : "store-failed";
    log("device-flow-store-failed", {
      error: cause instanceof Error ? cause.message : String(cause),
    });
  }
};

const schedulePoll = (entry: DeviceFlowEntry): void => {
  if (entry.cancelToken.signal.aborted) return;
  if (
    entry.state === "success" ||
    entry.state === "expired_token" ||
    entry.state === "access_denied"
  ) {
    return;
  }
  const ms = entry.pollIntervalSeconds * 1000;
  entry.pollTimer = setTimeout(() => {
    void runPoll(entry);
  }, ms);
};

const runPoll = async (entry: DeviceFlowEntry): Promise<void> => {
  if (entry.cancelToken.signal.aborted) {
    entry.state = "cancelled";
    return;
  }
  if (Date.now() > entry.expiresAt) {
    entry.state = "expired_token";
    return;
  }
  entry.state = "polling";
  entry.lastPolledAt = new Date().toISOString();
  const result = await callTokenEndpoint(entry);
  if (result.type === "pending") {
    if (result.slowDown) {
      entry.pollIntervalSeconds += SLOW_DOWN_BUMP_S;
    }
    entry.state = "polling";
    schedulePoll(entry);
    return;
  }
  if (result.type === "failure") {
    entry.state = result.state;
    entry.error = result.error;
    return;
  }
  await onDeviceFlowSuccess(entry, result);
};

// --- Public IPC entry points ---------------------------------------------

export const startDeviceFlow = async (input: {
  readonly scopes: ReadonlyArray<string>;
  readonly clientIdOverride?: string | null;
}): Promise<GitHubDeviceFlowStart> => {
  const clientId = resolveClientId(input.clientIdOverride);
  if (!clientId) {
    throw new Error("client-id-required");
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure storage is unavailable on this OS profile. Sign-in cannot persist.");
  }
  const scopeString = input.scopes.length > 0 ? input.scopes.join(" ") : "read:user";
  const body = new URLSearchParams({ client_id: clientId, scope: scopeString });
  const response = await fetch(DEVICE_CODE_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error(`device-code-http-${response.status}`);
  }
  const payload = (await response.json()) as Record<string, unknown>;
  const deviceCode = typeof payload.device_code === "string" ? payload.device_code : null;
  const userCode = typeof payload.user_code === "string" ? payload.user_code : null;
  const verificationUri =
    typeof payload.verification_uri === "string" ? payload.verification_uri : null;
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 900;
  const interval = typeof payload.interval === "number" ? payload.interval : 5;
  if (!deviceCode || !userCode || !verificationUri) {
    throw new Error("device-code-malformed");
  }
  const handle = Crypto.randomUUID();
  const entry: DeviceFlowEntry = {
    clientId,
    deviceCode,
    expiresAt: Date.now() + expiresIn * 1000,
    scopes: input.scopes,
    state: "awaiting_user",
    error: null,
    lastPolledAt: null,
    pollIntervalSeconds: interval,
    cancelToken: new AbortController(),
    pollTimer: null,
    bootstrapToken: null,
  };
  state.inFlight.set(handle, entry);
  schedulePoll(entry);
  log("device-flow-started", {
    handle,
    scopeCount: input.scopes.length,
    expiresIn,
    interval,
  });
  return {
    userCode,
    verificationUri,
    expiresIn,
    interval,
    deviceCodeHandle: handle,
  };
};

export const getClientConfig = (input?: {
  readonly clientIdOverride?: string | null;
}): GitHubDeviceFlowClientConfig => {
  const resolution = resolveClientIdWithSource(input?.clientIdOverride);
  return {
    configured: resolution.clientId !== null,
    source: resolution.source,
  };
};

export const getDeviceFlowStatus = (input: {
  readonly deviceCodeHandle: string;
}): GitHubDeviceFlowStatus => {
  const entry = state.inFlight.get(input.deviceCodeHandle);
  if (!entry) {
    return { state: "unknown_error", error: "unknown-handle", lastPolledAt: null };
  }
  return {
    state: entry.state,
    error: entry.error,
    lastPolledAt: entry.lastPolledAt,
  };
};

export const consumeDeviceFlowToken = (input: {
  readonly deviceCodeHandle: string;
}): GitHubTokenBundle => {
  const entry = state.inFlight.get(input.deviceCodeHandle);
  if (!entry) {
    throw new Error("unknown-handle");
  }
  if (entry.state !== "success" || entry.bootstrapToken === null) {
    throw new Error("device-flow-token-unavailable");
  }
  const token = entry.bootstrapToken;
  entry.bootstrapToken = null;
  state.inFlight.delete(input.deviceCodeHandle);
  return token;
};

export const cancelDeviceFlow = (input: { readonly deviceCodeHandle: string }): void => {
  const entry = state.inFlight.get(input.deviceCodeHandle);
  if (!entry) return;
  entry.cancelToken.abort();
  if (entry.pollTimer) {
    clearTimeout(entry.pollTimer);
    entry.pollTimer = null;
  }
  entry.state = "cancelled";
  state.inFlight.delete(input.deviceCodeHandle);
};

export const getStatus = async (): Promise<GitHubAuthStatus> => {
  if (state.cachedStatus) return state.cachedStatus.status;
  return refreshCachedStatus();
};

export const validateToken = async (): Promise<GitHubTokenValidation> => {
  const blob = await readTokenIfPresent();
  if (!blob) return { valid: false, login: null, scopes: [] };
  // Debounce repeated validations within 60 s.
  if (Date.now() - state.lastValidationAt < VALIDATION_DEBOUNCE_MS) {
    return { valid: true, login: blob.login, scopes: blob.scopes };
  }
  let response: Response;
  try {
    response = await fetch(USER_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${blob.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "V3Code-Desktop",
      },
    });
  } catch {
    return { valid: false, login: blob.login, scopes: blob.scopes };
  }
  if (!response.ok) {
    return { valid: false, login: blob.login, scopes: blob.scopes };
  }
  state.lastValidationAt = Date.now();
  const headerScopes = parseScopeString(response.headers.get("X-OAuth-Scopes"));
  return {
    valid: true,
    login: blob.login,
    scopes: headerScopes.length > 0 ? headerScopes : blob.scopes,
  };
};

export const disconnect = async (): Promise<{ readonly localCleared: boolean }> => {
  await clearTokenFile();
  state.cachedStatus = null;
  state.lastValidationAt = 0;
  await refreshCachedStatus();
  return { localCleared: true };
};

export const setClientIdOverride = (input: { clientId: string | null }): void => {
  state.rendererClientIdOverride =
    typeof input.clientId === "string" && input.clientId.trim().length > 0
      ? input.clientId.trim()
      : null;
};

export const manualRevokeUrl = (): string => MANUAL_REVOKE_URL;

// --- IPC registration -----------------------------------------------------

export const registerV3GitHubAuthIpc = (): void => {
  ipcMain.handle(V3_GITHUB_AUTH_CHANNELS.SET_CLIENT_ID_OVERRIDE, async (_event, raw: unknown) => {
    if (typeof raw !== "object" || raw === null) {
      throw new Error("setClientIdOverride requires { clientId }");
    }
    const clientId = (raw as { clientId?: unknown }).clientId;
    setClientIdOverride({
      clientId: typeof clientId === "string" || clientId === null ? clientId : null,
    });
  });
  ipcMain.handle(V3_GITHUB_AUTH_CHANNELS.GET_CLIENT_CONFIG, async (_event, raw: unknown) => {
    const clientIdOverride =
      typeof (raw as { clientIdOverride?: unknown } | null)?.clientIdOverride === "string"
        ? (raw as { clientIdOverride: string }).clientIdOverride
        : null;
    return getClientConfig({ clientIdOverride });
  });
  ipcMain.handle(V3_GITHUB_AUTH_CHANNELS.START_DEVICE_FLOW, async (_event, raw: unknown) => {
    const obj = (raw ?? {}) as { scopes?: unknown; clientIdOverride?: unknown };
    const scopes = Array.isArray(obj.scopes)
      ? obj.scopes.filter((value): value is string => typeof value === "string")
      : ["read:user"];
    const clientIdOverride = typeof obj.clientIdOverride === "string" ? obj.clientIdOverride : null;
    return startDeviceFlow({ scopes, clientIdOverride });
  });
  ipcMain.handle(V3_GITHUB_AUTH_CHANNELS.GET_DEVICE_FLOW_STATUS, async (_event, raw: unknown) => {
    const handle = (raw as { deviceCodeHandle?: unknown })?.deviceCodeHandle;
    if (typeof handle !== "string") throw new Error("deviceCodeHandle required");
    return getDeviceFlowStatus({ deviceCodeHandle: handle });
  });
  ipcMain.handle(
    V3_GITHUB_AUTH_CHANNELS.CONSUME_DEVICE_FLOW_TOKEN,
    async (_event, raw: unknown) => {
      const handle = (raw as { deviceCodeHandle?: unknown })?.deviceCodeHandle;
      if (typeof handle !== "string") throw new Error("deviceCodeHandle required");
      return consumeDeviceFlowToken({ deviceCodeHandle: handle });
    },
  );
  ipcMain.handle(V3_GITHUB_AUTH_CHANNELS.CANCEL_DEVICE_FLOW, async (_event, raw: unknown) => {
    const handle = (raw as { deviceCodeHandle?: unknown })?.deviceCodeHandle;
    if (typeof handle !== "string") throw new Error("deviceCodeHandle required");
    cancelDeviceFlow({ deviceCodeHandle: handle });
  });
  ipcMain.handle(V3_GITHUB_AUTH_CHANNELS.GET_STATUS, async () => getStatus());
  ipcMain.handle(V3_GITHUB_AUTH_CHANNELS.DISCONNECT, async () => disconnect());
  ipcMain.handle(V3_GITHUB_AUTH_CHANNELS.VALIDATE_TOKEN, async () => validateToken());
  ipcMain.handle(V3_GITHUB_AUTH_CHANNELS.MANUAL_REVOKE_URL, async () => manualRevokeUrl());
};

// Test hooks ---------------------------------------------------------------

export const __testing__: {
  readonly bootstrapState: () => GitHubAuthBootstrapState;
  readonly resetState: () => void;
  readonly setBuildTimeClientId: (id: string | null) => void;
} = {
  bootstrapState: () => state.cachedStatus?.status.bootstrapState ?? "skipped",
  resetState: () => {
    state.rendererClientIdOverride = null;
    state.inFlight.clear();
    state.cachedStatus = null;
    state.lastValidationAt = 0;
  },
  setBuildTimeClientId: (id) => {
    state.buildTimeClientId = id;
  },
};
