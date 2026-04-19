import { useEffect } from "react";

import { useDevices } from "../hooks/useDevices";
import { useServerMode } from "../hooks/useServerMode";
import { useV3SignInSnapshot } from "../v3/auth/signInState";
import { setMeshDeviceSnapshot } from "./meshState";
import { setServerModeState, setUserSessionState } from "./serverState";

export function useMeshSubscriptions(): void {
  const serverMode = useServerMode();
  const signInSnapshot = useV3SignInSnapshot();
  const { currentDeviceId, devices, error, isPending } = useDevices();
  const errorMessage = error instanceof Error ? error.message : null;

  useEffect(() => {
    setServerModeState(serverMode);
  }, [serverMode]);

  useEffect(() => {
    setUserSessionState({
      signedIn: signInSnapshot.email !== null,
      email: signInSnapshot.email,
      displayName: signInSnapshot.displayName,
      avatarUrl: signInSnapshot.avatarUrl,
      pendingApproval: signInSnapshot.pendingApproval,
    });
  }, [
    signInSnapshot.avatarUrl,
    signInSnapshot.displayName,
    signInSnapshot.email,
    signInSnapshot.pendingApproval,
  ]);

  useEffect(() => {
    if (signInSnapshot.email === null) {
      setMeshDeviceSnapshot({
        currentDeviceId: null,
        devices: [],
        isPending: false,
        errorMessage: null,
      });
      return;
    }

    setMeshDeviceSnapshot({
      currentDeviceId,
      devices,
      isPending,
      errorMessage,
    });
  }, [currentDeviceId, devices, errorMessage, isPending, signInSnapshot.email]);
}
