import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveClientStorage } from "./mobilePreferencesStorage.ts";

const makeStubStorage = (): Storage => ({
  length: 0,
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
});

describe("resolveClientStorage", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers the mobile bridge storage when present", () => {
    const bridgeStorage = makeStubStorage();
    vi.stubGlobal("window", {
      localStorage: makeStubStorage(),
      v3MobileRuntime: {
        platform: "android",
        runtimeConfig: null,
        storage: bridgeStorage,
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
      },
    });
    expect(resolveClientStorage()).toBe(bridgeStorage);
  });

  it("falls back to localStorage when there is no mobile bridge", () => {
    const local = makeStubStorage();
    vi.stubGlobal("window", { localStorage: local });
    expect(resolveClientStorage()).toBe(local);
  });

  it("returns null when no window surface is available", () => {
    vi.stubGlobal("window", undefined);
    expect(resolveClientStorage()).toBeNull();
  });
});
