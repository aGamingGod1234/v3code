import { scopeThreadRef } from "@v3tools/client-runtime";
import { useNavigate } from "@tanstack/react-router";
import { FolderIcon, FolderPlusIcon, FolderSearchIcon, SendHorizonalIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";

import { usePrimaryEnvironmentId } from "../environments/primary";
import { normalizeProjectPathForComparison } from "../lib/projectPaths";
import { pushRecentFolder, readRecentFolders, removeRecentFolder } from "../lib/recentFolders";
import { startThreadFromFolder } from "../lib/startThreadFromFolder";
import { selectProjectsAcrossEnvironments, useStore } from "../store";
import { buildThreadRouteParams } from "../threadRoutes";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { toastManager } from "./ui/toast";

const folderName = (path: string | null): string => {
  if (!path) return "your project";
  const cleaned = path.replace(/[/\\]+$/, "");
  const segments = cleaned.split(/[/\\]/);
  return segments[segments.length - 1] || cleaned;
};

const normalizeForLookup = (path: string): string => normalizeProjectPathForComparison(path);

export function HomeComposer() {
  const navigate = useNavigate();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const desktopBridge = window.desktopBridge;
  const projects = useStore(useShallow((store) => selectProjectsAcrossEnvironments(store)));
  const [recents, setRecents] = useState<string[]>(() => readRecentFolders());
  const [selectedFolder, setSelectedFolder] = useState<string | null>(() => {
    const list = readRecentFolders();
    return list[0] ?? null;
  });
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState(false);

  const matchingProject = useMemo(() => {
    if (!selectedFolder) return null;
    const selectedKey = normalizeForLookup(selectedFolder);
    return projects.find((project) => normalizeForLookup(project.cwd) === selectedKey) ?? null;
  }, [projects, selectedFolder]);

  const projectsByCwd = useMemo(() => {
    const map = new Map<string, (typeof projects)[number]>();
    for (const project of projects) {
      if (project.cwd) map.set(normalizeForLookup(project.cwd), project);
    }
    return map;
  }, [projects]);

  const recentProjectCards = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ cwd: string; name: string }> = [];
    for (const project of projects.slice(0, 10)) {
      const key = normalizeForLookup(project.cwd);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ cwd: project.cwd, name: project.name });
      if (out.length >= 5) break;
    }
    return out;
  }, [projects]);

  const refreshRecents = useCallback(() => {
    setRecents(readRecentFolders());
  }, []);

  useEffect(() => {
    refreshRecents();
  }, [refreshRecents]);

  const rememberFolder = useCallback((folder: string) => {
    setSelectedFolder(folder);
    setRecents(pushRecentFolder(folder));
  }, []);

  const onChooseFolder = useCallback(async () => {
    if (!desktopBridge?.pickFolder) {
      toastManager.add({
        type: "error",
        title: "Folder picker unavailable",
        description: "This is a desktop-only feature.",
      });
      return;
    }
    setShowFolderMenu(false);
    try {
      const picked = await desktopBridge.pickFolder();
      if (picked) rememberFolder(picked);
    } catch (cause) {
      toastManager.add({
        type: "error",
        title: "Could not open folder picker",
        description: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }, [desktopBridge, rememberFolder]);

  const onNewFolder = useCallback(async () => {
    setShowFolderMenu(false);
    if (!desktopBridge?.createDirectory) {
      toastManager.add({
        type: "error",
        title: "New folder unavailable",
        description: "This is a desktop-only feature.",
      });
      return;
    }
    const parentPath = selectedFolder;
    if (!parentPath) {
      toastManager.add({
        type: "error",
        title: "Choose a parent folder first",
        description: "Pick a folder, then create a child folder inside it.",
      });
      return;
    }
    const rawName = window.prompt("New folder name");
    const name = rawName?.trim() ?? "";
    if (name.length === 0) return;
    try {
      const createdPath = await desktopBridge.createDirectory({ parentPath, name });
      rememberFolder(createdPath);
    } catch (cause) {
      toastManager.add({
        type: "error",
        title: "Could not create folder",
        description: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }, [desktopBridge, rememberFolder, selectedFolder]);

  const onSend = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (busy || trimmedPrompt.length === 0) return;
    setBusy(true);
    try {
      if (!selectedFolder) {
        throw new Error("Pick a folder first.");
      }
      const created = await startThreadFromFolder({
        folderPath: selectedFolder,
        primaryEnvironmentId,
        projects,
        prompt: trimmedPrompt,
      });
      rememberFolder(created.cwd);
      setPrompt("");
      await navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(scopeThreadRef(created.environmentId, created.threadId)),
      });
    } catch (cause) {
      toastManager.add({
        type: "error",
        title: "Could not start chat",
        description: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setBusy(false);
    }
  }, [busy, navigate, primaryEnvironmentId, projects, prompt, rememberFolder, selectedFolder]);

  const headline = `What should we build in ${folderName(selectedFolder)}?`;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-5">
      <h1 className="text-balance text-center text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        {headline}
      </h1>
      <div className="rounded-2xl border border-border bg-card/50 p-3 shadow-sm">
        <div className="relative flex items-center gap-2 border-b border-border/60 pb-2">
          <button
            type="button"
            onClick={() => setShowFolderMenu((current) => !current)}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            <FolderIcon className="size-3.5 shrink-0" />
            <span className="truncate">{selectedFolder ?? "Choose a folder..."}</span>
            {matchingProject ? (
              <span className="ml-auto shrink-0 rounded-full bg-success/20 px-2 py-0.5 text-[10px] font-medium text-success-foreground">
                Project
              </span>
            ) : selectedFolder ? (
              <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                New project
              </span>
            ) : null}
          </button>
          {showFolderMenu ? (
            <div className="absolute left-0 top-full z-10 mt-1 w-full rounded-lg border border-border bg-popover p-1 shadow-lg">
              {recents.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No recent folders.</div>
              ) : null}
              {recents.map((folder) => {
                const isProject = projectsByCwd.has(normalizeForLookup(folder));
                return (
                  <div key={folder} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFolder(folder);
                        setShowFolderMenu(false);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted"
                    >
                      <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{folder}</span>
                      {isProject ? (
                        <span className="ml-auto shrink-0 text-[10px] text-success-foreground">
                          project
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      aria-label="Forget folder"
                      onClick={(event) => {
                        event.stopPropagation();
                        const next = removeRecentFolder(folder);
                        setRecents(next);
                        if (selectedFolder === folder) {
                          setSelectedFolder(next[0] ?? null);
                        }
                      }}
                      className="px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      x
                    </button>
                  </div>
                );
              })}
              <div className="my-1 border-t border-border/60" />
              <button
                type="button"
                onClick={() => void onChooseFolder()}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted"
              >
                <FolderSearchIcon className="size-3.5 text-muted-foreground" />
                Choose folder...
              </button>
              <button
                type="button"
                onClick={() => void onNewFolder()}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted"
              >
                <FolderPlusIcon className="size-3.5 text-muted-foreground" />
                New folder...
              </button>
            </div>
          ) : null}
        </div>
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.currentTarget.value)}
          placeholder="Describe the change. Press Ctrl+Enter to send."
          rows={4}
          className="resize-none border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void onSend();
            }
          }}
        />
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            size="sm"
            disabled={busy || prompt.trim().length === 0 || !selectedFolder}
            onClick={() => void onSend()}
          >
            <SendHorizonalIcon className="mr-1 size-3.5" />
            {busy ? "Starting..." : "Send"}
          </Button>
        </div>
      </div>
      {recentProjectCards.length > 0 ? (
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recent projects
          </div>
          <div className="flex flex-wrap gap-2">
            {recentProjectCards.map((project) => (
              <button
                key={`${project.cwd}|${project.name}`}
                type="button"
                onClick={() => {
                  rememberFolder(project.cwd);
                }}
                className="rounded-full border border-border bg-card/40 px-3 py-1 text-xs text-foreground transition-colors hover:bg-muted"
              >
                <span className="truncate font-medium">{project.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
