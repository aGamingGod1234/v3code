import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useDevices } from "../hooks/useDevices";
import { useServerMode } from "../hooks/useServerMode";
import { updateV3SignedIn, useV3SignInSnapshot } from "../v3/auth/signInState";
import { getPrimaryEnvironmentConnection } from "../environments/runtime";
import { toastManager } from "../components/ui/toast";
import { setMeshDeviceSnapshot } from "./meshState";
import { setServerModeState, setUserSessionState } from "./serverState";

export function useMeshSubscriptions(): void {
  const serverMode = useServerMode();
  const signInSnapshot = useV3SignInSnapshot();
  const { currentDeviceId, devices, error, isPending } = useDevices();
  const queryClient = useQueryClient();
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

  useEffect(() => {
    if (signInSnapshot.email === null) {
      return;
    }

    const unsubscribe = getPrimaryEnvironmentConnection().client.mesh.subscribeDeviceApprovals(
      (event) => {
        void queryClient.invalidateQueries({ queryKey: ["v3", "devices"] });

        const currentDevice = devices.find((device) => device.id === currentDeviceId) ?? null;
        if (event.type === "device-approved" && event.device.id === currentDeviceId) {
          updateV3SignedIn({ pendingApproval: false });
        }

        if (
          event.type === "device-registered" &&
          event.needsApproval &&
          currentDevice?.approved === true
        ) {
          toastManager.add({
            type: "info",
            title: "Device approval requested",
            description: `${event.device.name} is waiting for approval.`,
            actionProps: {
              children: "Review devices",
              onClick: () => {
                window.location.assign("/settings/devices");
              },
            },
          });
        }
      },
    );

    return () => {
      unsubscribe();
    };
  }, [currentDeviceId, devices, queryClient, signInSnapshot.email]);
}
