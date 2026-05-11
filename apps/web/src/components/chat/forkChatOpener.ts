// Imperative opener for the ForkChatButton dialog.
//
// `ForkChatButton` owns its own open-state inside the chat header, so
// we expose a tiny event hub that outside code (offline-host toast
// action, keyboard shortcut, command palette, …) can call without
// having to thread refs around. The button subscribes on mount and
// toggles its dialog when its own `threadRef` matches the request.

import type { ScopedThreadRef } from "@v3tools/contracts";
import { scopedThreadKey } from "@v3tools/client-runtime";

type Listener = (ref: ScopedThreadRef) => void;

const listeners = new Set<Listener>();
let pendingRef: ScopedThreadRef | null = null;

export function subscribeForkChatOpenRequests(listener: Listener): () => void {
  listeners.add(listener);
  if (pendingRef !== null) {
    queueMicrotask(() => {
      if (listeners.has(listener) && pendingRef !== null) {
        listener(pendingRef);
      }
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

export function requestOpenForkChatDialog(ref: ScopedThreadRef): void {
  pendingRef = ref;
  for (const listener of listeners) {
    try {
      listener(ref);
    } catch {
      // Listeners are light-weight; swallow so a broken subscriber
      // can't stop other subscribers from receiving the event.
    }
  }
}

export function clearForkChatOpenRequest(ref: ScopedThreadRef): void {
  if (pendingRef !== null && matchesScopedThreadRef(pendingRef, ref)) {
    pendingRef = null;
  }
}

export function matchesScopedThreadRef(a: ScopedThreadRef, b: ScopedThreadRef): boolean {
  return scopedThreadKey(a) === scopedThreadKey(b);
}
