// Surfaces the `needsApproval` flag returned from a successful V3 Google
// sign-in (apps/server/src/identity/Services/DeviceApprovalService.ts).
// First device on a fresh server self-approves; subsequent new devices
// land in pending state until an existing signed-in device approves
// them. P1d ships only the read-side surface — the approve/reject UI
// itself lands in P3 (Settings → Devices).
//
// Mounted at the layout root so it can render after a successful sign-in
// regardless of the active route. State is sourced from the shared
// sign-in snapshot so it survives a refresh (the toast disappears once
// the device is approved server-side and the snapshot updates — that WS
// push hookup lands in P3 / P4).

import { useEffect, useRef } from "react";

import { toastManager } from "../../components/ui/toast";
import { useV3SignInSnapshot } from "../auth/signInState";

export function V3DeviceApprovalToast(): null {
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
    });
  }, [snapshot.email, snapshot.pendingApproval]);

  return null;
}
