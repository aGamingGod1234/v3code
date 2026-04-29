import { scopedThreadKey, scopeThreadRef } from "@v3tools/client-runtime";
import type { DeviceId, ScopedThreadRef } from "@v3tools/contracts";
import {
  CloudIcon,
  Columns2Icon,
  FolderPlusIcon,
  FolderSearchIcon,
  LayoutGridIcon,
  Maximize2Icon,
  MessageSquareIcon,
  MonitorIcon,
  PlusIcon,
  Rows2Icon,
  SendHorizonalIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useShallow } from "zustand/react/shallow";

import ChatView from "../ChatView";
import { CloudChatCreateDialog } from "../cloudMode/CloudChatCreateDialog";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SidebarInset } from "../ui/sidebar";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useMeshDeviceSnapshot } from "../../rpc/meshState";
import {
  type MultiChatLayoutMode,
  type MultiChatPaneId,
  paneTargetKey,
  useMultiChatLayoutStore,
  visiblePaneIdsForLayout,
} from "../../multiChatLayoutStore";
import {
  selectProjectsAcrossEnvironments,
  selectSidebarThreadsAcrossEnvironments,
  useStore,
} from "../../store";
import { buildThreadRouteParams } from "../../threadRoutes";
import { cn } from "../../lib/utils";
import { usePrimaryEnvironmentId } from "../../environments/primary";
import { pushRecentFolder, readRecentFolders } from "../../lib/recentFolders";
import { startThreadFromFolder } from "../../lib/startThreadFromFolder";
import { useSettings } from "../../hooks/useSettings";

const CURRENT_DEVICE_SELECT_VALUE = "__current_device__";

interface MultiChatWorkspaceProps {
  readonly routeThreadRef: ScopedThreadRef | null;
  readonly onDiffPanelOpen?: () => void;
}

const LAYOUT_OPTIONS: ReadonlyArray<{
  readonly mode: MultiChatLayoutMode;
  readonly label: string;
  readonly Icon: typeof SquareIcon;
}> = [
  { mode: "single", label: "Single", Icon: SquareIcon },
  { mode: "horizontal", label: "Left right", Icon: Columns2Icon },
  { mode: "vertical", label: "Up down", Icon: Rows2Icon },
  { mode: "quadrants", label: "Quarters", Icon: LayoutGridIcon },
];

const layoutGridClass = (layoutMode: MultiChatLayoutMode): string => {
  switch (layoutMode) {
    case "single":
      return "md:grid-cols-1 md:grid-rows-1";
    case "horizontal":
      return "md:grid-cols-2 md:grid-rows-1";
    case "vertical":
      return "md:grid-cols-1 md:grid-rows-2";
    case "quadrants":
      return "md:grid-cols-2 md:grid-rows-2";
  }
};

function shortPaneLabel(paneId: MultiChatPaneId): string {
  return paneId.slice(-1);
}

export function MultiChatWorkspace({ routeThreadRef, onDiffPanelOpen }: MultiChatWorkspaceProps) {
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const layoutMode = useMultiChatLayoutStore((state) => state.layoutMode);
  const activePaneId = useMultiChatLayoutStore((state) => state.activePaneId);
  const panes = useMultiChatLayoutStore((state) => state.panes);
  const setLayoutMode = useMultiChatLayoutStore((state) => state.setLayoutMode);
  const setPaneTarget = useMultiChatLayoutStore((state) => state.setPaneTarget);
  const setActivePaneId = useMultiChatLayoutStore((state) => state.setActivePaneId);
  const visiblePaneIds = visiblePaneIdsForLayout(layoutMode);
  const mobilePaneIds = isMobile
    ? visiblePaneIds.filter((paneId) => paneId === activePaneId)
    : visiblePaneIds;
  const fallbackPaneId: MultiChatPaneId = visiblePaneIds[0] ?? "pane-1";
  const paneIdsToRender = mobilePaneIds.length > 0 ? mobilePaneIds : [fallbackPaneId];

  useEffect(() => {
    if (!routeThreadRef) {
      return;
    }
    const routeKey = paneTargetKey(routeThreadRef);
    const activeTargetKey = paneTargetKey(panes[activePaneId].target);
    if (routeKey !== activeTargetKey) {
      setPaneTarget(activePaneId, routeThreadRef);
    }
  }, [activePaneId, panes, routeThreadRef, setPaneTarget]);

  const handlePaneFocus = useCallback(
    (paneId: MultiChatPaneId) => {
      setActivePaneId(paneId);
      const target = useMultiChatLayoutStore.getState().panes[paneId].target;
      if (!target) {
        return;
      }
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(scopeThreadRef(target.environmentId, target.threadId)),
      });
    },
    [navigate, setActivePaneId],
  );

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex h-full min-h-0 min-w-0 flex-col">
        <MultiChatToolbar
          activePaneId={activePaneId}
          layoutMode={layoutMode}
          paneIds={visiblePaneIds}
          setActivePaneId={handlePaneFocus}
          setLayoutMode={setLayoutMode}
        />
        <div
          className={cn(
            "grid min-h-0 flex-1 grid-cols-1 grid-rows-1 gap-1 bg-border/70 p-1 md:grid",
            layoutGridClass(layoutMode),
          )}
        >
          {paneIdsToRender.map((paneId) => (
            <MultiChatPane
              key={paneId}
              active={paneId === activePaneId}
              onFocus={() => handlePaneFocus(paneId)}
              paneId={paneId}
              target={panes[paneId].target}
              {...(onDiffPanelOpen ? { onDiffPanelOpen } : {})}
            />
          ))}
        </div>
      </div>
    </SidebarInset>
  );
}

function MultiChatToolbar({
  activePaneId,
  layoutMode,
  paneIds,
  setActivePaneId,
  setLayoutMode,
}: {
  readonly activePaneId: MultiChatPaneId;
  readonly layoutMode: MultiChatLayoutMode;
  readonly paneIds: readonly MultiChatPaneId[];
  readonly setActivePaneId: (paneId: MultiChatPaneId) => void;
  readonly setLayoutMode: (layoutMode: MultiChatLayoutMode) => void;
}) {
  return (
    <div className="flex min-h-11 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-2 py-1.5 text-xs sm:px-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="hidden items-center gap-1.5 text-muted-foreground sm:inline-flex">
          <MessageSquareIcon className="size-3.5" />
          Multi-agent view
        </span>
        <div className="flex items-center gap-1 rounded-md border border-border/70 bg-background/70 p-0.5">
          {paneIds.map((paneId) => (
            <button
              key={paneId}
              type="button"
              aria-label={`Focus pane ${shortPaneLabel(paneId)}`}
              className={cn(
                "inline-flex size-7 items-center justify-center rounded text-xs font-medium transition-colors",
                paneId === activePaneId
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              onClick={() => setActivePaneId(paneId)}
            >
              {shortPaneLabel(paneId)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {LAYOUT_OPTIONS.map(({ mode, label, Icon }) => (
          <Button
            key={mode}
            type="button"
            size="icon-xs"
            variant={layoutMode === mode ? "default" : "ghost"}
            title={label}
            aria-label={label}
            onClick={() => setLayoutMode(mode)}
          >
            <Icon className="size-3.5" />
          </Button>
        ))}
      </div>
    </div>
  );
}

function MultiChatPane({
  active,
  onDiffPanelOpen,
  onFocus,
  paneId,
  target,
}: {
  readonly active: boolean;
  readonly onDiffPanelOpen?: () => void;
  readonly onFocus: () => void;
  readonly paneId: MultiChatPaneId;
  readonly target: ScopedThreadRef | null;
}) {
  const closePane = useMultiChatLayoutStore((state) => state.closePane);
  const thread = useStore(
    useMemo(() => {
      if (!target) {
        return () => undefined;
      }
      return (state) =>
        state.environmentStateById[target.environmentId]?.sidebarThreadSummaryById[target.threadId];
    }, [target]),
  );

  if (!target) {
    return (
      <section
        className={cn(
          "flex min-h-0 min-w-0 flex-col overflow-hidden border bg-background",
          active ? "border-primary/60" : "border-border",
        )}
        onMouseDown={onFocus}
      >
        <PaneHeader
          active={active}
          paneId={paneId}
          title="Empty pane"
          onClose={() => closePane(paneId)}
          onFocus={onFocus}
        />
        <PaneEmptyState paneId={paneId} />
      </section>
    );
  }

  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden border bg-background",
        active ? "border-primary/60" : "border-border",
      )}
      onMouseDown={onFocus}
    >
      <PaneHeader
        active={active}
        paneId={paneId}
        title={thread?.title ?? "Loading chat"}
        onClose={() => closePane(paneId)}
        onFocus={onFocus}
      />
      <div className="min-h-0 flex-1">
        <ChatView
          environmentId={target.environmentId}
          threadId={target.threadId}
          reserveTitleBarControlInset={false}
          routeKind="server"
          {...(onDiffPanelOpen ? { onDiffPanelOpen } : {})}
        />
      </div>
    </section>
  );
}

function PaneHeader({
  active,
  onClose,
  onFocus,
  paneId,
  title,
}: {
  readonly active: boolean;
  readonly onClose: () => void;
  readonly onFocus: () => void;
  readonly paneId: MultiChatPaneId;
  readonly title: string;
}) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-card px-2">
      <button
        type="button"
        onClick={onFocus}
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold",
          active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {shortPaneLabel(paneId)}
      </button>
      <div className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{title}</div>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label="Focus pane"
        onClick={onFocus}
      >
        <Maximize2Icon className="size-3.5" />
      </Button>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label="Close pane"
        onClick={onClose}
      >
        <XIcon className="size-3.5" />
      </Button>
    </div>
  );
}

function PaneEmptyState({ paneId }: { readonly paneId: MultiChatPaneId }) {
  const navigate = useNavigate();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const desktopBridge = window.desktopBridge;
  const settings = useSettings();
  const setPaneTarget = useMultiChatLayoutStore((state) => state.setPaneTarget);
  const threads = useStore(useShallow(selectSidebarThreadsAcrossEnvironments));
  const projects = useStore(useShallow(selectProjectsAcrossEnvironments));
  const mesh = useMeshDeviceSnapshot();
  const [selectedThreadKey, setSelectedThreadKey] = useState("");
  const [selectedProjectKey, setSelectedProjectKey] = useState("");
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(
    () => readRecentFolders()[0] ?? null,
  );
  const [draftPrompt, setDraftPrompt] = useState("");
  const [startingDraft, setStartingDraft] = useState(false);
  const [cloudDialogOpen, setCloudDialogOpen] = useState(false);

  const sortedThreads = useMemo(
    () =>
      threads.toSorted((left, right) =>
        (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt),
      ),
    [threads],
  );
  const sortedProjects = useMemo(
    () => projects.toSorted((left, right) => left.name.localeCompare(right.name)),
    [projects],
  );
  const selectedProject = useMemo(() => {
    if (!selectedProjectKey) return sortedProjects[0] ?? null;
    return (
      sortedProjects.find(
        (project) => `${project.environmentId}:${project.id}` === selectedProjectKey,
      ) ?? null
    );
  }, [selectedProjectKey, sortedProjects]);
  const selectedHostDeviceId =
    selectedDeviceId.length > 0 ? (selectedDeviceId as DeviceId) : (mesh.currentDeviceId ?? null);

  const openSelectedThread = useCallback(() => {
    const thread = sortedThreads.find(
      (candidate) =>
        scopedThreadKey(scopeThreadRef(candidate.environmentId, candidate.id)) ===
        selectedThreadKey,
    );
    if (!thread) {
      return;
    }
    const target = scopeThreadRef(thread.environmentId, thread.id);
    setPaneTarget(paneId, target);
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(target),
    });
  }, [navigate, paneId, selectedThreadKey, setPaneTarget, sortedThreads]);

  const chooseFolder = useCallback(async () => {
    if (!desktopBridge?.pickFolder) {
      toastManager.add({
        type: "error",
        title: "Folder picker unavailable",
        description: "Folder selection is only available in the desktop app.",
      });
      return;
    }
    try {
      const folder = await desktopBridge.pickFolder();
      if (!folder) return;
      setSelectedFolder(folder);
      pushRecentFolder(folder);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not choose folder",
        description: error instanceof Error ? error.message : "Unknown error.",
      });
    }
  }, [desktopBridge]);

  const createFolder = useCallback(async () => {
    if (!desktopBridge?.createDirectory) {
      toastManager.add({
        type: "error",
        title: "New folder unavailable",
        description: "Folder creation is only available in the desktop app.",
      });
      return;
    }
    if (!selectedFolder) {
      toastManager.add({
        type: "warning",
        title: "Choose a parent folder",
        description: "Pick an existing folder before creating a child folder.",
      });
      return;
    }
    const name = window.prompt("New folder name")?.trim() ?? "";
    if (!name) return;
    try {
      const folder = await desktopBridge.createDirectory({ parentPath: selectedFolder, name });
      setSelectedFolder(folder);
      pushRecentFolder(folder);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not create folder",
        description: error instanceof Error ? error.message : "Unknown error.",
      });
    }
  }, [desktopBridge, selectedFolder]);

  const startFolderChat = useCallback(async () => {
    const prompt = draftPrompt.trim();
    if (startingDraft || !prompt) return;
    if (!selectedFolder) {
      toastManager.add({
        type: "warning",
        title: "Choose a folder",
        description: "Select a folder before starting a new chat.",
      });
      return;
    }
    setStartingDraft(true);
    try {
      const created = await startThreadFromFolder({
        folderPath: selectedFolder,
        hostDeviceId: selectedHostDeviceId,
        primaryEnvironmentId,
        projects,
        prompt,
        settings,
      });
      pushRecentFolder(created.cwd);
      setDraftPrompt("");
      const target = scopeThreadRef(created.environmentId, created.threadId);
      setPaneTarget(paneId, target);
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(target),
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not start chat",
        description: error instanceof Error ? error.message : "Unknown error.",
      });
    } finally {
      setStartingDraft(false);
    }
  }, [
    draftPrompt,
    navigate,
    paneId,
    primaryEnvironmentId,
    projects,
    selectedFolder,
    selectedHostDeviceId,
    setPaneTarget,
    settings,
    startingDraft,
  ]);

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
      <div className="w-full max-w-lg space-y-4">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Open a chat in this pane</EmptyTitle>
            <EmptyDescription>
              Pick any chat from any connected device, start a device-hosted draft, or launch a
              cloud environment chat when server-node cloud env is configured.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Existing chat</label>
          <div className="flex gap-2">
            <Select
              value={selectedThreadKey || null}
              onValueChange={(value) => setSelectedThreadKey(value ?? "")}
            >
              <SelectTrigger className="min-w-0 flex-1" size="sm">
                <SelectValue>
                  {sortedThreads.find(
                    (thread) =>
                      scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)) ===
                      selectedThreadKey,
                  )?.title ?? "Select a chat"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup className="max-h-72">
                {sortedThreads.map((thread) => {
                  const key = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
                  return (
                    <SelectItem key={key} value={key}>
                      <span className="block truncate">
                        {thread.title}
                        {thread.archivedAt ? " (archived)" : ""}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectPopup>
            </Select>
            <Button
              type="button"
              size="sm"
              onClick={openSelectedThread}
              disabled={!selectedThreadKey}
            >
              Open
            </Button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Project</label>
            <Select
              value={selectedProjectKey || null}
              onValueChange={(value) => {
                const nextKey = value ?? "";
                setSelectedProjectKey(nextKey);
                const project = sortedProjects.find(
                  (candidate) => `${candidate.environmentId}:${candidate.id}` === nextKey,
                );
                if (project) {
                  setSelectedFolder(project.cwd);
                  pushRecentFolder(project.cwd);
                }
              }}
            >
              <SelectTrigger size="sm">
                <SelectValue>{selectedProject?.name ?? "Select project"}</SelectValue>
              </SelectTrigger>
              <SelectPopup className="max-h-72">
                {sortedProjects.map((project) => (
                  <SelectItem
                    key={`${project.environmentId}:${project.id}`}
                    value={`${project.environmentId}:${project.id}`}
                  >
                    <span className="block truncate">{project.name}</span>
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Device</label>
            <Select
              value={selectedDeviceId || CURRENT_DEVICE_SELECT_VALUE}
              onValueChange={(value) =>
                setSelectedDeviceId(value === CURRENT_DEVICE_SELECT_VALUE ? "" : (value ?? ""))
              }
            >
              <SelectTrigger size="sm">
                <SelectValue>
                  {selectedDeviceId
                    ? (mesh.devices.find((device) => device.id === selectedDeviceId)?.name ??
                      "Selected device")
                    : "Current device"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup className="max-h-72">
                <SelectItem value={CURRENT_DEVICE_SELECT_VALUE}>
                  <span className="flex items-center gap-2 truncate">
                    <MonitorIcon className="size-3.5" />
                    Current device
                  </span>
                </SelectItem>
                {mesh.devices.map((device) => (
                  <SelectItem key={device.id} value={device.id}>
                    <span className="flex items-center gap-2 truncate">
                      <MonitorIcon className="size-3.5" />
                      {device.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Folder</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="min-h-8 min-w-0 flex-1 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
              <span className="block truncate">{selectedFolder ?? "Choose a folder..."}</span>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void chooseFolder()}
                className="gap-1.5"
              >
                <FolderSearchIcon className="size-3.5" />
                Choose
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void createFolder()}
                className="gap-1.5"
              >
                <FolderPlusIcon className="size-3.5" />
                New
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Prompt</label>
          <Textarea
            value={draftPrompt}
            rows={3}
            onChange={(event) => setDraftPrompt(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void startFolderChat();
              }
            }}
            placeholder="Start a new chat in the selected folder..."
            className="resize-none text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={startingDraft || !selectedFolder || draftPrompt.trim().length === 0}
            onClick={() => void startFolderChat()}
            className="gap-1.5"
          >
            {startingDraft ? (
              <PlusIcon className="size-3.5" />
            ) : (
              <SendHorizonalIcon className="size-3.5" />
            )}
            {startingDraft ? "Starting..." : "Start device chat"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setCloudDialogOpen(true)}
            className="gap-1.5"
          >
            <CloudIcon className="size-3.5" />
            New cloud chat
          </Button>
        </div>
      </div>
      <CloudChatCreateDialog
        open={cloudDialogOpen}
        onOpenChange={setCloudDialogOpen}
        onCreated={(result) => {
          const environmentId = primaryEnvironmentId;
          if (!environmentId) return;
          const target = scopeThreadRef(environmentId, result.threadId);
          setPaneTarget(paneId, target);
          void navigate({
            to: "/$environmentId/$threadId",
            params: buildThreadRouteParams(target),
          });
        }}
      />
    </div>
  );
}
