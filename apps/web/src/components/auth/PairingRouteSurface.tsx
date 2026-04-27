import type { AuthSessionState } from "@v3tools/contracts";
import React, { startTransition, useEffect, useRef, useState, useCallback } from "react";

import { APP_DISPLAY_NAME } from "../../branding";
import {
  peekPairingTokenFromUrl,
  stripPairingTokenFromUrl,
  submitServerAuthCredential,
} from "../../environments/primary";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

export function PairingPendingSurface() {
  const slowState = useSlowOperationState({ slowAtMs: 5_000, stuckAtMs: 15_000 });
  const message =
    slowState === "stuck"
      ? "This is taking longer than usual. Reload the app, then check that the server is reachable from this device."
      : slowState === "slow"
        ? "Still validating — networks vary. Hang tight."
        : "Validating the pairing link and preparing your session.";
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(44rem_16rem_at_top,color-mix(in_srgb,var(--color-emerald-500)_14%,transparent),transparent)]" />
        <div className="absolute inset-y-0 left-0 w-72 bg-[radial-gradient(28rem_18rem_at_left,color-mix(in_srgb,var(--color-sky-500)_10%,transparent),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--background)_90%,var(--color-black))_0%,var(--background)_55%)]" />
      </div>

      <section className="relative w-full max-w-xl rounded-2xl border border-border/80 bg-card/90 p-6 shadow-2xl shadow-black/20 backdrop-blur-md sm:p-8">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          {APP_DISPLAY_NAME}
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          Pairing with this environment
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>
        {slowState === "stuck" ? (
          <div className="mt-5">
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              Reload app
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function useSlowOperationState({
  slowAtMs,
  stuckAtMs,
  active = true,
}: {
  readonly slowAtMs: number;
  readonly stuckAtMs: number;
  readonly active?: boolean;
}): "fresh" | "slow" | "stuck" {
  const [phase, setPhase] = useState<"fresh" | "slow" | "stuck">("fresh");
  useEffect(() => {
    if (!active) {
      setPhase("fresh");
      return;
    }
    setPhase("fresh");
    const slowTimer = window.setTimeout(() => setPhase("slow"), slowAtMs);
    const stuckTimer = window.setTimeout(() => setPhase("stuck"), stuckAtMs);
    return () => {
      window.clearTimeout(slowTimer);
      window.clearTimeout(stuckTimer);
    };
  }, [active, slowAtMs, stuckAtMs]);
  return phase;
}

const MAX_PAIRING_ATTEMPTS = 3;

export function PairingRouteSurface({
  auth,
  initialErrorMessage,
  onAuthenticated,
}: {
  auth: AuthSessionState["auth"];
  initialErrorMessage?: string;
  onAuthenticated: () => void;
}) {
  const autoPairTokenRef = useRef<string | null>(peekPairingTokenFromUrl());
  const [credential, setCredential] = useState(() => autoPairTokenRef.current ?? "");
  const [errorMessage, setErrorMessage] = useState(initialErrorMessage ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const autoSubmitAttemptedRef = useRef(false);
  const submitSlowState = useSlowOperationState({
    slowAtMs: 6_000,
    stuckAtMs: 15_000,
    active: isSubmitting,
  });
  const isPairingLockedOut = failedAttempts >= MAX_PAIRING_ATTEMPTS;

  const submitCredential = useCallback(
    async (nextCredential: string) => {
      setIsSubmitting(true);
      setErrorMessage("");

      const submitError = await submitServerAuthCredential(nextCredential).then(
        () => null,
        (error) => errorMessageFromUnknown(error),
      );

      setIsSubmitting(false);

      if (submitError) {
        setErrorMessage(submitError);
        setFailedAttempts((current) => current + 1);
        return;
      }

      setFailedAttempts(0);
      startTransition(() => {
        onAuthenticated();
      });
    },
    [onAuthenticated],
  );

  const handleSubmit = useCallback(
    async (event?: React.SubmitEvent<HTMLFormElement>) => {
      event?.preventDefault();
      if (isPairingLockedOut) {
        return;
      }
      await submitCredential(credential);
    },
    [isPairingLockedOut, submitCredential, credential],
  );

  const handleResetAttempts = useCallback(() => {
    setFailedAttempts(0);
    setErrorMessage("");
  }, []);

  useEffect(() => {
    const token = autoPairTokenRef.current;
    if (!token || autoSubmitAttemptedRef.current) {
      return;
    }

    autoSubmitAttemptedRef.current = true;
    stripPairingTokenFromUrl();
    void submitCredential(token);
  }, [submitCredential]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(44rem_16rem_at_top,color-mix(in_srgb,var(--color-emerald-500)_14%,transparent),transparent)]" />
        <div className="absolute inset-y-0 left-0 w-72 bg-[radial-gradient(28rem_18rem_at_left,color-mix(in_srgb,var(--color-sky-500)_10%,transparent),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--background)_90%,var(--color-black))_0%,var(--background)_55%)]" />
      </div>

      <section className="relative w-full max-w-xl rounded-2xl border border-border/80 bg-card/90 p-6 shadow-2xl shadow-black/20 backdrop-blur-md sm:p-8">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          {APP_DISPLAY_NAME}
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          Pair with this environment
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {describeAuthGate(auth.bootstrapMethods)}
        </p>

        <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="pairing-token">
              Pairing token
            </label>
            <Input
              id="pairing-token"
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              disabled={isSubmitting}
              nativeInput
              onChange={(event) => setCredential(event.currentTarget.value)}
              placeholder="Paste a one-time token or pairing secret"
              spellCheck={false}
              value={credential}
            />
          </div>

          {isPairingLockedOut ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/8 px-3 py-2 text-sm text-destructive"
            >
              Couldn't pair after {MAX_PAIRING_ATTEMPTS} attempts. Double-check the token (it may be
              expired) or the server URL, then try again.
            </div>
          ) : errorMessage ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/6 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}

          {isSubmitting && submitSlowState !== "fresh" ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
            >
              {submitSlowState === "stuck"
                ? "Still trying — the server isn't responding. The token may be expired or the server URL might be wrong. Try Reload app, then check Settings → Connections."
                : "Still pairing — networks vary. Hang tight."}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {isPairingLockedOut ? (
              <Button onClick={handleResetAttempts} size="sm" type="button">
                Try again
              </Button>
            ) : (
              <Button disabled={isSubmitting} size="sm" type="submit">
                {isSubmitting ? "Pairing..." : "Continue"}
              </Button>
            )}
            <Button
              disabled={isSubmitting}
              onClick={() => window.location.reload()}
              size="sm"
              variant="outline"
            >
              Reload app
            </Button>
          </div>
        </form>

        <div className="mt-6 rounded-lg border border-border/70 bg-background/55 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
          {describeSupportedMethods(auth.bootstrapMethods)}
        </div>
      </section>
    </div>
  );
}

function errorMessageFromUnknown(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Authentication failed.";
}

function describeAuthGate(bootstrapMethods: ReadonlyArray<string>): string {
  if (bootstrapMethods.includes("desktop-bootstrap")) {
    return "This environment expects a trusted pairing credential before the app can connect.";
  }

  return "Enter a pairing token to start a session with this environment.";
}

function describeSupportedMethods(bootstrapMethods: ReadonlyArray<string>): string {
  if (
    bootstrapMethods.includes("desktop-bootstrap") &&
    bootstrapMethods.includes("one-time-token")
  ) {
    return "Desktop-managed pairing and one-time pairing tokens are both accepted for this environment.";
  }

  if (bootstrapMethods.includes("desktop-bootstrap")) {
    return "This environment is desktop-managed. Open it from the desktop app or paste a bootstrap credential if one was issued explicitly.";
  }

  return "This environment accepts one-time pairing tokens. Pairing links can open this page directly, or you can paste the token here.";
}
