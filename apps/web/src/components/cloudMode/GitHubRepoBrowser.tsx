// V3 Phase 7 — GitHub repo browser.
//
// Shown in cloud-mode whenever the user needs to specify a working
// directory but has no local filesystem (e.g. new-chat on a Cloud env
// host, or any non-Electron browser). Three affordances, picked in
// priority order:
//
//   1. "Connect GitHub" — persists a user-supplied PAT in
//      localStorage. Replaced by the P8 server-node GitHub App flow.
//   2. Search / list — /user/repos for the default view, /search for
//      typed queries. Paginated with a "Load more" button.
//   3. "Paste owner/repo or URL" escape hatch for private repos that
//      GitHub's search ranking misses.
//
// On confirm the component emits a `{ owner, repo, branch }` triple;
// the parent wires this into `mesh.createChat`'s `github_repo` /
// `github_branch` fields.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  GitHubApiError,
  listAuthenticatedUserRepos,
  listRepoBranches,
  parseRepoSpec,
  type GitHubBranchSummary,
  type GitHubRepoSummary,
} from "./githubApi";
import {
  clearGitHubToken,
  readStoredGitHubToken,
  storeGitHubToken,
  type StoredGitHubToken,
} from "./githubTokenStore";

export interface GitHubRepoBrowserSelection {
  readonly owner: string;
  readonly repo: string;
  readonly fullName: string;
  readonly branch: string;
}

export interface GitHubRepoBrowserProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onConfirm: (selection: GitHubRepoBrowserSelection) => void;
  readonly className?: string;
}

type View = "connect" | "pick";

const describeError = (error: unknown): string => {
  if (error instanceof GitHubApiError) {
    if (error.kind === "unauthorised") {
      return "GitHub rejected the token. Re-connect with a token that has `repo` scope.";
    }
    if (error.kind === "forbidden") return "GitHub refused the request (scope or SSO enforcement).";
    if (error.kind === "rate-limited") return "GitHub rate-limited this browser. Wait a minute.";
    if (error.kind === "not-found") return "That repository was not found on your account.";
    if (error.kind === "network") return "Could not reach GitHub. Check your network.";
    return error.message;
  }
  return (error as Error)?.message ?? "Unknown error.";
};

export function GitHubRepoBrowser(props: GitHubRepoBrowserProps) {
  const { open, onOpenChange, onConfirm, className } = props;
  const [storedToken, setStoredToken] = useState<StoredGitHubToken | null>(null);
  const [view, setView] = useState<View>("connect");

  useEffect(() => {
    if (!open) return;
    const existing = readStoredGitHubToken();
    setStoredToken(existing);
    setView(existing ? "pick" : "connect");
  }, [open]);

  const handleTokenSaved = useCallback((token: StoredGitHubToken) => {
    setStoredToken(token);
    setView("pick");
  }, []);

  const handleTokenCleared = useCallback(() => {
    clearGitHubToken();
    setStoredToken(null);
    setView("connect");
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className={cn("max-w-xl", className)}>
        <DialogHeader>
          <DialogTitle>Pick a GitHub repo</DialogTitle>
          <DialogDescription>
            Cloud-hosted chats clone a GitHub repo at start-up. Pick one below, or paste
            <span className="mx-1 font-mono text-xs text-muted-foreground">owner/repo</span>
            to jump straight to a specific project.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          {view === "connect" || storedToken === null ? (
            <ConnectGitHubForm onSaved={handleTokenSaved} />
          ) : (
            <RepoPicker
              token={storedToken.token}
              onChangeToken={handleTokenCleared}
              onConfirm={(selection) => {
                onConfirm(selection);
                onOpenChange(false);
              }}
            />
          )}
        </DialogPanel>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function ConnectGitHubForm({ onSaved }: { onSaved: (token: StoredGitHubToken) => void }) {
  const [value, setValue] = useState("");
  const [scope, setScope] = useState("repo read:user");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setError("Paste a GitHub personal access token to continue.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Quick probe — list 1 repo to check the token. Using page=1,
      // per_page=1 keeps the call tiny.
      await listAuthenticatedUserRepos({ token: trimmed, perPage: 1, page: 1 });
      const stored = storeGitHubToken({ token: trimmed, scope });
      onSaved(stored);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setSubmitting(false);
    }
  }, [value, scope, onSaved]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="github-token-input">GitHub personal access token</Label>
        <Input
          id="github-token-input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
          placeholder="ghp_... or github_pat_..."
          disabled={submitting}
        />
        <p className="text-xs text-muted-foreground">
          Create one at{" "}
          <a
            className="underline decoration-muted-foreground/60 hover:decoration-foreground"
            href="https://github.com/settings/tokens/new"
            target="_blank"
            rel="noreferrer"
          >
            github.com/settings/tokens
          </a>{" "}
          with <span className="font-mono">repo</span> +{" "}
          <span className="font-mono">read:user</span>. Stored in this browser only; the V3 server
          never sees it. (P8 will replace this with a GitHub App connection.)
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="github-scope-input">Scope description (optional)</Label>
        <Input
          id="github-scope-input"
          value={scope}
          onChange={(event) => setScope(event.currentTarget.value)}
          disabled={submitting}
        />
      </div>
      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end">
        <Button type="button" onClick={handleSave} disabled={submitting}>
          {submitting ? "Verifying…" : "Save token"}
        </Button>
      </div>
    </div>
  );
}

interface RepoPickerProps {
  readonly token: string;
  readonly onChangeToken: () => void;
  readonly onConfirm: (selection: GitHubRepoBrowserSelection) => void;
}

function RepoPicker({ token, onChangeToken, onConfirm }: RepoPickerProps) {
  const [query, setQuery] = useState("");
  const [pasteValue, setPasteValue] = useState("");
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

  const fetchRepos = useCallback(
    async (targetPage: number, append: boolean) => {
      setLoadingRepos(true);
      setReposError(null);
      const controller = new AbortController();
      try {
        const result = await listAuthenticatedUserRepos({
          token,
          query,
          page: targetPage,
          perPage: 25,
          signal: controller.signal,
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
    [token, query],
  );

  const queryTypingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Reset pagination whenever the search query changes.
    if (queryTypingRef.current !== null) {
      clearTimeout(queryTypingRef.current);
    }
    queryTypingRef.current = setTimeout(() => {
      fetchRepos(1, false).catch(() => {
        /* fetchRepos already recorded the error in state */
      });
    }, 250);
    return () => {
      if (queryTypingRef.current !== null) {
        clearTimeout(queryTypingRef.current);
      }
    };
  }, [fetchRepos]);

  const loadBranches = useCallback(
    async (repo: GitHubRepoSummary) => {
      setBranchLoading(true);
      setBranchError(null);
      try {
        const result = await listRepoBranches({
          token,
          fullName: repo.fullName,
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
    },
    [token],
  );

  const handleRepoSelect = useCallback(
    (repo: GitHubRepoSummary) => {
      setSelectedRepo(repo);
      setBranches([]);
      setBranch(repo.defaultBranch);
      loadBranches(repo).catch(() => {
        /* already recorded */
      });
    },
    [loadBranches],
  );

  const handlePasteConfirm = useCallback(() => {
    const spec = parseRepoSpec(pasteValue);
    if (!spec) {
      setReposError("Could not parse that — try `owner/repo` or a github.com URL.");
      return;
    }
    const synthetic: GitHubRepoSummary = {
      id: -1,
      name: spec.repo,
      fullName: `${spec.owner}/${spec.repo}`,
      owner: spec.owner,
      private: true,
      defaultBranch: "main",
      description: null,
      updatedAt: new Date().toISOString(),
      htmlUrl: `https://github.com/${spec.owner}/${spec.repo}`,
      language: null,
    };
    handleRepoSelect(synthetic);
  }, [pasteValue, handleRepoSelect]);

  const canConfirm = useMemo(
    () => selectedRepo !== null && branch.trim().length > 0 && !branchLoading,
    [selectedRepo, branch, branchLoading],
  );

  const handleConfirm = useCallback(() => {
    if (!selectedRepo) return;
    onConfirm({
      owner: selectedRepo.owner,
      repo: selectedRepo.name,
      fullName: selectedRepo.fullName,
      branch: branch.trim() || selectedRepo.defaultBranch,
    });
  }, [selectedRepo, branch, onConfirm]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="github-repo-query">Search your repositories</Label>
        <Input
          id="github-repo-query"
          placeholder="v3code, monorepo…"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Repositories</Label>
        <div className="max-h-56 overflow-auto rounded-md border border-border/70 bg-muted/20">
          {repos.length === 0 && !loadingRepos ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              {reposError
                ? reposError
                : "No repositories yet — type a name above or paste a URL below."}
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
                onClick={() => fetchRepos(page + 1, true)}
              >
                Load more
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="github-paste">Or paste owner/repo or URL</Label>
        <div className="flex gap-2">
          <Input
            id="github-paste"
            value={pasteValue}
            onChange={(event) => setPasteValue(event.currentTarget.value)}
            placeholder="aGamingGod1234/v3code"
          />
          <Button type="button" variant="outline" onClick={handlePasteConfirm}>
            Use
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="github-branch">Branch</Label>
        {branches.length === 0 || branchError ? (
          <Input
            id="github-branch"
            value={branch}
            onChange={(event) => setBranch(event.currentTarget.value)}
            placeholder={selectedRepo?.defaultBranch ?? "main"}
            disabled={!selectedRepo || branchLoading}
          />
        ) : (
          <select
            id="github-branch"
            className="h-9 rounded-md border border-border/70 bg-background px-3 text-sm"
            value={branch}
            onChange={(event) => setBranch(event.currentTarget.value)}
            disabled={branchLoading}
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

      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onChangeToken}
          className="text-xs text-muted-foreground underline transition-colors hover:text-foreground"
        >
          Change GitHub token
        </button>
        <Button type="button" onClick={handleConfirm} disabled={!canConfirm}>
          Use this repo
        </Button>
      </div>
    </div>
  );
}
