import { CommandId, DEFAULT_MODEL_BY_PROVIDER, MessageId, ThreadId } from "@v3tools/contracts";
import type { ModelSelection, ProviderKind } from "@v3tools/contracts";
import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";

import { requireEnvironmentConnection } from "../environments/runtime";
import { useSettings } from "../hooks/useSettings";
import {
  deriveLatestProviderLimitSnapshot,
  hasExplicitUsageLimitSignal,
} from "../lib/providerUsage";
import { selectThreadsAcrossEnvironments, useStore } from "../store";
import type { Thread } from "../types";
import { toastManager } from "./ui/toast";

const AUTO_FALLBACK_STORAGE_KEY = "v3:auto-fallback-triggered";
const AUTO_FALLBACK_MAX_STORED_KEYS = 200;
const FALLBACK_TITLE_PREFIX = "Fallback:";

function modelSelectionFor(provider: ProviderKind, model: string): ModelSelection {
  return { provider, model } as ModelSelection;
}

function lastUserMessage(thread: Thread): string | null {
  for (let index = thread.messages.length - 1; index >= 0; index -= 1) {
    const message = thread.messages[index];
    if (message?.role !== "user") continue;
    const text = message.text.trim();
    if (text.length > 0) return text;
  }
  return null;
}

function shouldStartFallback(
  thread: Thread,
  targetProvider: ProviderKind,
  targetModel: string,
): boolean {
  if (!thread.latestTurn) return false;
  if (thread.title.startsWith("Fallback:")) return false;
  if (thread.session?.status !== "error" && thread.latestTurn.state !== "error") return false;
  if (!hasExplicitUsageLimitSignal(thread)) return false;
  return (
    thread.modelSelection.provider !== targetProvider || thread.modelSelection.model !== targetModel
  );
}

function buildFallbackTitle(threadTitle: string): string {
  return `${FALLBACK_TITLE_PREFIX} ${threadTitle}`.slice(0, 120);
}

function hasExistingFallbackThread(
  threads: ReadonlyArray<Thread>,
  sourceThread: Thread,
  targetProvider: ProviderKind,
  targetModel: string,
): boolean {
  const title = buildFallbackTitle(sourceThread.title);
  return threads.some(
    (thread) =>
      thread.id !== sourceThread.id &&
      thread.environmentId === sourceThread.environmentId &&
      thread.projectId === sourceThread.projectId &&
      thread.title === title &&
      thread.modelSelection.provider === targetProvider &&
      thread.modelSelection.model === targetModel,
  );
}

function fallbackPrompt(thread: Thread, sourceProvider: string, lastMessage: string): string {
  return [
    "Continue this task because the previous provider reported an explicit usage or rate limit.",
    "",
    `Source provider: ${sourceProvider}`,
    `Original chat: ${thread.title}`,
    "",
    "Last user request:",
    lastMessage,
    "",
    "Use the same project and workspace context. Do not retry authentication failures, cancellations, or generic runtime errors.",
  ].join("\n");
}

function readStoredTriggerKeys(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(AUTO_FALLBACK_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

function writeStoredTriggerKeys(keys: ReadonlySet<string>): void {
  if (typeof window === "undefined") return;
  const values = [...keys].slice(-AUTO_FALLBACK_MAX_STORED_KEYS);
  try {
    window.localStorage.setItem(AUTO_FALLBACK_STORAGE_KEY, JSON.stringify(values));
  } catch {
    // localStorage can be disabled; the in-memory ref still dedupes this mount.
  }
}

function rememberTriggerKey(keys: Set<string>, triggerKey: string): void {
  keys.add(triggerKey);
  writeStoredTriggerKeys(keys);
}

function forgetTriggerKey(keys: Set<string>, triggerKey: string): void {
  keys.delete(triggerKey);
  writeStoredTriggerKeys(keys);
}

export function AutoFallbackCoordinator() {
  const autoFallback = useSettings((settings) => settings.autoFallback);
  const threads = useStore(useShallow(selectThreadsAcrossEnvironments));
  const triggeredRef = useRef<Set<string>>(readStoredTriggerKeys());

  useEffect(() => {
    if (!autoFallback.enabled) return;
    if (autoFallback.trigger !== "usage-limit") return;

    const targetProvider = autoFallback.targetProviderKind;
    const targetModel =
      autoFallback.targetModel.trim() || DEFAULT_MODEL_BY_PROVIDER[targetProvider];

    for (const thread of threads) {
      if (!shouldStartFallback(thread, targetProvider, targetModel)) continue;
      if (hasExistingFallbackThread(threads, thread, targetProvider, targetModel)) continue;
      const lastMessage = lastUserMessage(thread);
      if (!lastMessage) continue;
      const latestTurnId = thread.latestTurn?.turnId ?? null;
      const limitSnapshot = deriveLatestProviderLimitSnapshot(thread, { turnId: latestTurnId });
      const triggerKey = `${thread.environmentId}:${thread.id}:${
        limitSnapshot?.activityId ?? latestTurnId ?? "unknown"
      }:${targetProvider}:${targetModel}`;
      if (triggeredRef.current.has(triggerKey)) continue;
      rememberTriggerKey(triggeredRef.current, triggerKey);

      void (async () => {
        try {
          const connection = requireEnvironmentConnection(thread.environmentId);
          const now = new Date().toISOString();
          const fallbackThreadId = ThreadId.make(crypto.randomUUID());
          const fallbackModelSelection = modelSelectionFor(targetProvider, targetModel);
          const fallbackTitle = buildFallbackTitle(thread.title);
          await connection.client.orchestration.dispatchCommand({
            type: "thread.turn.start",
            commandId: CommandId.make(crypto.randomUUID()),
            threadId: fallbackThreadId,
            message: {
              messageId: MessageId.make(crypto.randomUUID()),
              role: "user",
              text: fallbackPrompt(
                thread,
                limitSnapshot?.provider ?? thread.modelSelection.provider,
                lastMessage,
              ),
              attachments: [],
            },
            modelSelection: fallbackModelSelection,
            titleSeed: fallbackTitle,
            runtimeMode: thread.runtimeMode,
            interactionMode: thread.interactionMode,
            bootstrap: {
              createThread: {
                projectId: thread.projectId,
                title: fallbackTitle,
                ...(thread.hostDeviceId === null ? {} : { hostDeviceId: thread.hostDeviceId }),
                modelSelection: fallbackModelSelection,
                runtimeMode: thread.runtimeMode,
                interactionMode: thread.interactionMode,
                branch: thread.branch,
                worktreePath: thread.worktreePath,
                createdAt: now,
              },
            },
            createdAt: now,
          });
          toastManager.add({
            type: "success",
            title: "Auto fallback started",
            description: `${targetProvider} / ${targetModel}`,
          });
        } catch (error) {
          forgetTriggerKey(triggeredRef.current, triggerKey);
          toastManager.add({
            type: "error",
            title: "Auto fallback failed",
            description: error instanceof Error ? error.message : String(error),
          });
        }
      })();
    }
  }, [autoFallback, threads]);

  return null;
}
