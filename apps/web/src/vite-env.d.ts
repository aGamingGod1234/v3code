/// <reference types="vite/client" />

import type { DesktopBridge, LocalApi } from "@v3tools/contracts";

interface ImportMetaEnv {
  readonly APP_VERSION: string;
  /**
   * V3 Phase 7 build flag: when `"1"` the bundle is the cloud-mode
   * variant served by a V3 server node at `/app` (browser + Capacitor
   * mobile), and all code paths that require an Electron bridge, local
   * filesystem, terminal, or worktree must degrade gracefully.
   */
  readonly VITE_V3_CLOUD_MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    nativeApi?: LocalApi;
    desktopBridge?: DesktopBridge;
  }
}
