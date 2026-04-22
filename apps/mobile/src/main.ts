// V3 Phase 9 — Capacitor Android entrypoint.
//
// This module is loaded *before* the bundled web app boots. It runs
// inside the Android WebView, wires up:
//
//   1. A `window.v3MobileRuntime` handle the web bundle can consume to
//      learn the baked-in server URL, get the preferences storage,
//      enqueue FCM token registrations, and apply background / foreground
//      policy decisions.
//   2. Lifecycle listeners on `App`, `Network`, and
//      `FirebaseMessaging` that feed into the background strategy.
//   3. Firebase Messaging token retrieval + listener, staging tokens
//      for the web bundle to pick up once it's authenticated the user.
//
// The module never imports React or the web bundle directly — it
// stages data on a single globally-agreed namespace (`window.v3MobileRuntime`)
// so the web bundle can pick it up via `apps/web/src/v3/mobile/*` after
// it mounts.

import { App as CapacitorApp } from "@capacitor/app";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { Keyboard } from "@capacitor/keyboard";
import { Network } from "@capacitor/network";
import { Preferences } from "@capacitor/preferences";
import { StatusBar } from "@capacitor/status-bar";
import { SplashScreen } from "@capacitor/splash-screen";

import {
  decideBackgroundPolicy,
  type AppLifecycleState,
  type BackgroundPolicyDecision,
  type BackgroundPolicyInput,
  type ChatActivityState,
  type PushReadiness,
} from "./backgroundStrategy.ts";
import { createPreferencesStorage, type PreferencesStorage } from "./preferencesStorage.ts";
import {
  IS_NATIVE,
  NATIVE_PLATFORM,
  loadMobileRuntimeConfig,
  type MobileRuntimeConfig,
} from "./platform.ts";
import {
  makePushBridge,
  type IncomingPushNotification,
  type PushTokenRegistration,
} from "./pushTokens.ts";

export interface V3MobileRuntime {
  readonly ready: Promise<void>;
  readonly platform: typeof NATIVE_PLATFORM;
  readonly runtimeConfig: MobileRuntimeConfig | null;
  readonly storage: PreferencesStorage | null;
  readonly getLifecycleState: () => AppLifecycleState;
  readonly setChatActivity: (activity: ChatActivityState) => void;
  readonly subscribeBackgroundPolicy: (
    handler: (decision: BackgroundPolicyDecision) => void,
  ) => () => void;
  readonly getLatestBackgroundPolicy: () => BackgroundPolicyDecision;
  readonly getPendingPushRegistration: () => PushTokenRegistration | null;
  readonly onPushTokenPublished: () => void;
  readonly getBufferedNotifications: () => readonly IncomingPushNotification[];
  readonly consumeBufferedNotification: (index: number) => IncomingPushNotification | null;
  readonly onPushRegistrationRequested: (
    handler: (registration: PushTokenRegistration) => void,
  ) => () => void;
  readonly onIncomingNotification: (
    handler: (notification: IncomingPushNotification) => void,
  ) => () => void;
}

declare global {
  interface Window {
    v3MobileRuntime?: V3MobileRuntime;
  }
}

const DEFAULT_POLICY: BackgroundPolicyDecision = {
  websocket: "keep_open",
  foregroundService: "hide",
  fcmWakeRequired: false,
  notifyUser: null,
};

export const bootMobileRuntime = async (): Promise<V3MobileRuntime> => {
  const runtimeConfig = await loadMobileRuntimeConfig();
  const storage = IS_NATIVE ? createPreferencesStorage(Preferences) : null;

  let lifecycle: AppLifecycleState = "active";
  let activity: ChatActivityState = "idle";
  let pushReadiness: PushReadiness = IS_NATIVE ? "not_registered" : "unsupported";
  let networkReachable = true;
  let batteryOptimised = false;
  let latestPolicy: BackgroundPolicyDecision = DEFAULT_POLICY;
  const policyHandlers = new Set<(decision: BackgroundPolicyDecision) => void>();
  const notificationHandlers = new Set<(notification: IncomingPushNotification) => void>();
  const tokenHandlers = new Set<(registration: PushTokenRegistration) => void>();
  const bufferedNotifications: IncomingPushNotification[] = [];
  let pendingRegistration: PushTokenRegistration | null = null;

  const reevaluatePolicy = () => {
    const input: BackgroundPolicyInput = {
      lifecycle,
      activity,
      pushReadiness,
      networkReachable,
      batteryOptimised,
    };
    const next = decideBackgroundPolicy(input);
    latestPolicy = next;
    for (const handler of policyHandlers) {
      try {
        handler(next);
      } catch {
        // ignore UI layer exceptions
      }
    }
  };

  if (IS_NATIVE) {
    try {
      await StatusBar.setStyle({ style: "DARK" as never }).catch(() => undefined);
      await SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => undefined);
    } catch {
      /* non-fatal */
    }

    Keyboard.addListener("keyboardWillShow", () => {
      /* noop hook — web bundle adjusts scroll through CSS */
    }).catch(() => undefined);

    CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      lifecycle = isActive ? "active" : "backgrounded";
      reevaluatePolicy();
    }).catch(() => undefined);

    CapacitorApp.addListener("pause", () => {
      lifecycle = "paused";
      reevaluatePolicy();
    }).catch(() => undefined);

    CapacitorApp.addListener("resume", () => {
      lifecycle = "active";
      reevaluatePolicy();
    }).catch(() => undefined);

    Network.addListener("networkStatusChange", (status) => {
      networkReachable = status.connected;
      reevaluatePolicy();
    }).catch(() => undefined);

    try {
      const status = await Network.getStatus();
      networkReachable = status.connected;
    } catch {
      /* stay optimistic */
    }
  }

  const deviceIdCandidate = storage?.getItem("v3.device-id") ?? null;
  const bridgeAppVersion = runtimeConfig?.app_version ?? "0.0.20";
  const pushBridge = makePushBridge(
    {
      deviceId: (deviceIdCandidate ?? "00000000-0000-4000-8000-000000000000") as never,
      platform: NATIVE_PLATFORM,
      appVersion: bridgeAppVersion,
      now: () => new Date(),
    },
    {
      publishToken: (registration) => {
        pendingRegistration = registration;
        for (const handler of tokenHandlers) {
          try {
            handler(registration);
          } catch {
            /* swallow */
          }
        }
      },
      deliverNotification: (notification) => {
        if (notificationHandlers.size === 0) {
          bufferedNotifications.push(notification);
        } else {
          for (const handler of notificationHandlers) {
            try {
              handler(notification);
            } catch {
              /* swallow */
            }
          }
        }
      },
    },
  );

  if (IS_NATIVE) {
    try {
      const permission = await FirebaseMessaging.checkPermissions();
      if (permission.receive !== "granted") {
        await FirebaseMessaging.requestPermissions();
      }
      const { token } = await FirebaseMessaging.getToken();
      if (typeof token === "string" && token.length > 0) {
        await pushBridge.onTokenReceived(token, "fcm");
        pushReadiness = "registered";
      }
    } catch {
      pushReadiness = "not_registered";
    }

    FirebaseMessaging.addListener("tokenReceived", (event) => {
      void pushBridge.onTokenReceived(event.token, "fcm");
      pushReadiness = "registered";
      reevaluatePolicy();
    }).catch(() => undefined);

    FirebaseMessaging.addListener("notificationReceived", (event) => {
      const raw = event.notification.data;
      const data: Record<string, unknown> =
        raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      void pushBridge.onNotificationReceived({
        title: event.notification.title ?? null,
        body: event.notification.body ?? null,
        data,
      });
    }).catch(() => undefined);
  }

  reevaluatePolicy();

  const runtime: V3MobileRuntime = {
    ready: Promise.resolve(),
    platform: NATIVE_PLATFORM,
    runtimeConfig,
    storage,
    getLifecycleState: () => lifecycle,
    setChatActivity: (nextActivity) => {
      if (nextActivity !== activity) {
        activity = nextActivity;
        reevaluatePolicy();
      }
    },
    subscribeBackgroundPolicy: (handler) => {
      policyHandlers.add(handler);
      handler(latestPolicy);
      return () => {
        policyHandlers.delete(handler);
      };
    },
    getLatestBackgroundPolicy: () => latestPolicy,
    getPendingPushRegistration: () => pendingRegistration,
    onPushTokenPublished: () => {
      pendingRegistration = null;
    },
    getBufferedNotifications: () => bufferedNotifications.slice(),
    consumeBufferedNotification: (index) => {
      if (index < 0 || index >= bufferedNotifications.length) return null;
      const [consumed] = bufferedNotifications.splice(index, 1);
      return consumed ?? null;
    },
    onPushRegistrationRequested: (handler) => {
      tokenHandlers.add(handler);
      if (pendingRegistration !== null) {
        handler(pendingRegistration);
      }
      return () => {
        tokenHandlers.delete(handler);
      };
    },
    onIncomingNotification: (handler) => {
      notificationHandlers.add(handler);
      // flush buffered notifications on first subscribe
      while (bufferedNotifications.length > 0) {
        const next = bufferedNotifications.shift();
        if (next !== undefined) {
          try {
            handler(next);
          } catch {
            /* swallow */
          }
        }
      }
      return () => {
        notificationHandlers.delete(handler);
      };
    },
  };

  if (typeof window !== "undefined") {
    window.v3MobileRuntime = runtime;
  }
  return runtime;
};

if (typeof window !== "undefined") {
  void bootMobileRuntime();
}
