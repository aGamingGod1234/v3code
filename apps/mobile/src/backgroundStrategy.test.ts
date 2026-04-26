import { describe, expect, it } from "vitest";

import { decideBackgroundPolicy } from "./backgroundStrategy.ts";

const basePolicy = {
  lifecycle: "active" as const,
  activity: "idle" as const,
  pushReadiness: "registered" as const,
  networkReachable: true,
  batteryOptimised: false,
};

describe("decideBackgroundPolicy", () => {
  it("keeps WS open and hides foreground service when app is active and idle", () => {
    const decision = decideBackgroundPolicy(basePolicy);
    expect(decision).toEqual({
      websocket: "keep_open",
      foregroundService: "hide",
      fcmWakeRequired: false,
      notifyUser: null,
    });
  });

  it("shows foreground service when paused mid-stream", () => {
    const decision = decideBackgroundPolicy({
      ...basePolicy,
      lifecycle: "paused",
      activity: "streaming",
    });
    expect(decision.websocket).toBe("keep_open");
    expect(decision.foregroundService).toBe("show");
    expect(decision.fcmWakeRequired).toBe(false);
    expect(decision.notifyUser).toBe("streaming-in-progress");
  });

  it("allows WS close and relies on FCM when backgrounded and idle", () => {
    const decision = decideBackgroundPolicy({
      ...basePolicy,
      lifecycle: "backgrounded",
      activity: "idle",
    });
    expect(decision.websocket).toBe("allow_close");
    expect(decision.foregroundService).toBe("hide");
    expect(decision.fcmWakeRequired).toBe(true);
  });

  it("falls back to aggressive reconnect when backgrounded mid-stream without FCM", () => {
    const decision = decideBackgroundPolicy({
      ...basePolicy,
      lifecycle: "backgrounded",
      activity: "streaming",
      pushReadiness: "not_registered",
    });
    expect(decision.websocket).toBe("reconnect_aggressive");
    expect(decision.foregroundService).toBe("show");
    expect(decision.fcmWakeRequired).toBe(false);
  });

  it("warns the user when battery optimisation would block wake and FCM is absent", () => {
    const decision = decideBackgroundPolicy({
      ...basePolicy,
      lifecycle: "backgrounded",
      activity: "idle",
      pushReadiness: "not_registered",
      batteryOptimised: true,
    });
    expect(decision.notifyUser).toBe("battery-optimisation-blocks-wake");
    expect(decision.fcmWakeRequired).toBe(false);
  });

  it("surfaces fcm-unavailable notice when streaming backgrounded without push support", () => {
    const decision = decideBackgroundPolicy({
      ...basePolicy,
      lifecycle: "backgrounded",
      activity: "streaming",
      pushReadiness: "unsupported",
    });
    expect(decision.notifyUser).toBe("fcm-unavailable-streaming");
    expect(decision.foregroundService).toBe("show");
  });

  it("keeps WS open and stays quiet when the network is down", () => {
    const decision = decideBackgroundPolicy({
      ...basePolicy,
      lifecycle: "backgrounded",
      activity: "streaming",
      networkReachable: false,
    });
    expect(decision.websocket).toBe("allow_close");
    expect(decision.fcmWakeRequired).toBe(false);
    expect(decision.notifyUser).toBeNull();
  });

  it("surfaces device-approval notice when the user is active", () => {
    const decision = decideBackgroundPolicy({
      ...basePolicy,
      activity: "awaiting_approval",
    });
    expect(decision.notifyUser).toBe("device-approval-pending");
  });
});
