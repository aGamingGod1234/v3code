import { Context, Schema } from "effect";
import type { Effect } from "effect";

import {
  CloudContainerInfo,
  CloudEndChatInput,
  CloudEndChatResult,
  CloudGitHubBranchSummary,
  CloudGitHubRepoSummary,
  CloudProvisionInput,
  CloudProvisionResult,
  DeviceId,
  ThreadId,
  UserId,
} from "@v3tools/contracts";

import { CloudEnvError } from "../Errors.ts";

// V3 Phase 8 — the surface every caller outside the cloud package
// goes through. HTTP routes in `cloud/http.ts`, the admin panel, and
// the startup reaper all consume this.
//
// The interface is split along clear responsibilities:
//
//   - `provision`           : boot a container + create the chat row
//   - `end`                 : tear down the container + mark chat dead
//   - `listContainersForUser`: sidebar / admin / list view
//   - `getContainerForChat` : chat status strip
//   - `listRepos / listBranches` : powers the new-chat repo picker
//   - `getPublicConfig`     : feature flags + resource caps for the UI
//   - `syncWithDocker`      : reconcile DB with live docker ps (reaper)

export interface CloudEnvServiceShape {
  readonly provision: (
    input: CloudProvisionInput,
    actor: CloudEnvActor,
  ) => Effect.Effect<CloudProvisionResult, CloudEnvError>;

  readonly end: (
    input: CloudEndChatInput,
    actor: CloudEnvActor,
  ) => Effect.Effect<CloudEndChatResult, CloudEnvError>;

  readonly getContainerForChat: (
    chatId: ThreadId,
  ) => Effect.Effect<CloudContainerInfo | null, CloudEnvError>;

  readonly listContainersForUser: (
    userId: UserId,
    options?: { readonly includeEnded?: boolean },
  ) => Effect.Effect<ReadonlyArray<CloudContainerInfo>, CloudEnvError>;

  readonly listAllContainers: Effect.Effect<ReadonlyArray<CloudContainerInfo>, CloudEnvError>;

  readonly listRepos: (
    actor: CloudEnvActor,
  ) => Effect.Effect<ReadonlyArray<CloudGitHubRepoSummary>, CloudEnvError>;

  readonly listBranches: (
    actor: CloudEnvActor,
    repo: string,
  ) => Effect.Effect<ReadonlyArray<CloudGitHubBranchSummary>, CloudEnvError>;

  readonly getPublicConfig: (
    actor: CloudEnvActor,
  ) => Effect.Effect<CloudPublicConfigView, CloudEnvError>;

  // Best-effort reconciliation. Called on server startup + periodically
  // from a background fiber. Reaps containers docker says are gone but
  // we still have rows for, and clamps long-running containers past
  // the configured runtime ceiling.
  readonly syncWithDocker: Effect.Effect<void, CloudEnvError>;
}

// Small carrier for the authenticated caller — every provisioning
// operation is user-scoped. The device id is the "source" device (the
// laptop/desktop that clicked "New Cloud chat"), NOT the new cloud
// device itself.
export const CloudEnvActor = Schema.Struct({
  userId: Schema.String,
  sourceDeviceId: Schema.NullOr(Schema.String),
});
export type CloudEnvActor = {
  readonly userId: UserId;
  readonly sourceDeviceId: DeviceId | null;
};

export interface CloudPublicConfigView {
  readonly enabled: boolean;
  readonly dockerAvailable: boolean;
  readonly githubConnected: boolean;
  readonly baseImage: string;
  readonly maxContainers: number;
  readonly containerCpuLimit: number;
  readonly containerMemoryMb: number;
  readonly containerDiskGb: number;
  readonly containerMaxRuntimeHours: number;
}

export class CloudEnvService extends Context.Service<CloudEnvService, CloudEnvServiceShape>()(
  "v3/cloud/Services/CloudEnvService",
) {}
