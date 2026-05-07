// V3 GitHub connect control for settings surfaces.
//
// The primary path is GitHub OAuth:
// - desktop uses the Electron bridge to open the user's browser and complete
//   the loopback OAuth flow;
// - web uses the server-hosted /api/auth/github/authorize redirect.

import { useCallback, useEffect, useMemo, useState } from "react";
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
  const desktopOAuthAvailable = preferDesktopGitHubFlow();
  const requestedScopes = useMemo(
    () => (scopes && scopes.length > 0 ? scopes : DEFAULT_GITHUB_SCOPES),
    [scopes],
  );
  const requestedScopeString = useMemo(() => requestedScopes.join(" "), [requestedScopes]);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const [configResult, statusResult] = await Promise.all([
        fetchGitHubClientConfig(signal),
        fetchGitHubConnectionStatus(signal).catch(() => null),
      ]);
      setConfig({ available: configResult.available, scopes: configResult.scopes });
      setStatus(statusResult);
    } catch (error) {
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
    setBusy(true);
    try {
      if (desktopOAuthAvailable) {
        const result = await startConnectGitHubDesktop(requestedScopeString);
        toastManager.add({
          type: "success",
          title: "GitHub connected",
          description: `Connected @${result.username}.`,
        });
        await refresh();
        setBusy(false);
        return;
      }

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
  }, [config?.available, desktopOAuthAvailable, refresh, requestedScopeString]);

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
        <span>Loading GitHub status...</span>
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

  if (!desktopOAuthAvailable && !config.available) {
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
      {busy ? "Opening GitHub..." : "Connect GitHub"}
    </Button>
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
          "The desktop build needs embedded GitHub OAuth client credentials to start sign-in.",
      };
    }
  }

  return {
    type: "error",
    title: "Could not connect GitHub",
    description: error instanceof Error ? error.message : String(error),
  };
}
