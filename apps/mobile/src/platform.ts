// V3 Phase 9 — platform detection for the Capacitor / Android shell.
//
// The web bundle (`apps/web`) is compiled with `VITE_V3_CLOUD_MODE=1`
// and shipped unchanged inside the APK's `assets/public/`. At runtime
// the bundle needs to know three things before deciding which auth
// flow, storage backend, and reconnect strategy to use:
//
//   1. Is this a Capacitor-wrapped native app? (`IS_NATIVE`)
//   2. Which OS platform? (`NATIVE_PLATFORM`)
//   3. What runtime config was baked into the APK at build time?
//      (`MOBILE_RUNTIME_CONFIG`, loaded asynchronously)
//
// Detection is deliberately conservative: without the Capacitor
// runtime object (`window.Capacitor`) we treat the bundle as a normal
// browser, matching cloud-mode behaviour on desktop/laptop browsers.
//
// This module intentionally avoids importing `@capacitor/core` —
// doing so would require the web build to bundle the Capacitor runtime
// even when served from the server node. Instead we read `window.Capacitor`
// via `typeof window` guards; the Capacitor Android shell injects the
// object before any bundle code executes, same pattern as Electron's
// `window.nativeApi`.

export type NativePlatform = "android" | "ios" | "web";

export type MobileChannel = "internal" | "closed" | "open";

export interface MobileRuntimeConfig {
  readonly schema_version: 1;
  readonly server_url: string | null;
  readonly app_version: string | null;
  readonly channel: MobileChannel;
  readonly origin_hint: string | null;
  readonly built_at: string;
}

interface CapacitorGlobal {
  readonly isNativePlatform?: () => boolean;
  readonly getPlatform?: () => NativePlatform;
  readonly Plugins?: Record<string, unknown>;
}

declare global {
  interface Window {
    Capacitor?: CapacitorGlobal;
  }
}

const readCapacitor = (): CapacitorGlobal | null => {
  if (typeof window === "undefined") return null;
  return window.Capacitor ?? null;
};

const resolveIsNative = (): boolean => {
  const cap = readCapacitor();
  if (cap === null) return false;
  if (typeof cap.isNativePlatform === "function") {
    try {
      return cap.isNativePlatform();
    } catch {
      return false;
    }
  }
  return false;
};

const resolvePlatform = (): NativePlatform => {
  const cap = readCapacitor();
  if (cap === null) return "web";
  if (typeof cap.getPlatform === "function") {
    try {
      const platform = cap.getPlatform();
      if (platform === "android" || platform === "ios") return platform;
    } catch {
      /* fall through to web */
    }
  }
  return "web";
};

export const IS_NATIVE: boolean = resolveIsNative();
export const NATIVE_PLATFORM: NativePlatform = resolvePlatform();
export const IS_ANDROID: boolean = NATIVE_PLATFORM === "android";
export const IS_IOS: boolean = NATIVE_PLATFORM === "ios";

// Resolves the runtime config written by `scripts/build-webview-bundle.mjs`
// at APK-build time. Returns `null` when running in a browser (no
// bundled config file) or when the fetch fails; callers should fall
// back to the user-entered manual server URL in that case.
export const loadMobileRuntimeConfig = async (): Promise<MobileRuntimeConfig | null> => {
  if (!IS_NATIVE) return null;
  try {
    const response = await fetch("./v3-mobile-config.json", { cache: "no-cache" });
    if (!response.ok) return null;
    const raw = (await response.json()) as unknown;
    if (!isMobileRuntimeConfig(raw)) return null;
    return raw;
  } catch {
    return null;
  }
};

const isMobileRuntimeConfig = (value: unknown): value is MobileRuntimeConfig => {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.schema_version !== 1) return false;
  if (record.server_url !== null && typeof record.server_url !== "string") return false;
  if (record.app_version !== null && typeof record.app_version !== "string") return false;
  if (record.origin_hint !== null && typeof record.origin_hint !== "string") return false;
  if (typeof record.built_at !== "string") return false;
  if (record.channel !== "internal" && record.channel !== "closed" && record.channel !== "open") {
    return false;
  }
  return true;
};
