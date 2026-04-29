import { createFileRoute, redirect } from "@tanstack/react-router";
import { ChromeIcon, LoaderIcon, ShieldCheckIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { APP_DISPLAY_NAME } from "../branding";
import { Button } from "../components/ui/button";
import {
  fetchGoogleClientConfig,
  startV3GoogleSignInBrowser,
  V3SignInError,
} from "../v3/auth/googleSignIn";

export const Route = createFileRoute("/login")({
  beforeLoad: ({ context }) => {
    if (context.authGateState.status === "authenticated") {
      throw redirect({ to: "/", replace: true });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchGoogleClientConfig(controller.signal)
      .then((config) => setAvailable(config.available))
      .catch((cause) => {
        setAvailable(false);
        setError(cause instanceof Error ? cause.message : "Could not load Google OAuth config.");
      });
    return () => controller.abort();
  }, []);

  const startSignIn = async () => {
    if (busy || available === false) return;
    setBusy(true);
    setError(null);
    try {
      await startV3GoogleSignInBrowser();
    } catch (cause) {
      if (cause instanceof V3SignInError && cause.code === "bridge-unavailable") {
        setError(cause.message);
      } else if (!(cause instanceof V3SignInError && cause.code === "user-cancelled")) {
        setError(cause instanceof Error ? cause.message : "Could not start Google sign-in.");
      }
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8 text-foreground">
      <section className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-lg/10 sm:p-7">
        <div className="mb-5 flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-md bg-primary/12 text-primary">
            <ShieldCheckIcon className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">{APP_DISPLAY_NAME}</h1>
            <p className="text-xs text-muted-foreground">Sign in to control your V3 server node.</p>
          </div>
        </div>

        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            Use the Google account configured for this server. After sign-in, this browser appears
            as a device and can view or control chats hosted on the server node.
          </p>
          <p className="text-xs">
            OAuth redirects through{" "}
            <code className="rounded bg-muted px-1 py-0.5">/api/auth/google/authorize</code> and
            returns to this site after Google approves the session.
          </p>
        </div>

        {error ? (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        <Button
          type="button"
          className="mt-5 w-full gap-2"
          disabled={busy || available === false || available === null}
          onClick={startSignIn}
        >
          {busy || available === null ? (
            <LoaderIcon className="size-4 animate-spin" />
          ) : (
            <ChromeIcon className="size-4" />
          )}
          {available === false
            ? "Google OAuth not configured"
            : busy
              ? "Opening Google..."
              : "Sign in with Google"}
        </Button>
      </section>
    </main>
  );
}
