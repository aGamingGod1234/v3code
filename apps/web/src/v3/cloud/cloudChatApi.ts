// V3 Phase 8 — Cloud-chat HTTP client (renderer-side).
//
// Thin wrapper around the server-node `/api/v3/cloud/*` endpoints that
// clone a GitHub repo into a per-chat Docker container and route the
// provider session through `docker exec`. The ContainerManager on the
// server owns every side-effect; the client just orchestrates UX.

import {
  CloudChatStatus,
  CloudCreateChatInput,
  CloudCreateChatResult,
  CloudEndChatResult,
  CloudGitHubBranchListResponse,
  CloudGitHubRepoListResponse,
  type ThreadId,
} from "@v3tools/contracts";
import { Schema } from "effect";

import { resolvePrimaryEnvironmentHttpUrl } from "../../environments/primary";

const jsonInit = (init?: RequestInit): RequestInit => ({
  credentials: "include",
  ...init,
});

const parseOrThrow = async <A, I>(
  response: Response,
  schema: Schema.Codec<A, I>,
  action: string,
): Promise<A> => {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      text.length > 0
        ? `${action} failed (${response.status}): ${text.slice(0, 240)}`
        : `${action} failed (${response.status})`,
    );
  }
  const body = await response.json();
  return Schema.decodeUnknownSync(schema)(body);
};

export const fetchCloudGitHubRepos = async (input: {
  readonly query?: string;
  readonly page?: number;
  readonly perPage?: number;
  readonly signal?: AbortSignal;
}) => {
  const params = new URLSearchParams();
  if (input.query) params.set("query", input.query);
  if (input.page !== undefined) params.set("page", String(input.page));
  if (input.perPage !== undefined) params.set("perPage", String(input.perPage));
  const response = await fetch(
    resolvePrimaryEnvironmentHttpUrl(`/api/v3/cloud/github/repos?${params.toString()}`),
    jsonInit(input.signal ? { signal: input.signal } : undefined),
  );
  return parseOrThrow(response, CloudGitHubRepoListResponse, "cloud repos list");
};

export const fetchCloudGitHubBranches = async (input: {
  readonly repoFullName: string;
  readonly page?: number;
  readonly perPage?: number;
  readonly signal?: AbortSignal;
}) => {
  const params = new URLSearchParams({ repoFullName: input.repoFullName });
  if (input.page !== undefined) params.set("page", String(input.page));
  if (input.perPage !== undefined) params.set("perPage", String(input.perPage));
  const response = await fetch(
    resolvePrimaryEnvironmentHttpUrl(`/api/v3/cloud/github/branches?${params.toString()}`),
    jsonInit(input.signal ? { signal: input.signal } : undefined),
  );
  return parseOrThrow(response, CloudGitHubBranchListResponse, "cloud branches list");
};

export const createCloudChat = async (
  payload: CloudCreateChatInput,
): Promise<CloudCreateChatResult> => {
  const response = await fetch(
    resolvePrimaryEnvironmentHttpUrl("/api/v3/cloud/chats"),
    jsonInit({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Schema.encodeSync(CloudCreateChatInput)(payload)),
    }),
  );
  return parseOrThrow(response, CloudCreateChatResult, "cloud chat create");
};

export const fetchCloudChatStatus = async (
  threadId: ThreadId,
  signal?: AbortSignal,
): Promise<CloudChatStatus> => {
  const params = new URLSearchParams({ threadId });
  const response = await fetch(
    resolvePrimaryEnvironmentHttpUrl(`/api/v3/cloud/chat?${params.toString()}`),
    jsonInit(signal ? { signal } : undefined),
  );
  return parseOrThrow(response, CloudChatStatus, "cloud chat status");
};

export const endCloudChat = async (threadId: ThreadId): Promise<CloudEndChatResult> => {
  const response = await fetch(
    resolvePrimaryEnvironmentHttpUrl("/api/v3/cloud/chat/end"),
    jsonInit({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId }),
    }),
  );
  return parseOrThrow(response, CloudEndChatResult, "cloud chat end");
};
