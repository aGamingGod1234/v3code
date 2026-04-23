import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { DeviceId, DevicePlatform, MeshRegisterPushTokenInput } from "@v3tools/contracts";

import { useDevices } from "../hooks/useDevices";
import { useServerMode } from "../hooks/useServerMode";
import { updateV3SignedIn, useV3SignInSnapshot } from "../v3/auth/signInState";
import { getPrimaryEnvironmentConnection } from "../environments/runtime";
import { toastManager } from "../components/ui/toast";
import { startGoogleTokenRefreshScheduler } from "../v3/auth/googleTokenRefreshScheduler";
import { attachFcmTokenBridge } from "../v3/mobile/fcmTokenBridge";
import type { MobilePushRegistration } from "../v3/mobile/mobilePlatform";
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

  // Spec §8.6 / Phase 9: register the Android device's FCM token with
  // the server whenever we have an authenticated session. Without this
  // the native side keeps minting tokens but they never leave the
  // device, so FCM push silently fails in production.
  useEffect(() => {
    if (signInSnapshot.email === null) {
      return;
    }

    const handle = attachFcmTokenBridge({
      publish: async (registration: MobilePushRegistration) => {
        try {
          const connection = getPrimaryEnvironmentConnection();
          // The schema types the payload strictly; `MobilePushRegistration`
          // is the same wire shape (native bridge already validates) so
          // we widen the types here rather than re-decoding.
          const input = {
            device_id: registration.device_id as DeviceId,
            platform: registration.platform as DevicePlatform,
            provider: registration.provider,
            token: registration.token,
            app_version: registration.app_version,
            issued_at: registration.issued_at,
          } as unknown as MeshRegisterPushTokenInput;
          await connection.client.mesh.registerPushToken(input);
          return true;
        } catch (error) {
          toastManager.add({
            type: "error",
            title: "Couldn't register push notifications",
            description:
              error instanceof Error
                ? error.message
                : "The server rejected the FCM token. Push notifications will not fire until the app reconnects.",
          });
          return false;
        }
      },
    });

    return () => {
      handle?.dispose();
    };
  }, [signInSnapshot.email]);

  // Spec §3.1: proactively refresh the Google ID token before expiry
  // so long-lived tabs don't drop to the sign-in dialog an hour in.
  // The scheduler is cheap to start/stop per session transition — one
  // setTimeout at a time, no polling — so gating it on `signInSnapshot.email`
  // is strictly correct.
  useEffect(() => {
    if (signInSnapshot.email === null) {
      return;
    }

    const scheduler = startGoogleTokenRefreshScheduler();
    return () => {
      scheduler.stop();
    };
  }, [signInSnapshot.email]);
}
