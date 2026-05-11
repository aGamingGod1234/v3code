import { scopeThreadRef } from "@v3tools/client-runtime";
import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@v3tools/contracts";

const THREAD_DRAG_MIME = "application/vnd.v3tools.thread-ref+json";

interface ThreadDragPayload {
  readonly environmentId: string;
  readonly threadId: string;
}

function hasMimeType(types: readonly string[], mimeType: string): boolean {
  return types.includes(mimeType);
}

function isThreadDragPayload(value: unknown): value is ThreadDragPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const payload = value as Partial<ThreadDragPayload>;
  return (
    typeof payload.environmentId === "string" &&
    payload.environmentId.trim().length > 0 &&
    typeof payload.threadId === "string" &&
    payload.threadId.trim().length > 0
  );
}

export function setThreadDragData(dataTransfer: DataTransfer, threadRef: ScopedThreadRef): void {
  const payload: ThreadDragPayload = {
    environmentId: threadRef.environmentId,
    threadId: threadRef.threadId,
  };
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(THREAD_DRAG_MIME, JSON.stringify(payload));
  dataTransfer.setData("text/plain", `${threadRef.environmentId}:${threadRef.threadId}`);
}

export function hasThreadDragData(dataTransfer: DataTransfer): boolean {
  return hasMimeType(dataTransfer.types, THREAD_DRAG_MIME);
}

export function readThreadDragData(dataTransfer: DataTransfer): ScopedThreadRef | null {
  if (!hasThreadDragData(dataTransfer)) {
    return null;
  }

  try {
    const parsed = JSON.parse(dataTransfer.getData(THREAD_DRAG_MIME));
    if (!isThreadDragPayload(parsed)) {
      return null;
    }
    return scopeThreadRef(parsed.environmentId as EnvironmentId, parsed.threadId as ThreadId);
  } catch {
    return null;
  }
}
