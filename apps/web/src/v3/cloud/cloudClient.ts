// V3 Phase 8 — renderer-side client for the /api/v3/cloud/* HTTP
// surface. Thin wrapper around `fetch` + schema decoding; the UI
// components consume these promises directly.
//
// Conventions match the P1e GitHub connect client:
//   - All requests go through `resolvePrimaryEnvironmentHttpUrl` so
//     they land on the correct origin (Electron vs dev server vs
//     cloud bundle).
//   - Every response is decoded with the canonical contract schema.
//   - 404 responses on `/config` collapse to "feature off" so the UI
//     can hide the "Cloud" host option without a special flag path.

import {
  CloudContainerInfo,
  CloudContainerListResult,
  CloudEndChatInput,
  CloudEndChatResult,
  CloudGitHubBranchListResult,
  CloudGitHubBranchSummary,
  CloudGitHubRepoListResult,
  CloudGitHubRepoSummary,
  CloudProvisionInput,
  CloudProvisionResult,
  CloudPublicConfig,
} from "@v3tools/contracts";
import { Schema } from "effect";

import { resolvePrimaryEnvironmentHttpUrl } from "../../environments/primary";

const defaultInit = (signal?: AbortSignal): RequestInit => ({
  credentials: "include",
  ...(signal ? { signal } : {}),
});

export const fetchCloudConfig = async (signal?: AbortSignal): Promise<CloudPublicConfig | null> => {
  const response = await fetch(
    resolvePrimaryEnvironmentHttpUrl("/api/v3/cloud/config"),
    defaultInit(signal),
  );
  // `not-enabled` surfaces as 403 from the server; the UI should hide
  // the Cloud host option entirely rather than show an error.
  if (response.status === 403 || response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`cloud config request failed (status ${response.status})`);
  }
  return Schema.decodeUnknownSync(CloudPublicConfig)(await response.json());
};

export const fetchCloudRepos = async (
  signal?: AbortSignal,
): Promise<ReadonlyArray<CloudGitHubRepoSummary>> => {
  const response = await fetch(
    resolvePrimaryEnvironmentHttpUrl("/api/v3/cloud/repos"),
    defaultInit(signal),
  );
  if (!response.ok) {
    throw new Error(`cloud repos request failed (status ${response.status})`);
  }
  const body = Schema.decodeUnknownSync(CloudGitHubRepoListResult)(await response.json());
  return body.repos;
};

export const fetchCloudBranches = async (
  repo: string,
  signal?: AbortSignal,
): Promise<ReadonlyArray<CloudGitHubBranchSummary>> => {
  const url = `${resolvePrimaryEnvironmentHttpUrl("/api/v3/cloud/branches")}?repo=${encodeURIComponent(repo)}`;
  const response = await fetch(url, defaultInit(signal));
  if (!response.ok) {
    throw new Error(`cloud branches request failed (status ${response.status})`);
  }
  const body = Schema.decodeUnknownSync(CloudGitHubBranchListResult)(await response.json());
  return body.branches;
};

export interface CloudContainersSnapshot {
  readonly containers: ReadonlyArray<CloudContainerInfo>;
  readonly enabled: boolean;
  readonly dockerAvailable: boolean;
}

export const fetchCloudContainers = async (options?: {
  readonly includeEnded?: boolean;
  readonly signal?: AbortSignal;
}): Promise<CloudContainersSnapshot> => {
  const params = options?.includeEnded === true ? "?include_ended=true" : "";
  const response = await fetch(
    `${resolvePrimaryEnvironmentHttpUrl("/api/v3/cloud/containers")}${params}`,
    defaultInit(options?.signal),
  );
  if (!response.ok) {
    throw new Error(`cloud containers request failed (status ${response.status})`);
  }
  const body = Schema.decodeUnknownSync(CloudContainerListResult)(await response.json());
  return body;
};

export const provisionCloudChat = async (
  input: CloudProvisionInput,
): Promise<CloudProvisionResult> => {
  const response = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/v3/cloud/provision"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Schema.encodeSync(CloudProvisionInput)(input)),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`cloud provision failed (status ${response.status}): ${text.slice(0, 300)}`);
  }
  return Schema.decodeUnknownSync(CloudProvisionResult)(await response.json());
};

export const endCloudChat = async (input: CloudEndChatInput): Promise<CloudEndChatResult> => {
  const response = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/v3/cloud/end"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Schema.encodeSync(CloudEndChatInput)(input)),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`cloud end-chat failed (status ${response.status}): ${text.slice(0, 300)}`);
  }
  return Schema.decodeUnknownSync(CloudEndChatResult)(await response.json());
};
