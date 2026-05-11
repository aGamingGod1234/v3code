import type {
  DesktopOpenChromeInstallResult,
  DesktopOpenChromeSetupStatus,
} from "@v3tools/contracts";
import {
  FolderOpenIcon,
  GlobeIcon,
  PlugZapIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useSettings, useUpdateSettings } from "../../hooks/useSettings";
import { isElectron } from "../../env";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";

const SUPPORT_LABEL = isElectron
  ? "Desktop browser automation available"
  : "Browser automation available through the server environment when configured";

export function BrowserUseSettings() {
  const browserUse = useSettings((settings) => settings.browserUse);
  const { updateSettings } = useUpdateSettings();
  const speechSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <header>
          <h3 className="text-sm font-semibold text-foreground">Browser use</h3>
          <p className="text-xs text-muted-foreground">
            Controls whether agent runs can open an isolated browser for DOM verification, UI
            testing, and login-gated inspection.
          </p>
        </header>
        <div className="rounded-xl border border-border bg-card/40 p-4">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={browserUse.enabled}
              onChange={(event) =>
                updateSettings({
                  browserUse: { ...browserUse, enabled: event.currentTarget.checked },
                })
              }
              className="mt-1"
            />
            <span>
              <span className="block font-medium text-foreground">Allow browser tool use</span>
              <span className="block text-xs text-muted-foreground">
                Each run still follows the approval and domain rules below.
              </span>
            </span>
          </label>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="font-medium text-foreground">Mode</span>
          <select
            value={browserUse.mode}
            onChange={(event) =>
              updateSettings({
                browserUse: {
                  ...browserUse,
                  mode: event.currentTarget.value as typeof browserUse.mode,
                },
              })
            }
            className="h-8 w-full rounded-md border border-border bg-background px-2"
          >
            <option value="headed">Headed</option>
            <option value="headless">Headless</option>
          </select>
        </label>
        <label className="space-y-1 text-xs">
          <span className="font-medium text-foreground">Cookie policy</span>
          <select
            value={browserUse.cookiePolicy}
            onChange={(event) =>
              updateSettings({
                browserUse: {
                  ...browserUse,
                  cookiePolicy: event.currentTarget.value as typeof browserUse.cookiePolicy,
                },
              })
            }
            className="h-8 w-full rounded-md border border-border bg-background px-2"
          >
            <option value="isolated">Isolated profile</option>
            <option value="reuse-current">Reuse current profile</option>
          </select>
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-border bg-card/40 p-3 text-xs text-foreground">
          <input
            type="checkbox"
            checked={browserUse.isolatedProfile}
            onChange={(event) =>
              updateSettings({
                browserUse: { ...browserUse, isolatedProfile: event.currentTarget.checked },
              })
            }
          />
          Use a separate browser profile by default
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-border bg-card/40 p-3 text-xs text-foreground">
          <input
            type="checkbox"
            checked={browserUse.requirePerRunApproval}
            onChange={(event) =>
              updateSettings({
                browserUse: {
                  ...browserUse,
                  requirePerRunApproval: event.currentTarget.checked,
                },
              })
            }
          />
          Ask before each browser-control run
        </label>
        <label className="space-y-1 text-xs sm:col-span-2">
          <span className="font-medium text-foreground">Domain allowlist</span>
          <textarea
            value={browserUse.domainAllowlist}
            rows={4}
            onChange={(event) =>
              updateSettings({
                browserUse: { ...browserUse, domainAllowlist: event.currentTarget.value },
              })
            }
            className="w-full resize-none rounded-md border border-border bg-background px-2 py-1 font-mono text-xs"
            placeholder={"localhost\n127.0.0.1\nv3.agaminggod.com"}
          />
        </label>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <OpenChromeStatusCard />
        <div className="rounded-lg border border-border bg-card/40 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <GlobeIcon className="size-4 text-primary" />
            Runtime status
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{SUPPORT_LABEL}</p>
        </div>
        <div className="rounded-lg border border-border bg-card/40 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ShieldCheckIcon className="size-4 text-primary" />
            Dictation/browser APIs
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Web Speech API: {speechSupported ? "available" : "not available in this browser"}
          </p>
        </div>
      </section>
    </div>
  );
}

const summarizeOpenChromeStatus = (status: DesktopOpenChromeSetupStatus): string => {
  if (status.installed && status.bridgeReachable) return "Installed and online";
  if (status.installed) return "Installed, bridge offline";
  if (status.installable) return "Ready to install";
  return "Files incomplete";
};

const summarizeInstallFailure = (result: DesktopOpenChromeInstallResult): string => {
  if (result.timedOut) return "The OpenChrome installer timed out before finishing.";
  const detail = result.stderr.trim() || result.stdout.trim();
  if (detail.length > 0) return detail.slice(0, 280);
  return `The installer exited with code ${result.exitCode ?? "unknown"}.`;
};

function OpenChromeStatusCard() {
  const bridge = typeof window !== "undefined" ? (window.desktopBridge?.openChrome ?? null) : null;
  const [status, setStatus] = useState<DesktopOpenChromeSetupStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);

  const refresh = useCallback(async () => {
    if (!bridge) return;
    setLoading(true);
    try {
      setStatus(await bridge.getStatus());
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "OpenChrome status failed",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleInstall = async () => {
    if (!bridge) return;
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
      await bridge.openExtensionSetup();
      toastManager.add({
        type: "success",
        title: "OpenChrome bridge installed",
        description: "The extension setup page and folder were opened.",
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
    if (!bridge || !status) return;
    try {
      await navigator.clipboard.writeText(status.extensionDir);
    } catch {
      // The path remains visible in the card if clipboard access is denied.
    }
    try {
      await bridge.openExtensionSetup();
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "OpenChrome setup failed",
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  if (!isElectron || !bridge) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-card/40 p-3 sm:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <PlugZapIcon className="size-4 text-primary" />
            OpenChrome MCP bridge
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {status ? summarizeOpenChromeStatus(status) : loading ? "Checking..." : "Not checked"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="xs" variant="outline" onClick={refresh} disabled={loading || installing}>
            <RefreshCwIcon className={loading ? "animate-spin" : undefined} />
            Refresh
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={handleOpenSetup}
            disabled={!status?.extensionManifestExists || installing}
          >
            <FolderOpenIcon />
            Extension setup
          </Button>
          <Button
            size="xs"
            onClick={handleInstall}
            disabled={installing || !status?.installScriptExists}
          >
            {installing ? "Installing..." : status?.installed ? "Repair" : "Install"}
          </Button>
        </div>
      </div>
      {status ? (
        <>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Bridge</dt>
              <dd className="font-medium text-foreground">
                {status.bridgeReachable ? "Online" : "Offline"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">MCP config</dt>
              <dd className="font-medium text-foreground">
                {status.mcpConfigured ? "Configured" : "Missing"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Startup</dt>
              <dd className="font-medium text-foreground">
                {status.startupLauncherExists ? "Enabled" : "Missing"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Pair token</dt>
              <dd className="font-medium text-foreground">{status.pairToken ?? "Missing"}</dd>
            </div>
          </dl>
          <div className="mt-3 min-w-0 rounded-md border border-border/70 bg-background/60 px-2 py-1.5 text-xs text-muted-foreground">
            <code className="block truncate">{status.extensionDir}</code>
          </div>
          {status.issues.length > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">{status.issues[0]}</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
