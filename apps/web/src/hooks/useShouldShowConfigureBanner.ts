import { useEffect, useMemo, useState } from "react";

import { type V3DriveAppDataSnapshot } from "../v3/auth/driveAppData";
import { useSettings, useUpdateSettings } from "./useSettings";
import { useV3DriveAppDataSnapshot } from "./useV3DriveAppDataSnapshot";
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
  readonly dismissedPermanently?: boolean;
  readonly now?: number;
}): boolean {
  if (!input.isSignedIn || input.driveSnapshot === null) {
    return false;
  }
  if (input.dismissedPermanently) {
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
  const driveSnapshot = useV3DriveAppDataSnapshot();
  const dismissedPermanently = useSettings(
    (settings) => settings.v3ConfigureServerBannerDismissedPermanently,
  );
  const { updateSettings } = useUpdateSettings();
  const [dismissedAt, setDismissedAt] = useState<number | null>(() => safeReadDismissedAt());

  const visible = useMemo(
    () =>
      shouldShowConfigureServerBanner({
        isSignedIn: signInSnapshot.email !== null,
        driveSnapshot,
        dismissedAt,
        dismissedPermanently,
      }),
    [dismissedAt, dismissedPermanently, driveSnapshot, signInSnapshot.email],
  );

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === CONFIGURE_SERVER_DISMISSED_AT_KEY) {
        setDismissedAt(safeReadDismissedAt());
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return {
    dismissedAt,
    dismissForNow: (now: number = Date.now()) => {
      safeWriteDismissedAt(now);
      setDismissedAt(now);
    },
    dismissPermanently: () => {
      updateSettings({ v3ConfigureServerBannerDismissedPermanently: true });
    },
    dismissedPermanently,
    driveSnapshot,
    visible,
  };
}
