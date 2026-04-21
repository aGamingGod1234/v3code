import { useMemo } from "react";

import { useV3DriveAppDataSnapshot } from "./useV3DriveAppDataSnapshot";
import { useV3SignInSnapshot } from "../v3/auth/signInState";
import { useDevices } from "./useDevices";
import { useServerMode } from "./useServerMode";

export function useAccountState() {
  const signInSnapshot = useV3SignInSnapshot();
  const driveSnapshot = useV3DriveAppDataSnapshot();
  const { currentDevice, currentDeviceId, devices, error, isPending, refetch } = useDevices();
  const serverMode = useServerMode();

  return useMemo(
    () => ({
      currentDevice,
      currentDeviceId,
      devices,
      displayName:
        signInSnapshot.email === null ? null : (signInSnapshot.displayName ?? signInSnapshot.email),
      driveSnapshot,
      email: signInSnapshot.email,
      error,
      isDeviceStatePending: isPending,
      isSignedIn: signInSnapshot.email !== null,
      pendingApproval: signInSnapshot.pendingApproval,
      refetchDevices: refetch,
      serverMode,
    }),
    [
      currentDevice,
      currentDeviceId,
      devices,
      driveSnapshot,
      error,
      isPending,
      refetch,
      serverMode,
      signInSnapshot.displayName,
      signInSnapshot.email,
      signInSnapshot.pendingApproval,
    ],
  );
}
