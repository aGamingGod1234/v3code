// V3 Phase 9 — prefer Capacitor Preferences over localStorage inside
// the mobile shell.
//
// The web bundle reads device-id, Google tokens, and various UI
// preferences out of `window.localStorage`. On Android, the WebView's
// localStorage can be wiped when the system aggressively reclaims
// memory, which would burn the device-id (causing "new device,
// requires approval" every time). Capacitor Preferences is backed by
// SharedPreferences on Android + NSUserDefaults on iOS — stable
// across restarts and even OS updates.
//
// This module returns whichever storage surface the bundle should
// use:
//
//   * On Android / iOS shells → the bridge's Preferences-backed
//     storage (pre-hydrated, synchronous reads).
//   * Elsewhere → `window.localStorage` (may be null in SSR or if
//     the browser has storage disabled).
//
// Callers should check the return value before use — a missing
// storage surface means cache operations should be skipped.

import { getMobileBridge } from "./mobilePlatform.ts";

export const resolveClientStorage = (): Storage | null => {
  const bridge = getMobileBridge();
  if (bridge?.storage) {
    return bridge.storage;
  }
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};
