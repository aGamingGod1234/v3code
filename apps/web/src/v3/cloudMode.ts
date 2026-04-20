// V3 Phase 7 — cloud-mode utility hooks.
//
// Thin re-exports of `build-flags` so consumers import from a stable
// cloud-mode module rather than reaching into the root `build-flags.ts`.
// The module is intentionally small: the flag is static per bundle, so
// hook-style wrappers are just convenience. `useIsCloudMode` returns
// the same constant on every call — no subscription needed.

import { IS_CLOUD_MODE } from "../build-flags";

export const useIsCloudMode = (): boolean => IS_CLOUD_MODE;

/**
 * True when the current bundle is cloud-mode AND the browser is not
 * wrapped in Electron. Useful when a surface needs to choose between
 * "server-node hosted browser" and "desktop app" without caring about
 * legacy pairing flows.
 */
export const isCloudBrowser = (): boolean => {
  if (!IS_CLOUD_MODE) return false;
  if (typeof window === "undefined") return false;
  return (
    (window as unknown as { desktopBridge?: unknown; nativeApi?: unknown }).desktopBridge ===
      undefined &&
    (window as unknown as { desktopBridge?: unknown; nativeApi?: unknown }).nativeApi === undefined
  );
};
