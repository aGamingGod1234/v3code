import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __resetSignInStateForTests,
  clearV3SignedIn,
  dismissStartupNudge,
  dismissStartupNudgePermanently,
  getV3SignInSnapshot,
  recordV3SignedIn,
  shouldShowStartupNudge,
} from "./signInState";

const installFakeStorage = (): Map<string, string> => {
  const storage = new Map<string, string>();
  const remove = (key: string) => {
    storage.delete(key);
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: remove,
      },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  });
  return storage;
};

beforeEach(() => {
  installFakeStorage();
});

afterEach(() => {
  __resetSignInStateForTests();
  Reflect.deleteProperty(globalThis, "window");
});

describe("V3 sign-in snapshot", () => {
  it("starts signed-out", () => {
    const snapshot = getV3SignInSnapshot();
    expect(snapshot.email).toBeNull();
    expect(snapshot.pendingApproval).toBe(false);
  });

  it("recordV3SignedIn stores the email and approval flag", () => {
    recordV3SignedIn({
      email: "lucas@example.com",
      displayName: "Lucas",
      avatarUrl: null,
      pendingApproval: true,
    });
    const snapshot = getV3SignInSnapshot();
    expect(snapshot.email).toBe("lucas@example.com");
    expect(snapshot.displayName).toBe("Lucas");
    expect(snapshot.pendingApproval).toBe(true);
  });

  it("clearV3SignedIn returns the snapshot to signed-out", () => {
    recordV3SignedIn({
      email: "lucas@example.com",
      displayName: "Lucas",
      avatarUrl: null,
      pendingApproval: false,
    });
    clearV3SignedIn();
    expect(getV3SignInSnapshot().email).toBeNull();
  });
});

describe("shouldShowStartupNudge", () => {
  it("never shows when the user is signed in", () => {
    expect(shouldShowStartupNudge(true)).toBe(false);
  });

  it("shows on a fresh install (no dismissal recorded)", () => {
    expect(shouldShowStartupNudge(false)).toBe(true);
  });

  it("hides for 7 days after a soft dismissal", () => {
    const now = 1_700_000_000_000;
    dismissStartupNudge(now);
    // 6 days later — still hidden
    expect(shouldShowStartupNudge(false, now + 6 * 24 * 60 * 60 * 1000)).toBe(false);
  });

  it("returns 7+ days after a soft dismissal", () => {
    const now = 1_700_000_000_000;
    dismissStartupNudge(now);
    // 8 days later — back on
    expect(shouldShowStartupNudge(false, now + 8 * 24 * 60 * 60 * 1000)).toBe(true);
  });

  it("never shows after a permanent dismissal", () => {
    dismissStartupNudgePermanently();
    expect(shouldShowStartupNudge(false)).toBe(false);
    // even a year out
    expect(shouldShowStartupNudge(false, Date.now() + 365 * 24 * 60 * 60 * 1000)).toBe(false);
  });

  it("treats malformed dismissal entries as never dismissed", () => {
    window.localStorage.setItem("v3.startup-nudge.dismissed-at", "not-a-number");
    expect(shouldShowStartupNudge(false)).toBe(true);
  });
});
