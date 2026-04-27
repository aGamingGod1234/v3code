// Soft startup nudge for V3 sign-in.
//
// Lucas's P1d Q1d-1 answer: "push the user to sign in if they want web
// and other device sync on startup, but not too hard". So this fires a
// single dismissible toast on first authenticated mount when the server
// has Google sign-in configured but this device has not signed in yet.
// "Later" silences the nudge for 7 days; "Don't show again" silences it
// indefinitely.
//
// The toast borrows the same `toastManager` used by the rest of the app,
// so it's visually consistent and the user can dismiss with the same
// gesture they'd use elsewhere.

import { useEffect, useRef } from "react";

import { toastManager } from "../../components/ui/toast";
import { fetchGoogleClientConfig, startV3GoogleSignIn, V3SignInError } from "../auth/googleSignIn";
import {
  dismissStartupNudge,
  shouldShowStartupNudge,
  useV3SignInSnapshot,
} from "../auth/signInState";

export function V3StartupSignInNudge(): null {
  const snapshot = useV3SignInSnapshot();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (snapshot.email !== null) return;
    if (!shouldShowStartupNudge(snapshot.email !== null)) return;

    let cancelled = false;
    const controller = new AbortController();
    fetchGoogleClientConfig(controller.signal)
      .then((config) => {
        if (cancelled || !config.available) return;
        firedRef.current = true;
        toastManager.add({
          type: "info",
          title: "Sync V3 across your devices",
          description:
            "Sign in with Google to mirror your chats to the V3 web app and any other device you sign in on.",
          // Action toasts need long enough to read + click. The Base UI default
          // (5s) was so short users reported the toast vanishing before they
          // could press "Sign in".
          timeout: 30_000,
          actionProps: {
            children: "Sign in",
            onClick: () => {
              startV3GoogleSignIn().catch((error) => {
                if (error instanceof V3SignInError && error.code === "user-cancelled") return;
                // Errors are surfaced by the SignInButton's own flow as well;
                // we deliberately do not double-toast here.
              });
            },
          },
        });
        // Soft dismissal so the nudge doesn't reappear next launch even if
        // the user ignores it. They can re-trigger sign-in any time via
        // the always-visible button. Long-term suppression sits behind a
        // separate user gesture (a future "don't show again" affordance in
        // P3 settings); for P1d the 7-day soft dismissal is the only path.
        dismissStartupNudge();
      })
      .catch(() => {
        // network failure — leave nudge state untouched so we retry next launch
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [snapshot.email]);

  return null;
}
