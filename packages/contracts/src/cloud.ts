import { Schema } from "effect";

import { ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { DeviceId } from "./identity.ts";

export const GitHubRepoSummary = Schema.Struct({
  id: Schema.Int,
  name: TrimmedNonEmptyString,
  fullName: TrimmedNonEmptyString,
  owner: TrimmedNonEmptyString,
  private: Schema.Boolean,
  defaultBranch: TrimmedNonEmptyString,
  description: Schema.NullOr(Schema.String),
  updatedAt: TrimmedNonEmptyString,
  htmlUrl: TrimmedNonEmptyString,
  language: Schema.NullOr(Schema.String),
});
export type GitHubRepoSummary = typeof GitHubRepoSummary.Type;

export const GitHubBranchSummary = Schema.Struct({
  name: TrimmedNonEmptyString,
  commitSha: TrimmedNonEmptyString,
  protected: Schema.Boolean,
});
export type GitHubBranchSummary = typeof GitHubBranchSummary.Type;

export const CloudGitHubRepoListResponse = Schema.Struct({
  repos: Schema.Array(GitHubRepoSummary),
  hasMore: Schema.Boolean,
  nextPage: Schema.Int,
});
export type CloudGitHubRepoListResponse = typeof CloudGitHubRepoListResponse.Type;

export const CloudGitHubBranchListResponse = Schema.Struct({
  branches: Schema.Array(GitHubBranchSummary),
  hasMore: Schema.Boolean,
  nextPage: Schema.Int,
});
export type CloudGitHubBranchListResponse = typeof CloudGitHubBranchListResponse.Type;

export const CloudCreateChatInput = Schema.Struct({
  repoFullName: TrimmedNonEmptyString.check(Schema.isPattern(/^[^/\s]+\/[^/\s]+$/)),
  branch: TrimmedNonEmptyString,
  title: Schema.optionalKey(TrimmedNonEmptyString),
});
export type CloudCreateChatInput = typeof CloudCreateChatInput.Type;

export const CloudCreateChatResult = Schema.Struct({
  projectId: ProjectId,
  threadId: ThreadId,
  projectTitle: TrimmedNonEmptyString,
  threadTitle: TrimmedNonEmptyString,
  worktreePath: TrimmedNonEmptyString,
  hostDeviceId: Schema.NullOr(DeviceId),
  repoFullName: TrimmedNonEmptyString,
  branch: TrimmedNonEmptyString,
});
export type CloudCreateChatResult = typeof CloudCreateChatResult.Type;

export const CloudChatStatus = Schema.Struct({
  threadId: ThreadId,
  repoFullName: TrimmedNonEmptyString,
  branch: TrimmedNonEmptyString,
  status: Schema.Literals(["starting", "running", "stopping", "dead", "ended"]),
  previewUrl: Schema.NullOr(TrimmedNonEmptyString),
  startedAt: TrimmedNonEmptyString,
  endedAt: Schema.NullOr(TrimmedNonEmptyString),
  uptimeSeconds: Schema.Int,
  cpuCount: Schema.Int,
  memoryMb: Schema.Int,
});
export type CloudChatStatus = typeof CloudChatStatus.Type;

export const CloudChatStatusInput = Schema.Struct({
  threadId: ThreadId,
});
export type CloudChatStatusInput = typeof CloudChatStatusInput.Type;

export const CloudEndChatInput = Schema.Struct({
  threadId: ThreadId,
});
export type CloudEndChatInput = typeof CloudEndChatInput.Type;

export const CloudEndChatResult = Schema.Struct({
  threadId: ThreadId,
  ended: Schema.Boolean,
});
export type CloudEndChatResult = typeof CloudEndChatResult.Type;
