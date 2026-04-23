// V3 Phase 1e — Connect GitHub button for settings surfaces.
//
// Renders three states:
//   * "not configured" — operator hasn't set V3CODE_GITHUB_CLIENT_ID;
//     disabled affordance with a tooltip.
//   * "connected" — chip showing the GitHub login + scope list + a
//     "Disconnect" action that POSTs /api/auth/github/disconnect.
//   * "disconnected" — primary "Connect GitHub" button that kicks off
//     the server-hosted redirect flow.

import { useCallback, useEffect, useState } from "react";
import { AlertTriangleIcon, GithubIcon, LoaderIcon, LogOutIcon, RefreshCwIcon } from "lucide-react";

import { Button } from "../../components/ui/button";
import { toastManager } from "../../components/ui/toast";
import { cn } from "../../lib/utils";
import {
  disconnectGitHub,
  fetchGitHubClientConfig,
  fetchGitHubConnectionStatus,
  preferDesktopGitHubFlow,
  startConnectGitHub,
  startConnectGitHubDesktop,
  V3GitHubConnectError,
} from "../auth/connectGitHub";
import type { GitHubConnectionStatus } from "@v3tools/contracts";

interface ConnectGitHubButtonProps {
  readonly className?: string;
}

interface ConfigSnapshot {
  readonly available: boolean;
  readonly scopes: string;
}

export function V3ConnectGitHubButton({ className }: ConnectGitHubButtonProps) {
  const [config, setConfig] = useState<ConfigSnapshot | null>(null);
  const [status, setStatus] = useState<GitHubConnectionStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const [configResult, statusResult] = await Promise.all([
        fetchGitHubClientConfig(signal),
        fetchGitHubConnectionStatus(signal).catch(() => null),
      ]);
      setConfig({ available: configResult.available, scopes: configResult.scopes });
      setStatus(statusResult);
    } catch (error) {
      // Config fetch failures are silent — the button falls back to a
      // "not configured" state so the UI still paints.
      if (error instanceof Error && error.name === "AbortError") return;
      setConfig({ available: false, scopes: "" });
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const handleConnect = useCallback(async () => {
    if (!config?.available) return;
    if (!preferDesktopGitHubFlow()) {
      startConnectGitHub();
      return;
    }
    setBusy(true);
    try {
      const scopes = config.scopes.length > 0 ? config.scopes : "repo read:user user:email";
      const result = await startConnectGitHubDesktop(scopes);
      toastManager.add({
        type: "success",
        title: "GitHub connected",
        description: `Signed in as ${result.username}.`,
      });
      await refresh();
    } catch (error) {
      if (error instanceof V3GitHubConnectError && error.code === "user-cancelled") {
        // Silent — user closed the browser tab.
        return;
      }
      toastManager.add({
        type: "error",
        title: "Could not connect GitHub",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  }, [config?.available, config?.scopes, refresh]);

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

  if (config === null) {
    return (
      <div
        className={cn(
          "pointer-events-none flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-xs text-muted-foreground",
          className,
        )}
      >
        <GithubIcon className="size-3.5" />
        <span>Loading GitHub status…</span>
      </div>
    );
  }

  if (!config.available) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-xs text-muted-foreground",
          className,
        )}
        title="Operator has not configured V3CODE_GITHUB_CLIENT_ID and V3CODE_GITHUB_CLIENT_SECRET."
      >
        <GithubIcon className="size-3.5" />
        <span>GitHub sign-in not configured</span>
      </div>
    );
  }

  if (status?.connected) {
    if (status.needsReconnect) {
      return (
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

  return (
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
      {busy ? "Waiting for browser…" : "Connect GitHub"}
    </Button>
  );
}
