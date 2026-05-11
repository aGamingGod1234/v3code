// V3 GitHub connect control for settings surfaces.
//
// The primary path is GitHub OAuth:
// - desktop uses GitHub Device Flow through the Electron bridge, then
//   bootstraps the resulting token into the active V3 server session;
// - web uses the server-hosted /api/auth/github/authorize redirect.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangleIcon, GithubIcon, LoaderIcon, LogOutIcon, RefreshCwIcon } from "lucide-react";

import { Button } from "../../components/ui/button";
import { toastManager } from "../../components/ui/toast";
import { useSettings } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import {
  bootstrapGitHubToken,
  disconnectGitHub,
  fetchGitHubClientConfig,
  fetchGitHubConnectionStatus,
  startConnectGitHub,
  V3GitHubConnectError,
} from "../auth/connectGitHub";
import { getGitHubClientConfig, isGitHubBridgeAvailable } from "../auth/githubBridge";
import { GitHubDeviceCodeDialog } from "./GitHubDeviceCodeDialog";
import type { GitHubConnectionStatus, GitHubTokenBundle } from "@v3tools/contracts";

const DEFAULT_GITHUB_SCOPES: ReadonlyArray<string> = ["repo", "read:user", "user:email"];

interface ConnectGitHubButtonProps {
  readonly className?: string;
  readonly scopes?: ReadonlyArray<string>;
}

interface ConfigSnapshot {
  readonly available: boolean;
  readonly scopes: string;
}

export function V3ConnectGitHubButton({ className, scopes }: ConnectGitHubButtonProps) {
  const [config, setConfig] = useState<ConfigSnapshot | null>(null);
  const [status, setStatus] = useState<GitHubConnectionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [deviceCodeDialogOpen, setDeviceCodeDialogOpen] = useState(false);
  const gitHubSettings = useSettings((settings) => settings.gitHub);
  const desktopDeviceFlowAvailable = isGitHubBridgeAvailable();
  const clientIdOverride = useMemo(() => {
    const trimmed = gitHubSettings.deviceFlowClientId.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, [gitHubSettings.deviceFlowClientId]);
  const requestedScopes = useMemo(
    () => (scopes && scopes.length > 0 ? scopes : DEFAULT_GITHUB_SCOPES),
    [scopes],
  );
  const requestedScopeString = useMemo(() => requestedScopes.join(" "), [requestedScopes]);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [serverConfigResult, statusResult, desktopConfigResult] = await Promise.all([
          fetchGitHubClientConfig(signal).catch(() => null),
          fetchGitHubConnectionStatus(signal).catch(() => null),
          desktopDeviceFlowAvailable
            ? getGitHubClientConfig(clientIdOverride).catch(() => null)
            : Promise.resolve(null),
        ]);
        setConfig({
          available: desktopDeviceFlowAvailable
            ? Boolean(desktopConfigResult?.configured)
            : Boolean(serverConfigResult?.available),
          scopes: serverConfigResult?.scopes || requestedScopeString,
        });
        setStatus(statusResult);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setConfig({ available: false, scopes: "" });
        setStatus(null);
      }
    },
    [clientIdOverride, desktopDeviceFlowAvailable, requestedScopeString],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const handleConnect = useCallback(async () => {
    if (desktopDeviceFlowAvailable) {
      setDeviceCodeDialogOpen(true);
      return;
    }

    setBusy(true);
    try {
      if (!config?.available) {
        toastManager.add({
          type: "error",
          title: "GitHub sign-in not configured",
          description:
            "Set V3CODE_GITHUB_CLIENT_ID and V3CODE_GITHUB_CLIENT_SECRET on the server node.",
        });
        setBusy(false);
        return;
      }

      startConnectGitHub();
    } catch (error) {
      toastManager.add(getConnectErrorToast(error));
      setBusy(false);
    }
  }, [config?.available, desktopDeviceFlowAvailable]);

  const handleDeviceFlowSuccess = useCallback(
    async (token: GitHubTokenBundle) => {
      setBusy(true);
      try {
        const result = await bootstrapGitHubToken(token);
        toastManager.add({
          type: "success",
          title: "GitHub connected",
          description: `Connected @${result.username}.`,
        });
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const handleDisconnect = useCallback(async () => {
    if (!status?.connected) return;
    setBusy(true);
    try {
      await disconnectGitHub();
      toastManager.add({
        type: "success",
        title: "Disconnected GitHub",
        description: "Tokens for this device have been cleared from the server node.",
      });
      await refresh();
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not disconnect GitHub",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }, [refresh, status?.connected]);

  const deviceCodeDialog = desktopDeviceFlowAvailable ? (
    <GitHubDeviceCodeDialog
      open={deviceCodeDialogOpen}
      scopes={requestedScopes}
      clientIdOverride={clientIdOverride}
      onOpenChange={setDeviceCodeDialogOpen}
      onSuccess={handleDeviceFlowSuccess}
    />
  ) : null;

  if (config === null) {
    return (
      <div
        className={cn(
          "pointer-events-none flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-xs text-muted-foreground",
          className,
        )}
      >
        <GithubIcon className="size-3.5" />
        <span>Loading GitHub status...</span>
      </div>
    );
  }

  if (status?.connected) {
    if (status.needsReconnect) {
      return (
        <>
          <div
            className={cn(
              "flex flex-wrap items-center gap-2 rounded-xl border border-warning/35 bg-warning/10 px-3 py-2 text-xs text-foreground",
              className,
            )}
          >
            <AlertTriangleIcon className="size-3.5 text-warning-foreground" />
            <GithubIcon className="size-3.5" />
            <span className="font-medium">Reconnect {status.username ?? "GitHub"}</span>
            {status.reconnectReason ? (
              <span className="text-muted-foreground">{status.reconnectReason}</span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => {
                void handleConnect();
              }}
              disabled={busy}
              className="gap-1"
            >
              {busy ? (
                <LoaderIcon className="size-3.5 animate-spin" />
              ) : (
                <RefreshCwIcon className="size-3.5" />
              )}
              Reconnect
            </Button>
            <button
              type="button"
              aria-label="Disconnect GitHub"
              onClick={() => {
                void handleDisconnect();
              }}
              disabled={busy}
              className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
            >
              <LogOutIcon className="size-3.5" />
            </button>
          </div>
          {deviceCodeDialog}
        </>
      );
    }

    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-full border border-border/70 bg-background/85 px-2.5 py-1 text-xs text-foreground",
          className,
        )}
      >
        <GithubIcon className="size-3.5" />
        <span className="truncate font-medium">{status.username ?? "Connected"}</span>
        {status.scopes.length > 0 ? (
          <span className="truncate text-muted-foreground">
            ({status.scopes.map(String).join(", ")})
          </span>
        ) : null}
        <button
          type="button"
          aria-label="Disconnect GitHub"
          onClick={() => {
            void handleDisconnect();
          }}
          disabled={busy}
          className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
        >
          <LogOutIcon className="size-3.5" />
        </button>
      </div>
    );
  }

  if (!desktopDeviceFlowAvailable && !config.available) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-xs text-muted-foreground",
          className,
        )}
        title="Operator has not configured V3CODE_GITHUB_CLIENT_ID and V3CODE_GITHUB_CLIENT_SECRET on the server node."
      >
        <GithubIcon className="size-3.5" />
        <span>GitHub sign-in not configured</span>
      </div>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          void handleConnect();
        }}
        disabled={busy}
        className={cn("gap-2", className)}
      >
        {busy ? (
          <LoaderIcon className="size-3.5 animate-spin" />
        ) : (
          <GithubIcon className="size-3.5" />
        )}
        {busy ? "Finishing GitHub..." : "Connect GitHub"}
      </Button>
      {deviceCodeDialog}
    </>
  );
}

function getConnectErrorToast(error: unknown): Parameters<typeof toastManager.add>[0] {
  if (error instanceof V3GitHubConnectError) {
    if (error.code === "user-cancelled") {
      return {
        type: "info",
        title: "GitHub sign-in cancelled",
        description: "The OAuth browser flow was closed before it completed.",
      };
    }
    if (error.code === "not-configured") {
      return {
        type: "error",
        title: "GitHub OAuth is not configured",
        description:
          "Set a public GitHub OAuth Client ID under Settings > Git, or rebuild with V3CODE_GITHUB_PUBLIC_CLIENT_ID.",
      };
    }
  }

  return {
    type: "error",
    title: "Could not connect GitHub",
    description: error instanceof Error ? error.message : String(error),
  };
}
