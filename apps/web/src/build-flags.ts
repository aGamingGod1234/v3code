// V3 Phase 7 — web build flags.
//
// The cloud-mode bundle is a variant of `apps/web` that is served by the
// V3 server node at `/app` and hosted on browsers / Capacitor mobile.
// It assumes **no local filesystem, no Electron bridge, no node-pty
// terminal**: every renderer path that touches those surfaces must branch
// on `IS_CLOUD_MODE` and either hide the UI entirely or route the work
// through the mesh to a device that *does* have execute capability.
//
// Toggle: set `VITE_V3_CLOUD_MODE=1` at `vite build` time (see
// `apps/web/package.json`'s `build:cloud` script and the
// `deploy/cloudflare-pages/` template).
//
// Guarantees:
//
//  - Evaluated exactly once, at module load, from a `define`-injected
//    constant so the bundler can dead-code-eliminate cloud-mode-only or
//    electron-only branches.
//  - Stable for the entire lifetime of a bundle: never read from
//    `localStorage` or runtime config — a single app build is either
//    cloud or electron, never both.

const rawCloudMode: string | undefined = import.meta.env.VITE_V3_CLOUD_MODE;

const normalizeBoolean = (value: string | undefined): boolean => {
  if (value === undefined) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

/**
 * True when this bundle is the V3 cloud-mode variant (`VITE_V3_CLOUD_MODE=1`).
 * False for the default bundle consumed by Electron shells, local dev, and
 * the pairing-web flow.
 */
export const IS_CLOUD_MODE: boolean = normalizeBoolean(rawCloudMode);

/**
 * Convenience negation used by host-device UI that only lights up when the
 * current bundle is the electron / pairing build.
 */
export const IS_HOST_CAPABLE_BUILD: boolean = !IS_CLOUD_MODE;

/**
 * Base path the cloud bundle is served under. The server-node mounts the
 * cloud bundle at `/app` so it can live alongside the legacy loopback
 * bundle at `/`. In dev (`vite dev`) we keep the root so existing
 * Electron + pairing flows work unchanged.
 */
export const CLOUD_MODE_BASE_PATH: string = IS_CLOUD_MODE ? "/app" : "/";
