// Device-code dialog. Reads cached state from main via getDeviceFlowStatus
// on a 1 s tick (no network from the renderer). Main process owns the polling
// cadence; this dialog only renders the user code, an "Open verification URL"
// button, live state text, and Cancel.

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2Icon, CopyIcon, ExternalLinkIcon, LoaderIcon } from "lucide-react";

import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../../components/ui/dialog";
import { toastManager } from "../../components/ui/toast";
import { cancelDeviceFlow, getDeviceFlowStatus, startDeviceFlow } from "../auth/githubBridge";
import type { GitHubDeviceFlowStart, GitHubDeviceFlowStatus } from "@v3tools/contracts";

const POLL_MS = 1000;

const STATE_MESSAGE: Record<GitHubDeviceFlowStatus["state"], string> = {
  awaiting_user: "Waiting for you to enter the code on github.com…",
  polling: "Checking with GitHub…",
  success: "Connected!",
  expired_token: "Code expired — try again.",
  access_denied: "GitHub access was denied.",
  incorrect_device_code: "Sign-in failed (incorrect device code).",
  incorrect_client_credentials: "Check your GitHub OAuth Client ID under Settings → Git.",
  unknown_error: "Sign-in failed.",
  cancelled: "Cancelled.",
};

const TERMINAL_STATES = new Set<GitHubDeviceFlowStatus["state"]>([
  "success",
  "expired_token",
  "access_denied",
  "incorrect_device_code",
  "incorrect_client_credentials",
  "unknown_error",
  "cancelled",
]);

interface GitHubDeviceCodeDialogProps {
  readonly open: boolean;
  readonly scopes: ReadonlyArray<string>;
  readonly clientIdOverride: string | null;
  readonly onOpenChange: (next: boolean) => void;
  readonly onSuccess: () => void;
}

export function GitHubDeviceCodeDialog({
  open,
  scopes,
  clientIdOverride,
  onOpenChange,
  onSuccess,
}: GitHubDeviceCodeDialogProps) {
  const [start, setStart] = useState<GitHubDeviceFlowStart | null>(null);
  const [status, setStatus] = useState<GitHubDeviceFlowStatus | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const handleRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    const handle = handleRef.current;
    handleRef.current = null;
    if (handle) {
      void cancelDeviceFlow(handle).catch(() => {});
    }
    setStart(null);
    setStatus(null);
    setStartError(null);
  }, []);

  useEffect(() => {
    if (!open) {
      cleanup();
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await startDeviceFlow({ scopes, clientIdOverride });
        if (cancelled) {
          await cancelDeviceFlow(result.deviceCodeHandle).catch(() => {});
          return;
        }
        handleRef.current = result.deviceCodeHandle;
        setStart(result);
      } catch (cause) {
        if (cancelled) return;
        const message = cause instanceof Error ? cause.message : String(cause);
        if (message === "client-id-required") {
          setStartError(
            "GitHub OAuth Client ID required. Configure under Settings → Git, or rebuild with V3CODE_GITHUB_PUBLIC_CLIENT_ID.",
          );
        } else {
          setStartError(message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, scopes, clientIdOverride, cleanup]);

  useEffect(() => {
    if (!open) return;
    const handle = handleRef.current;
    if (!handle) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (cancelled || !handleRef.current) return;
      try {
        const next = await getDeviceFlowStatus(handle);
        if (cancelled) return;
        setStatus(next);
        if (next.state === "success") {
          onSuccess();
          onOpenChange(false);
          return;
        }
        if (TERMINAL_STATES.has(next.state)) {
          return;
        }
        timer = setTimeout(() => void tick(), POLL_MS);
      } catch {
        timer = setTimeout(() => void tick(), POLL_MS * 4);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [open, start, onOpenChange, onSuccess]);

  const handleCopy = useCallback(async () => {
    if (!start) return;
    try {
      await navigator.clipboard.writeText(start.userCode);
      toastManager.add({ type: "success", title: "Copied", description: start.userCode });
    } catch {
      toastManager.add({
        type: "error",
        title: "Copy failed",
        description: "Couldn't write to clipboard.",
      });
    }
  }, [start]);

  const handleOpenVerification = useCallback(() => {
    if (!start) return;
    if (window.desktopBridge?.openExternal) {
      void window.desktopBridge.openExternal(start.verificationUri);
    } else {
      window.open(start.verificationUri, "_blank", "noopener");
    }
  }, [start]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connect GitHub</DialogTitle>
          <DialogDescription>
            GitHub will prompt you to enter the code below. We'll handle the rest in the background
            — you can close this dialog if you change your mind.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          {startError ? (
            <div className="rounded-md border border-error/40 bg-error/10 p-3 text-xs text-error-foreground">
              {startError}
            </div>
          ) : null}
          {start ? (
            <>
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Your code
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="font-mono text-2xl tracking-[0.3em] text-foreground">
                    {start.userCode}
                  </span>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => void handleCopy()}
                  >
                    <CopyIcon className="mr-1 size-3" /> Copy
                  </Button>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Button type="button" variant="default" onClick={handleOpenVerification}>
                  <ExternalLinkIcon className="mr-2 size-3.5" />
                  Open {new URL(start.verificationUri).host}
                </Button>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {status?.state === "success" ? (
                  <CheckCircle2Icon className="size-3.5 text-success" />
                ) : (
                  <LoaderIcon className="size-3.5 animate-spin" />
                )}
                <span>{STATE_MESSAGE[status?.state ?? "awaiting_user"]}</span>
              </div>
              {status?.error ? (
                <div className="text-[11px] text-muted-foreground">Detail: {status.error}</div>
              ) : null}
            </>
          ) : !startError ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <LoaderIcon className="size-3.5 animate-spin" />
              <span>Requesting device code…</span>
            </div>
          ) : null}
        </DialogPanel>
        <DialogFooter variant="bare">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {status?.state === "success" ? "Done" : "Cancel"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
