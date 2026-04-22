// V3 Phase 9 — Android background / foreground WebSocket strategy.
//
// Android 14+ aggressively evicts background WebSocket connections in
// non-foreground processes. The spec's expectation (§8.6) is that we
// keep a foreground-service notification up during live streaming, and
// fall back to FCM wake signals when the app is backgrounded and idle.
//
// This module is pure TypeScript logic — it does not mount the
// Android foreground service itself (that's done by the Capacitor
// plugin boot code in `android/app/src/main/java/...`). Instead it
// owns the *policy*: given the current app lifecycle state + whether
// a chat is actively streaming, decide whether the WS should be open,
// whether the foreground notification should be shown, and whether to
// rely on FCM for wake.
//
// The pure-function shape lets us unit-test the decision matrix
// without booting a real Android harness.

export type AppLifecycleState = "active" | "paused" | "backgrounded";

export type ChatActivityState = "idle" | "streaming" | "awaiting_approval";

export type PushReadiness = "unsupported" | "not_registered" | "registered";

export interface BackgroundPolicyInput {
  readonly lifecycle: AppLifecycleState;
  readonly activity: ChatActivityState;
  readonly pushReadiness: PushReadiness;
  readonly networkReachable: boolean;
  readonly batteryOptimised: boolean;
}

export interface BackgroundPolicyDecision {
  readonly websocket: "keep_open" | "allow_close" | "reconnect_aggressive";
  readonly foregroundService: "show" | "hide";
  readonly fcmWakeRequired: boolean;
  readonly notifyUser: string | null;
}

// Decision matrix (spec §8.6):
//
//   * `active` + streaming → keep WS open, do NOT show foreground
//     notification (user is literally looking at the app).
//   * `active` + idle → keep WS open, hide foreground notification.
//   * `paused` (screen off / app switcher visible) + streaming → keep
//     WS open + SHOW foreground notification so Android doesn't kill
//     us mid-turn. This is the "streaming notification" the spec calls
//     out.
//   * `paused` + idle → allow WS to close; we rely on FCM wake.
//   * `backgrounded` + streaming → same as paused + streaming, but if
//     we have no foreground service slot the turn will be killed; show
//     a reconnect-aggressive flag so the caller knows to retry hard.
//   * `backgrounded` + idle → allow WS close; FCM wake. If FCM isn't
//     registered, fall back to reconnect-aggressive on resume.
//   * `awaiting_approval` behaves like streaming but also surfaces a
//     user-facing notification.
//   * Battery-optimisation enabled + backgrounded → warn the user that
//     background wake is unreliable on this device.
//   * Network unreachable → always allow WS close; no wake policy
//     needed until network returns.
export const decideBackgroundPolicy = (input: BackgroundPolicyInput): BackgroundPolicyDecision => {
  const { lifecycle, activity, pushReadiness, networkReachable, batteryOptimised } = input;

  if (!networkReachable) {
    return {
      websocket: "allow_close",
      foregroundService: lifecycle === "paused" && activity === "streaming" ? "show" : "hide",
      fcmWakeRequired: false,
      notifyUser: null,
    };
  }

  const isImportantActivity = activity === "streaming" || activity === "awaiting_approval";
  const fcmUsable = pushReadiness === "registered";

  if (lifecycle === "active") {
    return {
      websocket: "keep_open",
      foregroundService: "hide",
      fcmWakeRequired: false,
      notifyUser: activity === "awaiting_approval" ? "device-approval-pending" : null,
    };
  }

  if (lifecycle === "paused") {
    if (isImportantActivity) {
      return {
        websocket: "keep_open",
        foregroundService: "show",
        fcmWakeRequired: !fcmUsable,
        notifyUser:
          activity === "awaiting_approval" ? "device-approval-pending" : "streaming-in-progress",
      };
    }
    return {
      websocket: "allow_close",
      foregroundService: "hide",
      fcmWakeRequired: fcmUsable,
      notifyUser: null,
    };
  }

  // backgrounded
  if (isImportantActivity) {
    return {
      websocket: fcmUsable ? "allow_close" : "reconnect_aggressive",
      foregroundService: "show",
      fcmWakeRequired: fcmUsable,
      notifyUser:
        pushReadiness === "unsupported"
          ? "fcm-unavailable-streaming"
          : activity === "awaiting_approval"
            ? "device-approval-pending"
            : "streaming-in-progress",
    };
  }

  return {
    websocket: "allow_close",
    foregroundService: "hide",
    fcmWakeRequired: fcmUsable,
    notifyUser: batteryOptimised && !fcmUsable ? "battery-optimisation-blocks-wake" : null,
  };
};

// Human-readable reason codes surfaced through `notifyUser` above.
// Kept as string literals (not i18n yet) so tests can assert the
// policy output stably; the actual Android notification text is
// resolved via `strings.xml` in the native shell.
export const BACKGROUND_NOTIFY_CODES = [
  "streaming-in-progress",
  "device-approval-pending",
  "fcm-unavailable-streaming",
  "battery-optimisation-blocks-wake",
] as const;
export type BackgroundNotifyCode = (typeof BACKGROUND_NOTIFY_CODES)[number];
