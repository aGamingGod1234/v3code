// V3 Google sign-in orchestrator (renderer-side).
//
// Coordinates the full flow:
//   1. Fetch the operator's GoogleClientPublicConfig from the local server.
//   2. Hand the OAuth client id to the desktop bridge, which drives the
//      external-browser PKCE dance and returns an `id_token`.
//   3. POST that id_token + this device's metadata to the V3 bootstrap
//      route. The server sets the session cookie on this origin and
//      returns user/device info.
//   4. Persist non-sensitive sign-in state for the UI to read.
//
// The Electron half lives in `apps/desktop/src/v3GoogleAuthFlow.ts` and is
// reached via `window.desktopBridge.openV3GoogleSignIn`. Browser-only
// support is deferred to P7 (web cloud mode) — it requires a
// server-hosted callback that performs the code-for-token exchange with a
// client secret, which P1d does not yet ship.

import { GoogleBootstrapResult, type DeviceCapability } from "@v3tools/contracts";
import { Schema } from "effect";

import { resolvePrimaryEnvironmentHttpUrl } from "../../environments/primary";
import { isElectron } from "../../env";
import { resolveDeviceId } from "./deviceId";
import { recordV3SignedIn, clearV3SignedIn, type V3SignInSnapshot } from "./signInState";

const APP_VERSION_FALLBACK = "0.0.1-dev";

interface GoogleConfigResponse {
  readonly available: boolean;
  readonly clientId: string | null;
}

export const fetchGoogleClientConfig = async (
  signal?: AbortSignal,
): Promise<GoogleConfigResponse> => {
  const response = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/auth/google/config"), {
    credentials: "include",
    signal,
  });
  if (!response.ok) {
    throw new Error(`google config request failed (status ${response.status})`);
  }
  return (await response.json()) as GoogleConfigResponse;
};

const resolvePlatform = (): "windows" | "macos" | "linux" | "android" | "ios" | "web" => {
  if (typeof window === "undefined") return "web";
  const platform = (
    (window.navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
      ?.platform ??
    window.navigator.platform ??
    ""
  ).toLowerCase();
  if (platform.includes("win")) return "windows";
  if (platform.includes("mac") || platform.includes("darwin")) return "macos";
  if (platform.includes("android")) return "android";
  if (platform.includes("iphone") || platform.includes("ipad") || platform.includes("ios")) {
    return "ios";
  }
  if (platform.includes("linux") || platform.includes("ubuntu")) return "linux";
  return "web";
};

const resolveDeviceName = (
  platform: ReturnType<typeof resolvePlatform>,
  fallback: string,
): string => {
  const branded = isElectron ? (window.desktopBridge?.getAppBranding?.() ?? null) : null;
  if (branded?.displayName) return `${branded.displayName} (${platform})`;
  return fallback;
};

const resolveCapabilities = (): readonly DeviceCapability[] =>
  isElectron ? ["execute", "claude_code", "codex", "terminal"] : ["view_only"];

export interface V3SignInResult {
  readonly snapshot: V3SignInSnapshot & { readonly email: string };
  readonly needsApproval: boolean;
}

export class V3SignInError extends Error {
  readonly code: V3SignInErrorCode;
  constructor(code: V3SignInErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = "V3SignInError";
  }
}

export type V3SignInErrorCode =
  | "not-configured"
  | "browser-not-supported"
  | "user-cancelled"
  | "bridge-unavailable"
  | "bootstrap-failed"
  | "network";

export const startV3GoogleSignIn = async (): Promise<V3SignInResult> => {
  const config = await fetchGoogleClientConfig().catch((cause) => {
    throw new V3SignInError("network", "Could not reach the V3 server.", { cause });
  });
  if (!config.available || config.clientId === null) {
    throw new V3SignInError(
      "not-configured",
      "Google sign-in is not configured on this V3 server.",
    );
  }

  const bridge = window.desktopBridge;
  if (!isElectron || bridge?.openV3GoogleSignIn === undefined) {
    throw new V3SignInError(
      "browser-not-supported",
      "Browser sign-in is not yet available — please use the V3 desktop app.",
    );
  }

  const deviceId = resolveDeviceId();
  const platform = resolvePlatform();
  const deviceName = resolveDeviceName(platform, "V3 Device");
  const kind = isElectron ? "desktop" : "browser";
  const capabilities = resolveCapabilities();

  const handoff = await bridge.openV3GoogleSignIn({ clientId: config.clientId }).catch((cause) => {
    const message = cause instanceof Error ? cause.message : String(cause);
    const code: V3SignInErrorCode = message.toLowerCase().includes("cancel")
      ? "user-cancelled"
      : "bridge-unavailable";
    throw new V3SignInError(code, message, { cause });
  });

  const bootstrapResponse = await fetch(
    resolvePrimaryEnvironmentHttpUrl("/api/auth/google/bootstrap"),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken: handoff.idToken,
        deviceId,
        deviceName,
        platform,
        kind,
        capabilities,
        appVersion: APP_VERSION_FALLBACK,
      }),
    },
  ).catch((cause) => {
    throw new V3SignInError("network", "Failed to call the V3 bootstrap route.", { cause });
  });

  if (!bootstrapResponse.ok) {
    const text = await bootstrapResponse.text().catch(() => "");
    throw new V3SignInError(
      "bootstrap-failed",
      `Bootstrap rejected (${bootstrapResponse.status}): ${text || "unknown error"}`,
    );
  }

  const decoded = Schema.decodeUnknownSync(GoogleBootstrapResult)(await bootstrapResponse.json());
  recordV3SignedIn({
    email: decoded.user.email,
    displayName: decoded.user.displayName,
    avatarUrl: decoded.user.avatarUrl,
    pendingApproval: decoded.needsApproval,
  });
  return {
    snapshot: {
      email: decoded.user.email,
      displayName: decoded.user.displayName,
      avatarUrl: decoded.user.avatarUrl,
      pendingApproval: decoded.needsApproval,
    },
    needsApproval: decoded.needsApproval,
  };
};

export const endV3GoogleSignInLocally = (): void => {
  // Local-only sign-out for P1d: clears the visible chrome but does not
  // revoke the server-side session. P3 will add a real /api/auth/session
  // delete that wipes the cookie too.
  clearV3SignedIn();
};
