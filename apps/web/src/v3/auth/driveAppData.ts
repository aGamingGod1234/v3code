// V3 Drive App Data snapshot helper (renderer-side).
//
// After a successful Google sign-in bootstrap, this module reads the
// `v3_config.json` blob from the user's Drive appDataFolder, captures a
// non-sensitive snapshot into `localStorage.v3.drive-app-data-snapshot`,
// and (only when the blob already advertises a server URL) appends this
// device to the shared device list.
//
// Why localStorage: P3 will render a "Multiple devices detected,
// configure your server" banner sourced from this snapshot. Keeping the
// snapshot client-side means the banner renders without a Drive
// round-trip on every page load. The server never sees Drive tokens or
// blob contents.
//
// Per Lucas's P2c answer (Q2c-2): Drive failures — including quota
// exhaustion — log and continue. Sign-in itself must not fail because of
// a Drive hiccup. The snapshot preserves the last good state and tags
// the `error` so future sign-in attempts (and P3 UI) can detect it.

import {
  createV3DriveAppDataClient,
  type V3DriveConfig,
  V3DriveClientError,
  type DriveDeviceEntry,
  type V3DriveAppDataClient,
  type V3DriveClientErrorReason,
} from "@v3tools/client-runtime";
import { clearPendingDrivePublish, readPendingDrivePublish } from "./drivePublishState";
import { getFreshGoogleAccessToken } from "./googleTokenStore";

const DRIVE_SNAPSHOT_KEY = "v3.drive-app-data-snapshot";

export interface V3DriveAppDataSnapshot {
  readonly serverUrl: string | null;
  readonly devices: ReadonlyArray<DriveDeviceEntry>;
  // True when we successfully read a blob from Drive. False means either
  // the blob didn't exist yet or the read failed (see `error`).
  readonly blobExists: boolean;
  readonly capturedAt: string;
  // `null` on a clean read; otherwise the discriminated reason from the
  // Drive client. Never re-exported as a thrown error — sign-in always
  // succeeds regardless of Drive state.
  readonly error: V3DriveClientErrorReason | null;
}

interface CaptureInput {
  readonly accessToken?: string;
  readonly thisDevice: DriveDeviceEntry;
  readonly client?: V3DriveAppDataClient;
  readonly now?: () => Date;
  readonly logger?: Pick<Console, "warn">;
}

const emptySnapshot = (capturedAt: string): V3DriveAppDataSnapshot => ({
  serverUrl: null,
  devices: [],
  blobExists: false,
  capturedAt,
  error: null,
});

const snapshotWithError = (
  capturedAt: string,
  error: V3DriveClientErrorReason,
): V3DriveAppDataSnapshot => {
  const previous = readSnapshot();
  if (!previous) {
    return {
      ...emptySnapshot(capturedAt),
      error,
    };
  }
  return {
    ...previous,
    capturedAt,
    error,
  };
};

// Cached snapshot reference. `getV3DriveAppDataSnapshot` is called by
// React's `useSyncExternalStore` on every render to compare against the
// previous value via Object.is. If we returned a fresh `JSON.parse(...)`
// each time, the reference would always differ and useSyncExternalStore
// would schedule a re-render every frame — infinite loop (React error
// #185). Cache the parsed value and only invalidate when
// writeSnapshot/clearSnapshot/storage-event fires.
let cachedDriveSnapshot: V3DriveAppDataSnapshot | null = null;
let cachedDriveSnapshotInitialized = false;

const parseSnapshot = (): V3DriveAppDataSnapshot | null => {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(DRIVE_SNAPSHOT_KEY);
  } catch {
    return null;
  }
  if (raw === null || raw.length === 0) return null;
  try {
    return JSON.parse(raw) as V3DriveAppDataSnapshot;
  } catch {
    return null;
  }
};

const refreshCachedDriveSnapshot = (): void => {
  cachedDriveSnapshot = parseSnapshot();
  cachedDriveSnapshotInitialized = true;
};

const writeSnapshot = (snapshot: V3DriveAppDataSnapshot): void => {
  try {
    window.localStorage.setItem(DRIVE_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota/disabled storage: ignore. The next successful capture
    // rehydrates the key.
  }
  cachedDriveSnapshot = snapshot;
  cachedDriveSnapshotInitialized = true;
  notifyListeners();
};

const clearSnapshot = (): void => {
  try {
    window.localStorage.removeItem(DRIVE_SNAPSHOT_KEY);
  } catch {
    // ignore
  }
  cachedDriveSnapshot = null;
  cachedDriveSnapshotInitialized = true;
  notifyListeners();
};

// Kept for write paths (snapshotWithError) that need the current
// persisted value without using the cache — the cache may be out of
// date here because we're mid-update.
const readSnapshot = (): V3DriveAppDataSnapshot | null => parseSnapshot();

const listeners = new Set<() => void>();

const notifyListeners = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

const toSnapshot = (
  config: V3DriveConfig,
  input: {
    readonly capturedAt: string;
    readonly blobExists: boolean;
    readonly error: V3DriveClientErrorReason | null;
  },
): V3DriveAppDataSnapshot => ({
  serverUrl: config.v3_config.server_url ?? null,
  devices: config.v3_config.device_list,
  blobExists: input.blobExists,
  capturedAt: input.capturedAt,
  error: input.error,
});

const appendDeviceIfMissing = (
  config: V3DriveConfig,
  device: DriveDeviceEntry,
): { readonly config: V3DriveConfig; readonly changed: boolean } => {
  if (config.v3_config.device_list.some((entry) => entry.device_id === device.device_id)) {
    return { config, changed: false };
  }
  return {
    changed: true,
    config: {
      v3_config: {
        ...config.v3_config,
        device_list: [...config.v3_config.device_list, device],
      },
    },
  };
};

const applyPendingPublish = (
  config: V3DriveConfig,
  device: DriveDeviceEntry,
): {
  readonly config: V3DriveConfig;
  readonly changed: boolean;
  readonly consumedPublish: boolean;
} => {
  const withDevice = appendDeviceIfMissing(config, device);
  const pendingPublish = readPendingDrivePublish();
  if (!pendingPublish) {
    return {
      config: withDevice.config,
      changed: withDevice.changed,
      consumedPublish: false,
    };
  }

  return {
    changed:
      withDevice.changed ||
      withDevice.config.v3_config.server_url !== pendingPublish.server_url ||
      withDevice.config.v3_config.server_version_installed !==
        pendingPublish.server_version_installed ||
      withDevice.config.v3_config.setup_at !== pendingPublish.setup_at,
    consumedPublish: true,
    config: {
      v3_config: {
        ...withDevice.config.v3_config,
        ...(pendingPublish.server_url ? { server_url: pendingPublish.server_url } : {}),
        server_version_installed: pendingPublish.server_version_installed,
        setup_at: pendingPublish.setup_at,
      },
    },
  };
};

export const captureDriveAppDataSnapshot = async (
  input: CaptureInput,
): Promise<V3DriveAppDataSnapshot> => {
  const now = input.now ?? (() => new Date());
  const logger = input.logger ?? console;
  const client = input.client ?? createV3DriveAppDataClient();
  const capturedAt = now().toISOString();
  const accessToken = input.accessToken ?? (await getFreshGoogleAccessToken());
  if (!accessToken) {
    const snapshot = snapshotWithError(capturedAt, "unauthorized");
    writeSnapshot(snapshot);
    return snapshot;
  }

  let existing: V3DriveConfig;
  let blobExists = true;
  try {
    const observed = await client.read(accessToken);
    blobExists = observed !== null;
    existing = observed ?? (await client.readOrInit(accessToken));
  } catch (cause) {
    if (cause instanceof V3DriveClientError) {
      logger.warn(`[v3] Drive App Data read failed: ${cause.reason}`);
      const snapshot = snapshotWithError(capturedAt, cause.reason);
      writeSnapshot(snapshot);
      return snapshot;
    }
    throw cause;
  }

  const next = applyPendingPublish(existing, input.thisDevice);

  if (!next.changed) {
    const snapshot = toSnapshot(existing, { capturedAt, blobExists, error: null });
    writeSnapshot(snapshot);
    return snapshot;
  }

  try {
    await client.write(accessToken, next.config);
    if (next.consumedPublish) {
      clearPendingDrivePublish();
    }
    const snapshot = toSnapshot(next.config, { capturedAt, blobExists: true, error: null });
    writeSnapshot(snapshot);
    return snapshot;
  } catch (cause) {
    if (cause instanceof V3DriveClientError) {
      logger.warn(`[v3] Drive App Data write failed: ${cause.reason}`);
      const snapshot = toSnapshot(existing, {
        capturedAt,
        blobExists,
        error: cause.reason,
      });
      writeSnapshot(snapshot);
      return snapshot;
    }
    throw cause;
  }
};

export const getV3DriveAppDataSnapshot = (): V3DriveAppDataSnapshot | null => {
  if (!cachedDriveSnapshotInitialized) {
    refreshCachedDriveSnapshot();
  }
  return cachedDriveSnapshot;
};

export const subscribeV3DriveAppDataSnapshot = (listener: () => void): (() => void) => {
  if (listeners.size === 0 && typeof window !== "undefined") {
    // Keep the cache in sync with cross-tab localStorage mutations the
    // first time anyone starts listening.
    window.addEventListener("storage", handleStorageEvent);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", handleStorageEvent);
    }
  };
};

const handleStorageEvent = (event: StorageEvent): void => {
  if (event.key !== DRIVE_SNAPSHOT_KEY) return;
  refreshCachedDriveSnapshot();
  notifyListeners();
};

// Test seam.
export const __resetV3DriveAppDataSnapshotForTests = (): void => {
  clearSnapshot();
  cachedDriveSnapshot = null;
  cachedDriveSnapshotInitialized = false;
};
