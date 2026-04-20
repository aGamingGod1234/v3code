// V3 Phase 8 — status strip above a cloud-hosted chat view.
//
// Shows the container status, repo/branch + the live resource caps.
// Includes an "End chat" button that POSTs /api/v3/cloud/end, which
// tears down the container and marks the thread as dead.
//
// Designed to be dropped into the chat view alongside the existing
// "viewing chat hosted on Laptop" banner — both coexist because a
// chat on the Cloud device is also a remote-hosted chat from any
// client that isn't the server node itself.

import { CloudIcon, LoaderIcon, StopCircleIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { CloudContainerInfo } from "@v3tools/contracts";

import { endCloudChat, fetchCloudContainers } from "./cloudClient";

export interface CloudChatStatusStripProps {
  readonly chatId: string;
  // Pulled directly from `projection_threads.host_device_id`; the
  // strip only renders if this matches `cloud:<userId>`.
  readonly hostDeviceId: string | null;
  readonly currentUserId: string;
  readonly onChatEnded?: () => void;
}

interface StripState {
  readonly info: CloudContainerInfo | null;
  readonly loading: boolean;
  readonly error: string | null;
}

export function CloudChatStatusStrip(props: CloudChatStatusStripProps) {
  const [state, setState] = useState<StripState>({ info: null, loading: true, error: null });
  const [endingChat, setEndingChat] = useState<boolean>(false);

  const expected = `cloud:${props.currentUserId}`;
  const isCloudHosted = props.hostDeviceId === expected;

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!isCloudHosted) return;
      try {
        setState((prev) => ({ ...prev, loading: true }));
        const snapshot = await fetchCloudContainers({
          ...(signal ? { signal } : {}),
          includeEnded: true,
        });
        const info = snapshot.containers.find((row) => row.chatId === props.chatId) ?? null;
        setState({ info, loading: false, error: null });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setState({
          info: null,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [isCloudHosted, props.chatId],
  );

  useEffect(() => {
    if (!isCloudHosted) return;
    const controller = new AbortController();
    void refresh(controller.signal);
    // Re-poll every 5 seconds while the container isn't in a terminal
    // state — long enough to be cheap, short enough that the UI
    // reflects the "cloning → ready" transition within a couple ticks.
    const interval = setInterval(() => {
      if (state.info && (state.info.status === "dead" || state.info.status === "error")) {
        return;
      }
      void refresh();
    }, 5_000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [isCloudHosted, refresh, state.info]);

  const handleEnd = useCallback(async () => {
    if (endingChat) return;
    setEndingChat(true);
    try {
      await endCloudChat({
        chatId: props.chatId as never,
        commandId: crypto.randomUUID() as never,
      });
      await refresh();
      props.onChatEnded?.();
    } finally {
      setEndingChat(false);
    }
  }, [endingChat, props, refresh]);

  if (!isCloudHosted) return null;
  if (state.loading && state.info === null) {
    return (
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2 text-sm">
        <LoaderIcon className="animate-spin" size={14} />
        <span>Loading Cloud env status…</span>
      </div>
    );
  }
  if (state.info === null) {
    return (
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2 text-sm text-destructive">
        <CloudIcon size={14} />
        <span>
          Cloud container for this chat could not be found.
          {state.error ? ` (${state.error})` : ""}
        </span>
      </div>
    );
  }

  const statusLabel = (() => {
    switch (state.info.status) {
      case "starting":
        return "Starting container…";
      case "cloning":
        return "Cloning repo…";
      case "ready":
        return "Ready";
      case "running":
        return "Running";
      case "stopping":
        return "Stopping…";
      case "dead":
        return "Container ended";
      case "error":
        return "Container error";
    }
  })();

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-2 text-sm">
      <div className="flex items-center gap-3">
        <CloudIcon size={14} />
        <span className="font-medium">Cloud</span>
        <span className="text-muted-foreground">
          {state.info.githubRepo ?? "no repo"}
          {state.info.githubBranch ? ` · ${state.info.githubBranch}` : ""}
        </span>
        <span className="text-muted-foreground">·</span>
        <span>{statusLabel}</span>
        {state.info.statusMessage && (
          <span className="text-xs text-muted-foreground">({state.info.statusMessage})</span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>
          {state.info.cpuLimit} CPU · {state.info.memoryMb} MB · {state.info.diskGb} GB
        </span>
        {state.info.status !== "dead" && state.info.status !== "error" && (
          <button
            type="button"
            onClick={() => void handleEnd()}
            disabled={endingChat}
            className="inline-flex items-center gap-1 rounded border px-2 py-0.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            {endingChat ? (
              <LoaderIcon className="animate-spin" size={12} />
            ) : (
              <StopCircleIcon size={12} />
            )}
            End chat
          </button>
        )}
      </div>
    </div>
  );
}
