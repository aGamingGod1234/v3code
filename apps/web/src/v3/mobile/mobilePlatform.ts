// V3 Phase 9 — web-side bridge to the Capacitor Android runtime.
//
// The Android shell (`apps/mobile/src/main.ts`) boots before the React
// bundle and populates `window.v3MobileRuntime`. This module gives the
// web bundle a stable surface for:
//
//   * detecting that it's running inside the mobile shell (and which
//     platform specifically);
//   * reading the APK-baked server URL (the user can still override
//     via Settings → Server Node);
//   * reacting to background / foreground policy decisions emitted by
//     the native bridge.
//
// The module is defensive against the bridge being absent: on a
// regular browser it simply returns null / false, which matches the
// existing cloud-mode behaviour. No code here imports Capacitor
// directly — doing so would require the web bundle to ship the
// Capacitor runtime even when used from a desktop browser.

export type MobilePlatform = "android" | "ios" | "web";

export interface MobileBackgroundPolicy {
  readonly websocket: "keep_open" | "allow_close" | "reconnect_aggressive";
  readonly foregroundService: "show" | "hide";
  readonly fcmWakeRequired: boolean;
  readonly notifyUser: string | null;
}

export interface MobileRuntimeConfig {
  readonly schema_version: 1;
  readonly server_url: string | null;
  readonly app_version: string | null;
  readonly origin_hint: string | null;
  readonly channel: "internal" | "closed" | "open";
  readonly built_at: string;
}

export interface MobilePushRegistration {
  readonly device_id: string;
  readonly platform: MobilePlatform;
  readonly provider: "fcm" | "apns";
  readonly token: string;
  readonly app_version: string;
  readonly issued_at: string;
}

export interface MobileIncomingNotification {
  readonly category: "chat_response" | "device_approval_requested" | "container_killed" | "generic";
  readonly chat_id: string | null;
  readonly device_id: string | null;
  readonly title: string | null;
  readonly body: string | null;
  readonly received_at: string;
}

interface MobileRuntimeBridge {
  readonly platform: MobilePlatform;
  readonly runtimeConfig: MobileRuntimeConfig | null;
  readonly storage: Storage | null;
  readonly getLifecycleState: () => "active" | "paused" | "backgrounded";
  readonly setChatActivity: (activity: "idle" | "streaming" | "awaiting_approval") => void;
  readonly subscribeBackgroundPolicy: (
    handler: (decision: MobileBackgroundPolicy) => void,
  ) => () => void;
  readonly getLatestBackgroundPolicy: () => MobileBackgroundPolicy;
  readonly onPushRegistrationRequested: (
    handler: (registration: MobilePushRegistration) => void,
  ) => () => void;
  readonly onPushTokenPublished: () => void;
  readonly getPendingPushRegistration: () => MobilePushRegistration | null;
  readonly onIncomingNotification: (
    handler: (notification: MobileIncomingNotification) => void,
  ) => () => void;
}

declare global {
  interface Window {
    v3MobileRuntime?: MobileRuntimeBridge;
  }
}

const readBridge = (): MobileRuntimeBridge | null => {
  if (typeof window === "undefined") return null;
  return window.v3MobileRuntime ?? null;
};

export const getMobileBridge = readBridge;

export const isMobileShell = (): boolean => {
  const bridge = readBridge();
  if (bridge === null) return false;
  return bridge.platform === "android" || bridge.platform === "ios";
};

export const getMobilePlatform = (): MobilePlatform => {
  const bridge = readBridge();
  if (bridge === null) return "web";
  return bridge.platform;
};

export const getMobileRuntimeConfig = (): MobileRuntimeConfig | null => {
  const bridge = readBridge();
  return bridge?.runtimeConfig ?? null;
};

// Resolve the WebSocket origin the web bundle should prefer when
// bootstrapping the mesh client. Precedence:
//   1. An explicit build-time `VITE_WS_URL`.
//   2. The APK-baked `VITE_V3_MOBILE_SERVER_URL` (via runtimeConfig).
//   3. The user-entered manual URL in localStorage (`v3.server-url`).
//   4. Current window origin (cloud-mode default behaviour).
export const resolveMobilePreferredWsOrigin = (): string | null => {
  const bridge = readBridge();
  if (bridge === null) return null;
  if (bridge.runtimeConfig?.server_url !== null && bridge.runtimeConfig?.server_url !== undefined) {
    return bridge.runtimeConfig.server_url;
  }
  return null;
};
