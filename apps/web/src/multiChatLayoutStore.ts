import { scopedThreadKey, scopeThreadRef } from "@v3tools/client-runtime";
import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@v3tools/contracts";
import { create } from "zustand";

const STORAGE_KEY = "v3code:multiChatLayout:v1";

export const MULTI_CHAT_PANE_IDS = ["pane-1", "pane-2", "pane-3", "pane-4"] as const;

export type MultiChatPaneId = (typeof MULTI_CHAT_PANE_IDS)[number];
export type MultiChatLayoutMode = "single" | "horizontal" | "vertical" | "quadrants";

export interface MultiChatPaneTarget {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}

export interface MultiChatPaneState {
  readonly id: MultiChatPaneId;
  readonly target: MultiChatPaneTarget | null;
}

interface PersistedMultiChatLayout {
  readonly layoutMode?: MultiChatLayoutMode;
  readonly activePaneId?: MultiChatPaneId;
  readonly panes?: ReadonlyArray<{
    readonly id?: string;
    readonly environmentId?: string;
    readonly threadId?: string;
  }>;
}

export interface MultiChatLayoutState {
  readonly layoutMode: MultiChatLayoutMode;
  readonly activePaneId: MultiChatPaneId;
  readonly panes: Record<MultiChatPaneId, MultiChatPaneState>;
  readonly setLayoutMode: (layoutMode: MultiChatLayoutMode) => void;
  readonly setActivePaneId: (paneId: MultiChatPaneId) => void;
  readonly setPaneTarget: (paneId: MultiChatPaneId, target: MultiChatPaneTarget | null) => void;
  readonly openThreadInActivePane: (target: MultiChatPaneTarget) => void;
  readonly closePane: (paneId: MultiChatPaneId) => void;
}

export function visiblePaneIdsForLayout(
  layoutMode: MultiChatLayoutMode,
): readonly MultiChatPaneId[] {
  switch (layoutMode) {
    case "single":
      return ["pane-1"];
    case "horizontal":
    case "vertical":
      return ["pane-1", "pane-2"];
    case "quadrants":
      return MULTI_CHAT_PANE_IDS;
  }
}

export function isMultiChatLayoutMode(value: unknown): value is MultiChatLayoutMode {
  return (
    value === "single" || value === "horizontal" || value === "vertical" || value === "quadrants"
  );
}

function isPaneId(value: unknown): value is MultiChatPaneId {
  return typeof value === "string" && MULTI_CHAT_PANE_IDS.includes(value as MultiChatPaneId);
}

export function paneTargetKey(target: MultiChatPaneTarget | ScopedThreadRef | null): string | null {
  return target ? scopedThreadKey(scopeThreadRef(target.environmentId, target.threadId)) : null;
}

function buildEmptyPanes(): Record<MultiChatPaneId, MultiChatPaneState> {
  return {
    "pane-1": { id: "pane-1", target: null },
    "pane-2": { id: "pane-2", target: null },
    "pane-3": { id: "pane-3", target: null },
    "pane-4": { id: "pane-4", target: null },
  };
}

function readPersistedLayout(): Pick<
  MultiChatLayoutState,
  "activePaneId" | "layoutMode" | "panes"
> {
  const fallback = {
    layoutMode: "single" as MultiChatLayoutMode,
    activePaneId: "pane-1" as MultiChatPaneId,
    panes: buildEmptyPanes(),
  };
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as PersistedMultiChatLayout;
    const panes = buildEmptyPanes();
    for (const pane of parsed.panes ?? []) {
      if (
        !isPaneId(pane.id) ||
        typeof pane.environmentId !== "string" ||
        pane.environmentId.length === 0 ||
        typeof pane.threadId !== "string" ||
        pane.threadId.length === 0
      ) {
        continue;
      }
      panes[pane.id] = {
        id: pane.id,
        target: {
          environmentId: pane.environmentId as EnvironmentId,
          threadId: pane.threadId as ThreadId,
        },
      };
    }
    const layoutMode = isMultiChatLayoutMode(parsed.layoutMode) ? parsed.layoutMode : "single";
    const activePaneId =
      isPaneId(parsed.activePaneId) &&
      visiblePaneIdsForLayout(layoutMode).includes(parsed.activePaneId)
        ? parsed.activePaneId
        : "pane-1";
    return { layoutMode, activePaneId, panes };
  } catch {
    return fallback;
  }
}

function persistLayout(state: MultiChatLayoutState): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const payload: PersistedMultiChatLayout = {
      layoutMode: state.layoutMode,
      activePaneId: state.activePaneId,
      panes: MULTI_CHAT_PANE_IDS.flatMap((paneId) => {
        const target = state.panes[paneId].target;
        return target
          ? [
              {
                id: paneId,
                environmentId: target.environmentId,
                threadId: target.threadId,
              },
            ]
          : [];
      }),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Storage is best-effort; losing the layout must not break chat.
  }
}

const initialLayout = readPersistedLayout();

export const useMultiChatLayoutStore = create<MultiChatLayoutState>((set) => ({
  ...initialLayout,
  setLayoutMode: (layoutMode) =>
    set((state) => {
      const visiblePaneIds = visiblePaneIdsForLayout(layoutMode);
      const fallbackPaneId: MultiChatPaneId = visiblePaneIds[0] ?? "pane-1";
      const activePaneId = visiblePaneIds.includes(state.activePaneId)
        ? state.activePaneId
        : fallbackPaneId;
      return { ...state, activePaneId, layoutMode };
    }),
  setActivePaneId: (activePaneId) =>
    set((state) => (state.activePaneId === activePaneId ? state : { ...state, activePaneId })),
  setPaneTarget: (paneId, target) =>
    set((state) => ({
      ...state,
      activePaneId: paneId,
      panes: {
        ...state.panes,
        [paneId]: {
          id: paneId,
          target,
        },
      },
    })),
  openThreadInActivePane: (target) =>
    set((state) => ({
      ...state,
      panes: {
        ...state.panes,
        [state.activePaneId]: {
          id: state.activePaneId,
          target,
        },
      },
    })),
  closePane: (paneId) =>
    set((state) => ({
      ...state,
      panes: {
        ...state.panes,
        [paneId]: {
          id: paneId,
          target: null,
        },
      },
    })),
}));

useMultiChatLayoutStore.subscribe((state) => persistLayout(state));
