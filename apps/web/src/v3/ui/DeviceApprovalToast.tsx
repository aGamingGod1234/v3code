// Surfaces the `needsApproval` flag returned from a successful V3 Google
// sign-in (apps/server/src/identity/Services/DeviceApprovalService.ts).
// First device on a fresh server self-approves; subsequent new devices
// land in pending state until an existing signed-in device approves
// them. The approve/reject UI now lives in Settings > Devices.

import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";

import { toastManager } from "../../components/ui/toast";
import { useV3SignInSnapshot } from "../auth/signInState";

export function V3DeviceApprovalToast(): null {
  const navigate = useNavigate();
  const snapshot = useV3SignInSnapshot();
  const firedRef = useRef(false);

  useEffect(() => {
    if (snapshot.email === null) {
      firedRef.current = false;
      return;
    }
    if (!snapshot.pendingApproval) return;
    if (firedRef.current) return;
    firedRef.current = true;
    toastManager.add({
      type: "warning",
      title: "Device awaiting approval",
      description:
        "Sign in with V3 on an already-approved device and approve this one to start syncing.",
      actionProps: {
        children: "Open devices",
        onClick: () => {
          void navigate({ to: "/settings/devices" });
        },
      },
    });
  }, [navigate, snapshot.email, snapshot.pendingApproval]);

  return null;
}
