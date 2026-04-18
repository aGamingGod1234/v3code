// V3 Google sign-in button.
//
// Lucas's P1d Q1d-1 answer: always-visible in the top-right corner; nudge
// the user toward sign-in for cross-device sync, but not aggressively. So
// this button is mounted in the root layout and shows one of three
// states:
//   - "signed in" — chip with the user's email + a quiet sign-out
//   - "configured + signed out" — primary "Sign in with Google" affordance
//   - "not configured" — disabled affordance with a tooltip explaining
//     the operator hasn't set V3CODE_GOOGLE_CLIENT_ID
//
// The full visual treatment lands in P3 (sidebar rewrite). This is the
// minimum surface that unblocks the auth flow.

import { useEffect, useState } from "react";
import { ChromeIcon, LogOutIcon } from "lucide-react";

import { Button } from "../../components/ui/button";
import { toastManager } from "../../components/ui/toast";
import { cn } from "../../lib/utils";
import {
  endV3GoogleSignInLocally,
  fetchGoogleClientConfig,
  startV3GoogleSignIn,
  V3SignInError,
} from "../auth/googleSignIn";
import { useV3SignInSnapshot } from "../auth/signInState";

interface SignInButtonProps {
  readonly className?: string;
}

export function V3SignInButton({ className }: SignInButtonProps): React.ReactElement {
  const snapshot = useV3SignInSnapshot();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchGoogleClientConfig(controller.signal)
      .then((config) => setAvailable(config.available))
      .catch(() => setAvailable(false));
    return () => controller.abort();
  }, []);

  if (snapshot.email !== null) {
    const label = snapshot.displayName ?? snapshot.email;
    return (
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-2 rounded-full border border-border/70 bg-background/85 px-2.5 py-1 text-xs text-foreground shadow-sm backdrop-blur",
          className,
        )}
      >
        <span
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary"
          aria-hidden
        >
          {label.slice(0, 1).toUpperCase()}
        </span>
        <span className="max-w-[160px] truncate font-medium">{label}</span>
        <button
          type="button"
          aria-label="Sign out of V3"
          title="Sign out (local only — server session stays active until P3 ships full sign-out)"
          onClick={() => endV3GoogleSignInLocally()}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <LogOutIcon className="size-3.5" />
        </button>
      </div>
    );
  }

  const disabled = available === false || busy;
  const onClick = async () => {
    if (disabled) return;
    setBusy(true);
    try {
      const result = await startV3GoogleSignIn();
      toastManager.add({
        type: "success",
        title: `Signed in as ${result.snapshot.email}`,
        description: result.needsApproval
          ? "Your device is pending approval from another signed-in V3 device."
          : "V3 multi-device sync is now linked to this device.",
      });
    } catch (error) {
      const messageBody =
        error instanceof V3SignInError ? error.message : "Could not complete sign-in.";
      const titleByCode: Record<string, string> = {
        "not-configured": "Google sign-in not configured",
        "browser-not-supported": "Use the desktop app to sign in",
        "user-cancelled": "Sign-in cancelled",
        "bridge-unavailable": "Could not reach desktop bridge",
        "bootstrap-failed": "V3 server rejected sign-in",
        network: "V3 server unreachable",
      };
      const title =
        error instanceof V3SignInError
          ? (titleByCode[error.code] ?? "Sign-in failed")
          : "Sign-in failed";
      toastManager.add({
        type: error instanceof V3SignInError && error.code === "user-cancelled" ? "info" : "error",
        title,
        description: messageBody,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={disabled}
      onClick={onClick}
      title={
        available === false
          ? "Sign-in is not available on this V3 server (V3CODE_GOOGLE_CLIENT_ID is not configured)."
          : "Sign in to sync chats across your devices and the V3 web app."
      }
      className={cn(
        "pointer-events-auto gap-2 rounded-full bg-background/85 px-3 py-1.5 text-xs font-medium shadow-sm backdrop-blur",
        className,
      )}
    >
      <ChromeIcon className="size-3.5" aria-hidden />
      <span>{busy ? "Signing in…" : "Sign in with Google"}</span>
    </Button>
  );
}
