// V3 Phase 7 — cloud-mode sign-in bootstrap.
//
// Mounted once inside `__root.tsx`, this component consumes the
// post-callback cookies that `/api/auth/google/callback` drops on the
// way back to the browser:
//
//   * `v3_signin_snapshot` → non-sensitive user profile used to greet
//     the signed-in user on first paint (email / displayName / pending
//     approval). Seeded into `recordV3SignedIn` so the rest of the UI
//     picks it up from the same source of truth as desktop mode.
//   * `v3_drive_access_token` → one-time Drive App Data token used to
//     capture the cross-device server-URL snapshot (P2c). Cleared
//     after consumption; refresh is deferred to P7.1 if we need it.
//
// The hook is a no-op outside cloud mode so the legacy Electron +
// pairing flows are unaffected.

import { useEffect } from "react";

import { IS_CLOUD_MODE } from "../../build-flags";
import { resolveDeviceId } from "../auth/deviceId";
import { captureDriveAppDataSnapshot } from "../auth/driveAppData";
import { consumeBrowserDriveAccessToken, consumeBrowserSignInCookies } from "../auth/googleSignIn";

export function V3CloudSignInBootstrap(): null {
  useEffect(() => {
    if (!IS_CLOUD_MODE) return;
    const snapshot = consumeBrowserSignInCookies();
    if (!snapshot) return;
    const accessToken = consumeBrowserDriveAccessToken();
    if (accessToken === null) return;
    // Fire-and-forget Drive capture. Failures are swallowed inside
    // captureDriveAppDataSnapshot so a network hiccup doesn't block
    // the first paint of a freshly-signed-in user.
    captureDriveAppDataSnapshot({
      accessToken,
      thisDevice: {
        device_id: snapshot.deviceId || resolveDeviceId(),
        name: snapshot.displayName ?? snapshot.email,
        added_at: new Date().toISOString(),
      },
    }).catch(() => {
      /* swallowed */
    });
  }, []);
  return null;
}
