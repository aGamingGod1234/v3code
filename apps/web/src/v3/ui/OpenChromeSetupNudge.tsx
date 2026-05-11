import type {
  DesktopOpenChromeInstallResult,
  DesktopOpenChromeSetupStatus,
} from "@v3tools/contracts";
import { FolderOpenIcon, PlugZapIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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

const OPENCHROME_PROMPT_STORAGE_KEY = "v3.openchrome.first-boot-prompt.v1";
const IDLE_PROMPT_TIMEOUT_MS = 3_000;
const PROMPT_FALLBACK_DELAY_MS = 1_200;

type OpenChromeBridge = NonNullable<NonNullable<Window["desktopBridge"]>["openChrome"]>;

const getOpenChromeBridge = (): OpenChromeBridge | null => {
  if (typeof window === "undefined") return null;
  return window.desktopBridge?.openChrome ?? null;
};

const hasPromptBeenHandled = (): boolean => {
  try {
    return window.localStorage.getItem(OPENCHROME_PROMPT_STORAGE_KEY) !== null;
  } catch {
    return true;
  }
};

const markPromptHandled = (value: "accepted" | "dismissed" | "installed"): void => {
  try {
    window.localStorage.setItem(OPENCHROME_PROMPT_STORAGE_KEY, value);
  } catch {
    // Non-critical: failure only means the prompt may reappear next boot.
  }
};

const scheduleIdle = (callback: () => void): (() => void) => {
  const idleWindow = window as Window & {
    requestIdleCallback?: (cb: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(callback, { timeout: IDLE_PROMPT_TIMEOUT_MS });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const timeoutId = window.setTimeout(callback, PROMPT_FALLBACK_DELAY_MS);
  return () => window.clearTimeout(timeoutId);
};

const canOfferSetup = (status: DesktopOpenChromeSetupStatus): boolean =>
  status.installScriptExists || status.extensionManifestExists || status.serverEntryExists;

const summarizeStatus = (status: DesktopOpenChromeSetupStatus): string => {
  if (status.installed && status.bridgeReachable) return "Installed and reachable";
  if (status.installed) return "Installed, bridge offline";
  if (status.installable) return "Ready to install";
  return "OpenChrome files incomplete";
};

const summarizeInstallFailure = (result: DesktopOpenChromeInstallResult): string => {
  if (result.timedOut) return "The installer timed out before finishing.";
  const detail = result.stderr.trim() || result.stdout.trim();
  if (detail.length > 0) return detail.slice(0, 280);
  return `The installer exited with code ${result.exitCode ?? "unknown"}.`;
};

async function copyExtensionPath(path: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(path);
  } catch {
    // The setup dialog displays the path as a fallback when clipboard access is denied.
  }
}

export function OpenChromeSetupNudge() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<DesktopOpenChromeSetupStatus | null>(null);
  const [installing, setInstalling] = useState(false);
  const bridge = useMemo(() => getOpenChromeBridge(), []);

  useEffect(() => {
    if (!bridge || hasPromptBeenHandled()) return;

    let cancelled = false;
    const cancelIdle = scheduleIdle(() => {
      bridge
        .getStatus()
        .then((nextStatus) => {
          if (cancelled) return;
          if (nextStatus.installed && nextStatus.bridgeReachable) {
            markPromptHandled("installed");
            return;
          }
          if (!canOfferSetup(nextStatus)) return;
          setStatus(nextStatus);
          setOpen(true);
        })
        .catch(() => {
          // Leave prompt state untouched so a transient IPC failure can retry next boot.
        });
    });

    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [bridge]);

  if (!bridge || !status) return null;

  const handleDismiss = () => {
    markPromptHandled("dismissed");
    setOpen(false);
  };

  const handleEnable = async () => {
    setInstalling(true);
    try {
      const result = await bridge.install();
      setStatus(result.status);
      if (result.timedOut || result.exitCode !== 0) {
        toastManager.add({
          type: "error",
          title: "OpenChrome install failed",
          description: summarizeInstallFailure(result),
        });
        return;
      }

      await copyExtensionPath(result.status.extensionDir);
      await bridge.openExtensionSetup();
      markPromptHandled("accepted");
      setOpen(false);
      toastManager.add({
        type: "success",
        title: "OpenChrome bridge installed",
        description: "The extension folder path was copied and the browser setup page was opened.",
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "OpenChrome install failed",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setInstalling(false);
    }
  };

  const handleOpenSetup = async () => {
    try {
      await copyExtensionPath(status.extensionDir);
      await bridge.openExtensionSetup();
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "OpenChrome setup failed",
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) handleDismiss();
        else setOpen(true);
      }}
    >
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Enable browser automation?</DialogTitle>
          <DialogDescription>
            V3 can install the local OpenChrome MCP bridge and open the Chrome extension setup.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <div className="rounded-lg border border-border bg-card/50 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <PlugZapIcon className="size-4 text-primary" />
              {summarizeStatus(status)}
            </div>
            <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">MCP config</dt>
                <dd className="font-medium text-foreground">
                  {status.mcpConfigured ? "Configured" : "Missing"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Bridge</dt>
                <dd className="font-medium text-foreground">
                  {status.bridgeReachable ? "Online" : "Offline"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Extension</dt>
                <dd className="font-medium text-foreground">
                  {status.extensionManifestExists ? "Folder found" : "Folder missing"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Startup</dt>
                <dd className="font-medium text-foreground">
                  {status.startupLauncherExists ? "Enabled" : "Not enabled"}
                </dd>
              </div>
            </dl>
          </div>
          <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <FolderOpenIcon className="size-4 shrink-0" />
            <code className="min-w-0 truncate">{status.extensionDir}</code>
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" onClick={handleDismiss} disabled={installing}>
            Not now
          </Button>
          {status.extensionManifestExists ? (
            <Button variant="outline" onClick={handleOpenSetup} disabled={installing}>
              Open setup
            </Button>
          ) : null}
          <Button onClick={handleEnable} disabled={installing || !status.installScriptExists}>
            {installing ? "Installing..." : "Enable"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
