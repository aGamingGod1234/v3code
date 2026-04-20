// V3 Phase 8 — "New Cloud chat" dialog.
//
// Gated by fetchCloudConfig(): if the server returns 404, the feature
// is off and the dialog renders a muted "Cloud env is not enabled"
// state; callers should skip opening it in that case. If the server
// returns `dockerAvailable: false`, we show a disabled primary
// button with an operator-facing hint.
//
// The dialog's happy path:
//
//   1. Load /api/v3/cloud/repos (requires GitHub linked).
//   2. User picks a repo.
//   3. Load /api/v3/cloud/branches?repo=<picked>.
//   4. User picks a branch + accepts defaults.
//   5. POST /api/v3/cloud/provision — server dispatches thread.create
//      + boots a container. The web app then navigates to the thread.
//
// The dialog is self-contained so we can drop it into the sidebar
// without touching the existing local thread creation flow.

import { CloudIcon, GithubIcon, LoaderIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  CloudGitHubBranchSummary,
  CloudGitHubRepoSummary,
  CloudProvisionInput,
  CloudPublicConfig,
  ModelSelection,
} from "@v3tools/contracts";

import {
  fetchCloudBranches,
  fetchCloudConfig,
  fetchCloudRepos,
  provisionCloudChat,
} from "./cloudClient";

export interface CloudChatDialogProps {
  readonly open: boolean;
  readonly onDismiss: () => void;
  readonly onProvisioned: (threadId: string) => void;
  readonly projectId: string;
  readonly modelSelection: ModelSelection;
  readonly commandIdFactory: () => string;
  readonly threadIdFactory: () => string;
}

interface LoadState<T> {
  readonly status: "idle" | "loading" | "ready" | "error";
  readonly value: T | null;
  readonly error: string | null;
}

const idleState = <T,>(): LoadState<T> => ({ status: "idle", value: null, error: null });

const loadingState = <T,>(previous: LoadState<T>): LoadState<T> => ({
  status: "loading",
  value: previous.value,
  error: null,
});

const readyState = <T,>(value: T): LoadState<T> => ({
  status: "ready",
  value,
  error: null,
});

const errorState = <T,>(message: string): LoadState<T> => ({
  status: "error",
  value: null,
  error: message,
});

export function CloudChatDialog(props: CloudChatDialogProps) {
  const [config, setConfig] = useState<LoadState<CloudPublicConfig>>(idleState);
  const [repos, setRepos] = useState<LoadState<ReadonlyArray<CloudGitHubRepoSummary>>>(idleState);
  const [branches, setBranches] =
    useState<LoadState<ReadonlyArray<CloudGitHubBranchSummary>>>(idleState);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [provisioning, setProvisioning] = useState<boolean>(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    const controller = new AbortController();
    setConfig(loadingState);
    fetchCloudConfig(controller.signal)
      .then((result) => {
        if (result === null) {
          setConfig(errorState("Cloud env is not enabled on this server."));
          return;
        }
        setConfig(readyState(result));
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setConfig(errorState(error instanceof Error ? error.message : String(error)));
      });
    return () => controller.abort();
  }, [props.open]);

  useEffect(() => {
    if (!props.open) return;
    if (config.status !== "ready" || !config.value?.githubConnected) return;
    const controller = new AbortController();
    setRepos(loadingState);
    fetchCloudRepos(controller.signal)
      .then((result) => {
        setRepos(readyState(result));
        const first = result[0];
        if (first !== undefined && selectedRepo === "") {
          setSelectedRepo(first.fullName);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setRepos(errorState(error instanceof Error ? error.message : String(error)));
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open, config.status, config.value?.githubConnected]);

  useEffect(() => {
    if (!props.open) return;
    if (selectedRepo.length === 0) return;
    const controller = new AbortController();
    setBranches(loadingState);
    setSelectedBranch("");
    fetchCloudBranches(selectedRepo, controller.signal)
      .then((result) => {
        setBranches(readyState(result));
        const repoRow = repos.value?.find((row) => row.fullName === selectedRepo);
        const preferred = repoRow?.defaultBranch ?? result[0]?.name ?? "";
        setSelectedBranch(preferred);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setBranches(errorState(error instanceof Error ? error.message : String(error)));
      });
    return () => controller.abort();
  }, [props.open, selectedRepo, repos.value]);

  const reset = useCallback(() => {
    setConfig(idleState);
    setRepos(idleState);
    setBranches(idleState);
    setSelectedRepo("");
    setSelectedBranch("");
    setTitle("");
    setProvisionError(null);
  }, []);

  const handleDismiss = useCallback(() => {
    if (provisioning) return;
    reset();
    props.onDismiss();
  }, [props, provisioning, reset]);

  const canSubmit = useMemo(() => {
    if (provisioning) return false;
    if (config.status !== "ready") return false;
    if (!config.value?.enabled) return false;
    if (!config.value?.dockerAvailable) return false;
    if (!config.value?.githubConnected) return false;
    if (selectedRepo.length === 0) return false;
    if (selectedBranch.length === 0) return false;
    if (title.trim().length === 0) return false;
    return true;
  }, [config, provisioning, selectedBranch, selectedRepo, title]);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setProvisioning(true);
    setProvisionError(null);
    try {
      const payload: CloudProvisionInput = {
        commandId: props.commandIdFactory() as CloudProvisionInput["commandId"],
        threadId: props.threadIdFactory() as CloudProvisionInput["threadId"],
        projectId: props.projectId as CloudProvisionInput["projectId"],
        title: title.trim() as CloudProvisionInput["title"],
        githubRepo: selectedRepo as CloudProvisionInput["githubRepo"],
        githubBranch: selectedBranch as CloudProvisionInput["githubBranch"],
        modelSelection: props.modelSelection,
        runtimeMode: "full-access",
        interactionMode: "default",
      };
      const result = await provisionCloudChat(payload);
      reset();
      props.onDismiss();
      props.onProvisioned(result.threadId);
    } catch (error) {
      setProvisionError(error instanceof Error ? error.message : String(error));
    } finally {
      setProvisioning(false);
    }
  }, [canSubmit, props, reset, selectedBranch, selectedRepo, title]);

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-md bg-background p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <CloudIcon size={18} />
            <h2 className="text-lg font-semibold">New Cloud chat</h2>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground"
            disabled={provisioning}
          >
            <XIcon size={16} />
          </button>
        </div>

        <p className="mt-2 text-sm text-muted-foreground">
          Spins up a Docker container on your server node, clones the selected GitHub branch, and
          starts an agent inside it. The container is destroyed when you end the chat.
        </p>

        {config.status === "loading" && (
          <p className="mt-4 flex items-center gap-2 text-sm">
            <LoaderIcon className="animate-spin" size={14} /> Checking Cloud env availability…
          </p>
        )}

        {config.status === "error" && (
          <p className="mt-4 text-sm text-destructive">{config.error}</p>
        )}

        {config.status === "ready" && config.value !== null && (
          <>
            {!config.value.enabled && (
              <p className="mt-4 text-sm text-destructive">
                Cloud env is disabled in this server node's config.
              </p>
            )}

            {config.value.enabled && !config.value.dockerAvailable && (
              <p className="mt-4 text-sm text-destructive">
                The Docker daemon isn't reachable. Ask the server-node operator to start Docker.
              </p>
            )}

            {config.value.enabled &&
              config.value.dockerAvailable &&
              !config.value.githubConnected && (
                <div className="mt-4 flex items-center gap-2 rounded-md border border-amber-600/40 bg-amber-600/10 p-3 text-sm">
                  <GithubIcon size={16} />
                  <span>Connect your GitHub account in Settings before starting a Cloud chat.</span>
                </div>
              )}

            {config.value.enabled &&
              config.value.dockerAvailable &&
              config.value.githubConnected && (
                <div className="mt-4 space-y-3">
                  <label className="block text-sm font-medium">
                    Repository
                    <select
                      className="mt-1 block w-full rounded-md border bg-background p-2 text-sm"
                      value={selectedRepo}
                      onChange={(event) => setSelectedRepo(event.target.value)}
                      disabled={repos.status !== "ready"}
                    >
                      {repos.status === "loading" && <option>Loading…</option>}
                      {repos.status === "ready" &&
                        (repos.value ?? []).map((repo) => (
                          <option key={repo.fullName} value={repo.fullName}>
                            {repo.fullName}
                            {repo.private ? " (private)" : ""}
                          </option>
                        ))}
                      {repos.status === "error" && <option>Failed to load repos</option>}
                    </select>
                    {repos.status === "error" && (
                      <span className="mt-1 block text-xs text-destructive">{repos.error}</span>
                    )}
                  </label>

                  <label className="block text-sm font-medium">
                    Branch
                    <select
                      className="mt-1 block w-full rounded-md border bg-background p-2 text-sm"
                      value={selectedBranch}
                      onChange={(event) => setSelectedBranch(event.target.value)}
                      disabled={branches.status !== "ready"}
                    >
                      {branches.status === "loading" && <option>Loading…</option>}
                      {branches.status === "ready" &&
                        (branches.value ?? []).map((branch) => (
                          <option key={branch.name} value={branch.name}>
                            {branch.name}
                            {branch.protected ? " (protected)" : ""}
                          </option>
                        ))}
                      {branches.status === "error" && <option>Failed to load branches</option>}
                    </select>
                    {branches.status === "error" && (
                      <span className="mt-1 block text-xs text-destructive">{branches.error}</span>
                    )}
                  </label>

                  <label className="block text-sm font-medium">
                    Chat title
                    <input
                      type="text"
                      className="mt-1 block w-full rounded-md border bg-background p-2 text-sm"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="e.g. Fix slow checkout flow"
                      maxLength={160}
                    />
                  </label>

                  <p className="text-xs text-muted-foreground">
                    Container caps: {config.value.containerCpuLimit} CPUs ·{" "}
                    {config.value.containerMemoryMb} MB RAM · {config.value.containerDiskGb} GB disk
                    · up to {config.value.containerMaxRuntimeHours}h runtime.
                  </p>
                </div>
              )}
          </>
        )}

        {provisionError !== null && (
          <p className="mt-3 text-sm text-destructive">{provisionError}</p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm"
            onClick={handleDismiss}
            disabled={provisioning}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
          >
            {provisioning && <LoaderIcon className="animate-spin" size={14} />}
            Start cloud chat
          </button>
        </div>
      </div>
    </div>
  );
}
