// V3 Phase 8 — Cloud env contracts.
//
// The Cloud env is a server-node-hosted Docker runtime that appears to
// every user as a single synthetic device called "Cloud". When the
// user asks to start a chat on Cloud, the server node boots an
// ephemeral container, clones their chosen GitHub repo + branch into
// it, and wires the container's provider process back through the
// normal mesh chat plumbing.
//
// The contracts here cover the HTTP + WS surface the web UI talks to.
// The actual Docker-side orchestration lives entirely on the server
// node — client devices never touch Docker.
//
// Design notes:
//
//   - `CloudDeviceId` is deterministic per user (`cloud:<userId>`).
//     That lets a device list always surface a single "Cloud" entry
//     without separate provisioning steps — the cloud device row is
//     created the first time a user is upserted.
//
//   - Container state lives in `cloud_containers` on the server node
//     (migration 031). Per spec §4.4 there are no persistent volumes.
//     Uncommitted work is lost when a chat ends.
//
//   - The container status state machine is intentionally narrow so
//     the UI can render a single status badge without branching:
//
//       starting → cloning → ready → running → stopping → dead
//                                             └→ error ─┘

import { Schema } from "effect";

import {
  CommandId,
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";
import { DeviceId, UserId } from "./identity.ts";
import { ModelSelection, ProviderInteractionMode, RuntimeMode } from "./orchestration.ts";

// ---------------------------------------------------------------------------
// Cloud device
// ---------------------------------------------------------------------------

// The synthetic "Cloud" device name surfaced in every device list. Kept
// as a constant so client + server stay in lock-step on the label.
export const CLOUD_DEVICE_NAME = "Cloud";

// Deterministic per-user cloud device id. Used by `CloudDeviceBootstrap`
// on the server node and by the web UI when it needs to look up the
// cloud device without hitting the devices list.
export const makeCloudDeviceId = (userId: UserId): DeviceId => `cloud:${userId}` as DeviceId;

// ---------------------------------------------------------------------------
// Container status
// ---------------------------------------------------------------------------

// Narrow status enum surfaced to clients. Servers may track richer
// internal state but downgrade to these buckets before responding.
export const CloudContainerStatus = Schema.Literals([
  "starting", // docker create issued, no container id yet
  "cloning", // container running, `git clone` in flight
  "ready", // clone finished, provider process being started
  "running", // provider process attached, chat active
  "stopping", // docker stop issued, cleanup in flight
  "dead", // container removed, chat ended cleanly
  "error", // something failed mid-lifecycle; see statusMessage
]);
export type CloudContainerStatus = typeof CloudContainerStatus.Type;

// ---------------------------------------------------------------------------
// Container info
// ---------------------------------------------------------------------------

export const CloudContainerInfo = Schema.Struct({
  // Thread this container backs. One-to-one: ending the chat removes
  // the container.
  chatId: ThreadId,
  // Server-node-assigned opaque container handle. For the docker-CLI
  // runtime this is the first 12 chars of the Docker container id.
  containerId: TrimmedNonEmptyString,
  // Full Docker image reference (e.g. `ghcr.io/v3-code/cloud-env:latest`).
  image: TrimmedNonEmptyString,
  status: CloudContainerStatus,
  // Human-readable explanation of the current status. Populated for
  // terminal states (`error`, `dead`) and for long-running phases
  // (`cloning` → "Cloning agaminggod/v3code…").
  statusMessage: Schema.NullOr(Schema.String),
  // GitHub repo selection that was used for this chat. `null` allowed
  // for forward-compat with future "no-clone" container flavours.
  githubRepo: Schema.NullOr(TrimmedNonEmptyString),
  githubBranch: Schema.NullOr(TrimmedNonEmptyString),
  cpuLimit: NonNegativeInt,
  memoryMb: NonNegativeInt,
  diskGb: NonNegativeInt,
  startedAt: IsoDateTime,
  readyAt: Schema.NullOr(IsoDateTime),
  endedAt: Schema.NullOr(IsoDateTime),
});
export type CloudContainerInfo = typeof CloudContainerInfo.Type;

// ---------------------------------------------------------------------------
// Provision
// ---------------------------------------------------------------------------

// POST /api/v3/cloud/provision — kick off a fresh cloud chat.
// `commandId` is idempotent (duplicated requests resolve to the same
// chat). `threadId` is the client-generated UUID that the chat will
// ultimately live at — same convention the rest of orchestration uses
// so the SPA can optimistically navigate before the server responds.
export const CloudProvisionInput = Schema.Struct({
  commandId: CommandId,
  threadId: ThreadId,
  projectId: ProjectId,
  title: TrimmedNonEmptyString,
  githubRepo: TrimmedNonEmptyString,
  githubBranch: TrimmedNonEmptyString,
  modelSelection: ModelSelection,
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
});
export type CloudProvisionInput = typeof CloudProvisionInput.Type;

export const CloudProvisionResult = Schema.Struct({
  threadId: ThreadId,
  hostDeviceId: DeviceId,
  container: CloudContainerInfo,
});
export type CloudProvisionResult = typeof CloudProvisionResult.Type;

// ---------------------------------------------------------------------------
// End chat
// ---------------------------------------------------------------------------

export const CloudEndChatInput = Schema.Struct({
  chatId: ThreadId,
  commandId: CommandId,
});
export type CloudEndChatInput = typeof CloudEndChatInput.Type;

export const CloudEndChatResult = Schema.Struct({
  chatId: ThreadId,
  status: CloudContainerStatus, // expected: 'stopping' or 'dead'
});
export type CloudEndChatResult = typeof CloudEndChatResult.Type;

// ---------------------------------------------------------------------------
// List / status
// ---------------------------------------------------------------------------

export const CloudContainerListResult = Schema.Struct({
  containers: Schema.Array(CloudContainerInfo),
  enabled: Schema.Boolean,
  dockerAvailable: Schema.Boolean,
});
export type CloudContainerListResult = typeof CloudContainerListResult.Type;

// ---------------------------------------------------------------------------
// GitHub repo / branch browsing (P8 requires this for the create
// dialog; reuses the stored per-user GitHub access token server-side).
// ---------------------------------------------------------------------------

export const CloudGitHubRepoSummary = Schema.Struct({
  fullName: TrimmedNonEmptyString, // "owner/name"
  description: Schema.NullOr(Schema.String),
  defaultBranch: TrimmedNonEmptyString,
  private: Schema.Boolean,
  pushedAt: Schema.NullOr(IsoDateTime),
});
export type CloudGitHubRepoSummary = typeof CloudGitHubRepoSummary.Type;

export const CloudGitHubRepoListResult = Schema.Struct({
  repos: Schema.Array(CloudGitHubRepoSummary),
});
export type CloudGitHubRepoListResult = typeof CloudGitHubRepoListResult.Type;

export const CloudGitHubBranchSummary = Schema.Struct({
  name: TrimmedNonEmptyString,
  protected: Schema.Boolean,
});
export type CloudGitHubBranchSummary = typeof CloudGitHubBranchSummary.Type;

export const CloudGitHubBranchListResult = Schema.Struct({
  branches: Schema.Array(CloudGitHubBranchSummary),
});
export type CloudGitHubBranchListResult = typeof CloudGitHubBranchListResult.Type;

// ---------------------------------------------------------------------------
// Public config
// ---------------------------------------------------------------------------

// GET /api/v3/cloud/config — shape what the client needs to decide
// whether to offer the "Cloud" host option in the new-chat dialog.
// `enabled` means the operator has turned cloud_env on in config.toml;
// `dockerAvailable` means the Docker daemon is actually reachable from
// the server node right now. The UI surfaces a disabled tooltip based
// on which bit is false.
export const CloudPublicConfig = Schema.Struct({
  enabled: Schema.Boolean,
  dockerAvailable: Schema.Boolean,
  githubConnected: Schema.Boolean,
  baseImage: TrimmedNonEmptyString,
  maxContainers: NonNegativeInt,
  containerCpuLimit: NonNegativeInt,
  containerMemoryMb: NonNegativeInt,
  containerDiskGb: NonNegativeInt,
  containerMaxRuntimeHours: NonNegativeInt,
});
export type CloudPublicConfig = typeof CloudPublicConfig.Type;
