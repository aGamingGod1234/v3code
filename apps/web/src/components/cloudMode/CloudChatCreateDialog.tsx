// V3 Phase 8 — "New cloud chat" dialog (server-node mode only).
//
// Lists the authenticated GitHub user's repos via
// /api/v3/cloud/github/repos, loads branches for the selected repo,
// then posts /api/v3/cloud/chats to spin up the container and creates
// the thread shell. On success the caller navigates to the new chat.

"use client";

import {
  CloudCreateChatInput,
  type CloudCreateChatResult,
  type GitHubBranchSummary,
  type GitHubRepoSummary,
} from "@v3tools/contracts";
import { Schema } from "effect";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { cn } from "~/lib/utils";
import {
  createCloudChat,
  fetchCloudGitHubBranches,
  fetchCloudGitHubRepos,
} from "~/v3/cloud/cloudChatApi";

export interface CloudChatCreateDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: (result: CloudCreateChatResult) => void;
  readonly className?: string;
}

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error.";

export function CloudChatCreateDialog(props: CloudChatCreateDialogProps) {
  const { open, onOpenChange, onCreated, className } = props;
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [repos, setRepos] = useState<ReadonlyArray<GitHubRepoSummary>>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);

  const [selectedRepo, setSelectedRepo] = useState<GitHubRepoSummary | null>(null);
  const [branches, setBranches] = useState<ReadonlyArray<GitHubBranchSummary>>([]);
  const [branch, setBranch] = useState("");
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchRepos = useCallback(
    async (targetPage: number, append: boolean, abortSignal?: AbortSignal) => {
      setLoadingRepos(true);
      setReposError(null);
      try {
        const result = await fetchCloudGitHubRepos({
          query,
          page: targetPage,
          perPage: 25,
          ...(abortSignal ? { signal: abortSignal } : {}),
        });
        setRepos((prev) => (append ? [...prev, ...result.repos] : result.repos));
        setHasMore(result.hasMore);
        setPage(targetPage);
      } catch (cause) {
        setReposError(describeError(cause));
      } finally {
        setLoadingRepos(false);
      }
    },
    [query],
  );

  const queryTypingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!open) return;
    if (queryTypingRef.current !== null) {
      clearTimeout(queryTypingRef.current);
    }
    const controller = new AbortController();
    queryTypingRef.current = setTimeout(() => {
      fetchRepos(1, false, controller.signal).catch(() => {
        /* already handled */
      });
    }, 250);
    return () => {
      if (queryTypingRef.current !== null) {
        clearTimeout(queryTypingRef.current);
      }
      controller.abort();
    };
  }, [fetchRepos, open]);

  const loadBranches = useCallback(async (repo: GitHubRepoSummary) => {
    setBranchLoading(true);
    setBranchError(null);
    try {
      const result = await fetchCloudGitHubBranches({
        repoFullName: repo.fullName,
        perPage: 50,
        page: 1,
      });
      setBranches(result.branches);
      const defaultMatch = result.branches.find((b) => b.name === repo.defaultBranch);
      setBranch(defaultMatch?.name ?? result.branches[0]?.name ?? repo.defaultBranch);
    } catch (cause) {
      setBranchError(describeError(cause));
      setBranches([]);
      setBranch(repo.defaultBranch);
    } finally {
      setBranchLoading(false);
    }
  }, []);

  const handleRepoSelect = useCallback(
    (repo: GitHubRepoSummary) => {
      setSelectedRepo(repo);
      setBranches([]);
      setBranch(repo.defaultBranch);
      loadBranches(repo).catch(() => {
        /* already handled */
      });
    },
    [loadBranches],
  );

  const handleConfirm = useCallback(async () => {
    if (!selectedRepo) return;
    const trimmedBranch = branch.trim() || selectedRepo.defaultBranch;
    const trimmedTitle = title.trim();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = Schema.decodeUnknownSync(CloudCreateChatInput)({
        repoFullName: selectedRepo.fullName,
        branch: trimmedBranch,
        ...(trimmedTitle.length > 0 ? { title: trimmedTitle } : {}),
      });
      const result = await createCloudChat(payload);
      onCreated(result);
      onOpenChange(false);
    } catch (cause) {
      setSubmitError(describeError(cause));
    } finally {
      setSubmitting(false);
    }
  }, [selectedRepo, branch, title, onCreated, onOpenChange]);

  const canConfirm =
    selectedRepo !== null && branch.trim().length > 0 && !branchLoading && !submitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className={cn("max-w-xl", className)}>
        <DialogHeader>
          <DialogTitle>New cloud chat</DialogTitle>
          <DialogDescription>
            Pick a GitHub repo to clone into a fresh sandbox. Your connected GitHub account supplies
            the token; the server clones the repo inside a container that hosts this chat.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="cloud-chat-query">Search your repositories</Label>
              <Input
                id="cloud-chat-query"
                placeholder="v3code, monorepo…"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                disabled={submitting}
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs text-muted-foreground">Repositories</Label>
              <div className="max-h-56 overflow-auto rounded-md border border-border/70 bg-muted/20">
                {repos.length === 0 && !loadingRepos ? (
                  <p className="px-3 py-4 text-xs text-muted-foreground">
                    {reposError
                      ? reposError
                      : "No repositories loaded yet. Type above or reconnect your GitHub account in Settings → Connections."}
                  </p>
                ) : null}
                <ul className="divide-y divide-border/40">
                  {repos.map((repo) => {
                    const selected = selectedRepo?.fullName === repo.fullName;
                    return (
                      <li key={`${repo.id}-${repo.fullName}`}>
                        <button
                          type="button"
                          className={cn(
                            "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors",
                            selected ? "bg-primary/15" : "hover:bg-muted/30",
                          )}
                          onClick={() => handleRepoSelect(repo)}
                          disabled={submitting}
                        >
                          <span className="flex items-center gap-2 text-sm font-medium">
                            {repo.fullName}
                            {repo.private ? (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                                private
                              </span>
                            ) : null}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {repo.description ?? "No description"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {loadingRepos ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">Loading…</p>
                ) : null}
                {hasMore && !loadingRepos ? (
                  <div className="border-t border-border/40 p-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        fetchRepos(page + 1, true).catch(() => {
                          /* already handled */
                        })
                      }
                      disabled={submitting}
                    >
                      Load more
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="cloud-chat-branch">Branch</Label>
              {branches.length === 0 || branchError ? (
                <Input
                  id="cloud-chat-branch"
                  value={branch}
                  onChange={(event) => setBranch(event.currentTarget.value)}
                  placeholder={selectedRepo?.defaultBranch ?? "main"}
                  disabled={!selectedRepo || branchLoading || submitting}
                />
              ) : (
                <select
                  id="cloud-chat-branch"
                  className="h-9 rounded-md border border-border/70 bg-background px-3 text-sm"
                  value={branch}
                  onChange={(event) => setBranch(event.currentTarget.value)}
                  disabled={branchLoading || submitting}
                >
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                      {b.protected ? " (protected)" : ""}
                    </option>
                  ))}
                </select>
              )}
              {branchError ? (
                <p className="text-xs text-destructive">{branchError}</p>
              ) : branchLoading ? (
                <p className="text-xs text-muted-foreground">Loading branches…</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="cloud-chat-title">Optional chat title</Label>
              <Input
                id="cloud-chat-title"
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
                placeholder={
                  selectedRepo
                    ? `${selectedRepo.fullName} (${branch || selectedRepo.defaultBranch})`
                    : "New chat"
                }
                disabled={submitting}
              />
            </div>

            {submitError ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {submitError}
              </p>
            ) : null}
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!canConfirm}>
            {submitting ? "Starting…" : "Start cloud chat"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
