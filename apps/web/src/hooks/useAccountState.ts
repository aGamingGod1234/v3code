import { useMemo } from "react";

import { getV3DriveAppDataSnapshot } from "../v3/auth/driveAppData";
import { useV3SignInSnapshot } from "../v3/auth/signInState";
import { useDevices } from "./useDevices";
import { useServerMode } from "./useServerMode";

export function useAccountState() {
  const signInSnapshot = useV3SignInSnapshot();
  const { currentDevice, currentDeviceId, devices, error, isPending, refetch } = useDevices();
  const serverMode = useServerMode();

  return useMemo(
    () => ({
      currentDevice,
      currentDeviceId,
      devices,
      displayName:
        signInSnapshot.email === null ? null : (signInSnapshot.displayName ?? signInSnapshot.email),
      driveSnapshot: getV3DriveAppDataSnapshot(),
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
