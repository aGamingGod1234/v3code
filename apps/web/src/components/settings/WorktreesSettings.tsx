import { GitBranchIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { useSettings, useUpdateSettings } from "../../hooks/useSettings";
import { selectProjectsAcrossEnvironments, useStore } from "../../store";
import { Button } from "../ui/button";

export function WorktreesSettings() {
  const worktrees = useSettings((settings) => settings.worktrees);
  const { updateSettings } = useUpdateSettings();
  const projects = useStore(useShallow(selectProjectsAcrossEnvironments));
  const gitBackedProjects = useMemo(
    () => projects.filter((project) => project.cwd && project.repositoryIdentity),
    [projects],
  );

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <header>
          <h3 className="text-sm font-semibold text-foreground">Worktree defaults</h3>
          <p className="text-xs text-muted-foreground">
            Worktrees let parallel chats work on isolated branches from the same repository. These
            defaults are used by branch and pull-request chat creation flows.
          </p>
        </header>
        <div className="space-y-3 rounded-xl border border-border bg-card/40 p-4">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={worktrees.enabled}
              onChange={(event) =>
                updateSettings({
                  worktrees: { ...worktrees, enabled: event.currentTarget.checked },
                })
              }
              className="mt-1"
            />
            <span>
              <span className="block font-medium text-foreground">Create managed worktrees</span>
              <span className="block text-xs text-muted-foreground">
                New branch and review chats can start in a dedicated worktree instead of the main
                checkout.
              </span>
            </span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs">
              <span className="font-medium text-foreground">Base directory</span>
              <input
                value={worktrees.baseDirectory}
                onChange={(event) =>
                  updateSettings({
                    worktrees: { ...worktrees, baseDirectory: event.currentTarget.value },
                  })
                }
                className="h-8 w-full rounded-md border border-border bg-background px-2"
                placeholder="Use repository-adjacent .worktrees"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium text-foreground">Default base branch</span>
              <input
                value={worktrees.defaultBaseBranch}
                onChange={(event) =>
                  updateSettings({
                    worktrees: { ...worktrees, defaultBaseBranch: event.currentTarget.value },
                  })
                }
                className="h-8 w-full rounded-md border border-border bg-background px-2"
                placeholder="main"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium text-foreground">Max worktrees per repository</span>
              <input
                type="number"
                min={1}
                max={32}
                value={worktrees.maxPerRepository}
                onChange={(event) =>
                  updateSettings({
                    worktrees: {
                      ...worktrees,
                      maxPerRepository: Math.max(
                        1,
                        Math.min(32, Number(event.currentTarget.value) || 1),
                      ),
                    },
                  })
                }
                className="h-8 w-full rounded-md border border-border bg-background px-2"
              />
            </label>
            <label className="flex items-center gap-2 self-end text-xs text-foreground">
              <input
                type="checkbox"
                checked={worktrees.cleanupStaleOnStartup}
                onChange={(event) =>
                  updateSettings({
                    worktrees: {
                      ...worktrees,
                      cleanupStaleOnStartup: event.currentTarget.checked,
                    },
                  })
                }
              />
              Clean up stale managed worktrees on startup
            </label>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Detected repositories</h3>
            <p className="text-xs text-muted-foreground">
              Repositories known to V3. Managed worktree operations run through the existing Git API
              for the selected environment.
            </p>
          </div>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            <RefreshCwIcon className="size-3" />
            Refresh
          </Button>
        </header>
        <div className="space-y-2">
          {gitBackedProjects.map((project) => (
            <div
              key={`${project.environmentId}:${project.id}`}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card/40 p-3 sm:flex-row sm:items-center"
            >
              <GitBranchIcon className="hidden size-4 text-muted-foreground sm:block" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-foreground">{project.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {project.repositoryIdentity?.rootPath ?? project.cwd}
                </div>
              </div>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled
                title="Worktree deletion is available from the branch toolbar for each active repository."
              >
                <Trash2Icon className="size-3" />
                Managed by Git toolbar
              </Button>
            </div>
          ))}
          {gitBackedProjects.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
              No git repositories are loaded yet. Open a project folder with a Git repository to use
              managed worktrees.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
