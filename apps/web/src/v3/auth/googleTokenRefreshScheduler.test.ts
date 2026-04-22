import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GoogleTokenBundle } from "@v3tools/contracts";

import { startGoogleTokenRefreshScheduler } from "./googleTokenRefreshScheduler";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

function bundleWithExpiry(expiresAtMs: number): GoogleTokenBundle {
  return {
    accessToken: "access",
    idToken: "id",
    refreshToken: "refresh",
    scope: "openid",
    tokenType: "Bearer",
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

describe("startGoogleTokenRefreshScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing when no tokens are persisted", async () => {
    const readTokens = vi.fn(async () => null);
    const refreshTokens = vi.fn(async () => null);
    const scheduler = startGoogleTokenRefreshScheduler({
      readTokens,
      refreshTokens,
      now: () => Date.now(),
    });
    await vi.runOnlyPendingTimersAsync();
    expect(refreshTokens).not.toHaveBeenCalled();
    scheduler.stop();
  });

  it("refreshes when the token is inside the proactive margin", async () => {
    const nowMs = Date.now();
    const initialBundle = bundleWithExpiry(nowMs + 2 * MINUTE);
    const freshBundle = bundleWithExpiry(nowMs + 60 * MINUTE);
    let currentBundle: GoogleTokenBundle = initialBundle;
    const readTokens = vi.fn(async () => currentBundle);
    const refreshTokens = vi.fn(async () => {
      currentBundle = freshBundle;
      return freshBundle;
    });
    const scheduler = startGoogleTokenRefreshScheduler({
      readTokens,
      refreshTokens,
      now: () => Date.now(),
    });
    await vi.runOnlyPendingTimersAsync();
    expect(refreshTokens).toHaveBeenCalled();
    scheduler.stop();
  });

  it("schedules the next tick close to the proactive margin when token is fresh", async () => {
    const nowMs = Date.now();
    const readTokens = vi.fn(async () => bundleWithExpiry(nowMs + 30 * MINUTE));
    const refreshTokens = vi.fn(async () => bundleWithExpiry(nowMs + 60 * MINUTE));
    const timerCalls: Array<number> = [];
    const scheduler = startGoogleTokenRefreshScheduler({
      readTokens,
      refreshTokens,
      now: () => Date.now(),
      setTimer: (_fn, ms) => {
        timerCalls.push(ms);
        return null;
      },
      clearTimer: () => undefined,
    });
    await vi.runOnlyPendingTimersAsync();
    expect(refreshTokens).not.toHaveBeenCalled();
    expect(timerCalls.length).toBeGreaterThan(0);
    // First scheduled delay should be ~25 min (30 min window - 5 min
    // proactive margin). Allow wide tolerance for floating timings.
    expect(timerCalls[0]).toBeGreaterThan(20 * MINUTE);
    expect(timerCalls[0]).toBeLessThan(30 * MINUTE);
    scheduler.stop();
  });

  it("stops cleanly", () => {
    const readTokens = vi.fn(async () => null);
    const scheduler = startGoogleTokenRefreshScheduler({
      readTokens,
      refreshTokens: async () => null,
      now: () => Date.now(),
    });
    scheduler.stop();
    // Re-calling stop should be a no-op, not throw.
    expect(() => scheduler.stop()).not.toThrow();
  });
});
