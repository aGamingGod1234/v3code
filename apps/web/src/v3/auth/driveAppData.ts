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
  V3DriveClientError,
  type DriveDeviceEntry,
  type V3DriveAppDataClient,
  type V3DriveClientErrorReason,
} from "@v3tools/client-runtime";

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
  readonly accessToken: string;
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

const writeSnapshot = (snapshot: V3DriveAppDataSnapshot): void => {
  try {
    window.localStorage.setItem(DRIVE_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota/disabled storage: ignore. The next successful capture
    // rehydrates the key.
  }
};

const clearSnapshot = (): void => {
  try {
    window.localStorage.removeItem(DRIVE_SNAPSHOT_KEY);
  } catch {
    // ignore
  }
};

const readSnapshot = (): V3DriveAppDataSnapshot | null => {
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

export const captureDriveAppDataSnapshot = async (
  input: CaptureInput,
): Promise<V3DriveAppDataSnapshot> => {
  const now = input.now ?? (() => new Date());
  const logger = input.logger ?? console;
  const client = input.client ?? createV3DriveAppDataClient();
  const capturedAt = now().toISOString();

  let existing: Awaited<ReturnType<V3DriveAppDataClient["read"]>>;
  try {
    existing = await client.read(input.accessToken);
  } catch (cause) {
    if (cause instanceof V3DriveClientError) {
      logger.warn(`[v3] Drive App Data read failed: ${cause.reason}`);
      const snapshot: V3DriveAppDataSnapshot = {
        ...emptySnapshot(capturedAt),
        error: cause.reason,
      };
      writeSnapshot(snapshot);
      return snapshot;
    }
    throw cause;
  }

  if (existing === null) {
    const snapshot = emptySnapshot(capturedAt);
    writeSnapshot(snapshot);
    return snapshot;
  }

  const hasServerUrl =
    typeof existing.v3_config.server_url === "string" && existing.v3_config.server_url.length > 0;
  const alreadyListed = existing.v3_config.device_list.some(
    (device) => device.device_id === input.thisDevice.device_id,
  );

  // Per P2c ground rules: no writes in single-device mode (no server
  // URL = no mesh). Only append ourselves when a server node already
  // exists on this account.
  if (!hasServerUrl || alreadyListed) {
    const snapshot: V3DriveAppDataSnapshot = {
      serverUrl: existing.v3_config.server_url ?? null,
      devices: existing.v3_config.device_list,
      blobExists: true,
      capturedAt,
      error: null,
    };
    writeSnapshot(snapshot);
    return snapshot;
  }

  try {
    const updated = await client.appendDevice(input.accessToken, input.thisDevice);
    const snapshot: V3DriveAppDataSnapshot = {
      serverUrl: updated.v3_config.server_url ?? null,
      devices: updated.v3_config.device_list,
      blobExists: true,
      capturedAt,
      error: null,
    };
    writeSnapshot(snapshot);
    return snapshot;
  } catch (cause) {
    if (cause instanceof V3DriveClientError) {
      logger.warn(`[v3] Drive App Data append failed: ${cause.reason}`);
      const snapshot: V3DriveAppDataSnapshot = {
        serverUrl: existing.v3_config.server_url ?? null,
        devices: existing.v3_config.device_list,
        blobExists: true,
        capturedAt,
        error: cause.reason,
      };
      writeSnapshot(snapshot);
      return snapshot;
    }
    throw cause;
  }
};

export const getV3DriveAppDataSnapshot = (): V3DriveAppDataSnapshot | null => readSnapshot();

// Test seam.
export const __resetV3DriveAppDataSnapshotForTests = (): void => {
  clearSnapshot();
};
