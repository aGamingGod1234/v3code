import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getMobileBridge,
  getMobilePlatform,
  getMobileRuntimeConfig,
  isMobileShell,
  resolveMobilePreferredWsOrigin,
} from "./mobilePlatform.ts";

const installBridge = (
  overrides: Partial<NonNullable<Window["v3MobileRuntime"]>> = {},
): NonNullable<Window["v3MobileRuntime"]> => {
  const bridge: NonNullable<Window["v3MobileRuntime"]> = {
    platform: "android",
    runtimeConfig: {
      schema_version: 1,
      server_url: "https://v3.example.com",
      app_version: "0.0.20",
      origin_hint: "https://v3.example.com",
      channel: "internal",
      built_at: "2026-04-22T10:00:00.000Z",
    },
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
    onPushRegistrationRequested: () => () => undefined,
    onPushTokenPublished: () => undefined,
    getPendingPushRegistration: () => null,
    onIncomingNotification: () => () => undefined,
    ...overrides,
  };
  vi.stubGlobal("window", { v3MobileRuntime: bridge });
  return bridge;
};

describe("mobilePlatform detection", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false / web when no bridge is installed", () => {
    vi.stubGlobal("window", {});
    expect(isMobileShell()).toBe(false);
    expect(getMobilePlatform()).toBe("web");
    expect(getMobileRuntimeConfig()).toBeNull();
    expect(getMobileBridge()).toBeNull();
    expect(resolveMobilePreferredWsOrigin()).toBeNull();
  });

  it("detects the Android bridge", () => {
    installBridge({ platform: "android" });
    expect(isMobileShell()).toBe(true);
    expect(getMobilePlatform()).toBe("android");
    expect(getMobileRuntimeConfig()?.server_url).toBe("https://v3.example.com");
    expect(resolveMobilePreferredWsOrigin()).toBe("https://v3.example.com");
  });

  it("treats a non-native bridge (platform=web) as browser", () => {
    installBridge({ platform: "web" });
    expect(isMobileShell()).toBe(false);
  });

  it("returns null origin when runtime config has no server_url", () => {
    installBridge({
      runtimeConfig: {
        schema_version: 1,
        server_url: null,
        app_version: "0.0.20",
        origin_hint: null,
        channel: "internal",
        built_at: "2026-04-22T10:00:00.000Z",
      },
    });
    expect(resolveMobilePreferredWsOrigin()).toBeNull();
  });
});
