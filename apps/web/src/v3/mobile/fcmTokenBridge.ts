// V3 Phase 9 — connect the native FCM bridge to the mesh.
//
// The Capacitor shell exposes pending push registrations via
// `window.v3MobileRuntime.getPendingPushRegistration` and
// `onPushRegistrationRequested`. This module consumes those signals
// and invokes a caller-provided `publish` callback that fires the
// `mesh.registerPushToken` RPC.
//
// We keep the RPC-dispatch glue out of this module so the tests can
// drive it without a running WS connection. The real wiring happens
// at `apps/web/src/rpc/meshRpcClient.ts` in P4+ — once that file
// exists, it passes its RPC stub as `publish` and retains it across
// the lifetime of the authenticated session.

import type { MobilePushRegistration } from "./mobilePlatform.ts";
import { getMobileBridge } from "./mobilePlatform.ts";

export interface FcmTokenPublisher {
  readonly publish: (registration: MobilePushRegistration) => Promise<boolean>;
}

export interface FcmTokenBridgeHandle {
  /** Call to tear down listeners (e.g. on sign-out). */
  readonly dispose: () => void;
  /** Manually nudge a retry after recoverable errors. */
  readonly flushPending: () => Promise<boolean>;
}

export const attachFcmTokenBridge = (publisher: FcmTokenPublisher): FcmTokenBridgeHandle | null => {
  const bridge = getMobileBridge();
  if (bridge === null) {
    return null;
  }

  let disposed = false;
  const pushRegistration = async (registration: MobilePushRegistration): Promise<boolean> => {
    if (disposed) return false;
    try {
      const ok = await publisher.publish(registration);
      if (ok) {
        bridge.onPushTokenPublished();
      }
      return ok;
    } catch {
      return false;
    }
  };

  // `onPushRegistrationRequested` is expected to synchronously replay
  // any pending registration to the handler on subscribe (see
  // `apps/mobile/src/main.ts`). That gives us the cold-start flush for
  // free — no explicit `flushPending()` call on attach, which would
  // otherwise double-fire with the replay.
  const unsubscribe = bridge.onPushRegistrationRequested((registration) => {
    void pushRegistration(registration);
  });

  const flushPending = async (): Promise<boolean> => {
    const pending = bridge.getPendingPushRegistration();
    if (pending === null) return false;
    return pushRegistration(pending);
  };

  return {
    dispose: () => {
      disposed = true;
      unsubscribe();
    },
    flushPending,
  };
};
