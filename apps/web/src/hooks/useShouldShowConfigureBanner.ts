import { useEffect, useMemo, useState } from "react";

import { getV3DriveAppDataSnapshot, type V3DriveAppDataSnapshot } from "../v3/auth/driveAppData";
import { useV3SignInSnapshot } from "../v3/auth/signInState";

const CONFIGURE_SERVER_DISMISSED_AT_KEY = "v3.configure-server.dismissed-at";
const REVISIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function safeReadDismissedAt(): number | null {
  try {
    const raw = window.localStorage.getItem(CONFIGURE_SERVER_DISMISSED_AT_KEY);
    if (raw === null) {
      return null;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function safeWriteDismissedAt(value: number): void {
  try {
    window.localStorage.setItem(CONFIGURE_SERVER_DISMISSED_AT_KEY, String(value));
  } catch {
    // ignore
  }
}

export function shouldShowConfigureServerBanner(input: {
  readonly isSignedIn: boolean;
  readonly driveSnapshot: V3DriveAppDataSnapshot | null;
  readonly dismissedAt: number | null;
  readonly now?: number;
}): boolean {
  if (!input.isSignedIn || input.driveSnapshot === null) {
    return false;
  }
  if (input.driveSnapshot.serverUrl) {
    return false;
  }
  if (input.driveSnapshot.devices.length < 2) {
    return false;
  }

  if (input.dismissedAt === null) {
    return true;
  }

  const now = input.now ?? Date.now();
  return now - input.dismissedAt >= REVISIT_WINDOW_MS;
}

export function useShouldShowConfigureBanner() {
  const signInSnapshot = useV3SignInSnapshot();
  const [dismissedAt, setDismissedAt] = useState<number | null>(() => safeReadDismissedAt());
  const [driveSnapshot, setDriveSnapshot] = useState<V3DriveAppDataSnapshot | null>(() =>
    getV3DriveAppDataSnapshot(),
  );

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === CONFIGURE_SERVER_DISMISSED_AT_KEY) {
        setDismissedAt(safeReadDismissedAt());
      }
      if (event.key === "v3.drive-app-data-snapshot") {
        setDriveSnapshot(getV3DriveAppDataSnapshot());
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    setDriveSnapshot(getV3DriveAppDataSnapshot());
  }, [signInSnapshot.email]);

  const visible = useMemo(
    () =>
      shouldShowConfigureServerBanner({
        isSignedIn: signInSnapshot.email !== null,
        driveSnapshot,
        dismissedAt,
      }),
    [dismissedAt, driveSnapshot, signInSnapshot.email],
  );

  return {
    dismissedAt,
    dismiss: (now: number = Date.now()) => {
      safeWriteDismissedAt(now);
      setDismissedAt(now);
    },
    driveSnapshot,
    visible,
  };
}
