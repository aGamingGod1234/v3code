import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { attachFcmTokenBridge } from "./fcmTokenBridge.ts";
import type { MobilePushRegistration } from "./mobilePlatform.ts";

type MockBridge = NonNullable<Window["v3MobileRuntime"]>;

const REGISTRATION: MobilePushRegistration = {
  device_id: "device-123",
  platform: "android",
  provider: "fcm",
  token: "fcm-token-abc",
  app_version: "0.0.20",
  issued_at: "2026-04-22T10:00:00.000Z",
};

const installBridge = (
  overrides: Partial<MockBridge> = {},
): { bridge: MockBridge; published: MobilePushRegistration[] } => {
  const listeners = new Set<(r: MobilePushRegistration) => void>();
  let pending: MobilePushRegistration | null = null;
  const published: MobilePushRegistration[] = [];

  const bridge: MockBridge = {
    platform: "android",
    runtimeConfig: null,
    storage: null,
    getLifecycleState: () => "active",
    setChatActivity: () => undefined,
    subscribeBackgroundPolicy: () => () => undefined,
    getLatestBackgroundPolicy: () => ({
      websocket: "keep_open",
      foregroundService: "hide",
      fcmWakeRequired: false,
      notifyUser: null,
    }),
    onPushRegistrationRequested: (handler) => {
      listeners.add(handler);
      if (pending !== null) handler(pending);
      return () => listeners.delete(handler);
    },
    onPushTokenPublished: () => {
      pending = null;
    },
    getPendingPushRegistration: () => pending,
    onIncomingNotification: () => () => undefined,
    ...overrides,
  };
  // Helpers only this test uses — the underlying type hides them via
  // cast because the mock controls the push state.
  (bridge as unknown as { __setPending: (r: MobilePushRegistration) => void }).__setPending = (
    r,
  ) => {
    pending = r;
    for (const l of listeners) l(r);
  };
  vi.stubGlobal("window", { v3MobileRuntime: bridge });
  return { bridge, published };
};

describe("attachFcmTokenBridge", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null without a bridge", () => {
    vi.stubGlobal("window", {});
    const handle = attachFcmTokenBridge({ publish: async () => true });
    expect(handle).toBeNull();
  });

  it("replays the pre-existing pending registration on attach", async () => {
    const { bridge, published } = installBridge();
    (bridge as unknown as { __setPending: (r: MobilePushRegistration) => void }).__setPending(
      REGISTRATION,
    );
    const handle = attachFcmTokenBridge({
      publish: async (registration) => {
        published.push(registration);
        return true;
      },
    });
    // Subscribe-time replay pushes one registration; the explicit
    // flushPending() call afterwards should see the bridge's pending
    // cleared by `onPushTokenPublished` and be a no-op.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(published).toHaveLength(1);
    expect(published[0]?.token).toBe("fcm-token-abc");
    expect(bridge.getPendingPushRegistration()).toBeNull();
    await handle?.flushPending();
    expect(published).toHaveLength(1);
    handle?.dispose();
  });

  it("fires again when the bridge emits a fresh token after attach", async () => {
    const { bridge, published } = installBridge();
    const handle = attachFcmTokenBridge({
      publish: async (registration) => {
        published.push(registration);
        return true;
      },
    });
    (bridge as unknown as { __setPending: (r: MobilePushRegistration) => void }).__setPending(
      REGISTRATION,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(published.length).toBe(1);
    handle?.dispose();
  });

  it("ignores publish errors without crashing", async () => {
    const { bridge } = installBridge();
    (bridge as unknown as { __setPending: (r: MobilePushRegistration) => void }).__setPending(
      REGISTRATION,
    );
    const handle = attachFcmTokenBridge({
      publish: async () => {
        throw new Error("ws offline");
      },
    });
    await expect(handle?.flushPending()).resolves.toBe(false);
    handle?.dispose();
  });
});
