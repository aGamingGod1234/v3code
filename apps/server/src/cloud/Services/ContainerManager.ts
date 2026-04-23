import type { AdminContainerInfo, ThreadId, UserId } from "@v3tools/contracts";
import { Context } from "effect";
import type { Effect, Option } from "effect";

import type { CloudError } from "../errors.ts";

export interface CloudWorkspaceMetadata {
  readonly threadId: ThreadId;
  readonly userId: UserId;
  readonly repoFullName: string;
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  readonly repoDir: string;
  readonly threadRoot: string;
  readonly tokenFile: string;
  readonly secretDir: string;
  readonly binDir: string;
  readonly gitUserName: string;
  readonly gitUserEmail: string;
  readonly containerName: string;
  readonly containerId: string | null;
  readonly createdAt: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly previewPort: number | null;
}

export interface CloudWorkspaceResult {
  readonly repoDir: string;
  readonly metadata: CloudWorkspaceMetadata;
}

export interface CloudLaunchSpec {
  readonly binaryPath: string;
  readonly cwd?: string;
}

export interface PreviewTarget {
  readonly origin: string;
}

export interface ContainerManagerShape {
  readonly dockerAvailable: () => Effect.Effect<boolean>;
  readonly isAvailable: () => Effect.Effect<boolean>;
  readonly getWorkspaceMetadata: (
    threadId: ThreadId,
  ) => Effect.Effect<Option.Option<CloudWorkspaceMetadata>, CloudError>;
  readonly createWorkspace: (input: {
    readonly threadId: ThreadId;
    readonly userId: UserId;
    readonly repoFullName: string;
    readonly branch: string;
    readonly gitUserName: string;
    readonly gitUserEmail: string;
    readonly accessToken: string;
    readonly createdAt: string;
  }) => Effect.Effect<CloudWorkspaceResult, CloudError>;
  readonly prepareProviderLaunch: (input: {
    readonly threadId: ThreadId;
    readonly provider: "codex" | "claudeAgent";
    readonly binaryPath: string;
    readonly cwd?: string;
  }) => Effect.Effect<CloudLaunchSpec, CloudError>;
  readonly resolvePreviewTarget: (
    threadId: ThreadId,
  ) => Effect.Effect<Option.Option<PreviewTarget>, CloudError>;
  readonly stopThreadEnvironment: (threadId: ThreadId) => Effect.Effect<void, CloudError>;
  readonly listContainers: () => Effect.Effect<ReadonlyArray<AdminContainerInfo>, CloudError>;
  readonly pruneExpired: () => Effect.Effect<void, CloudError>;
}

export class ContainerManager extends Context.Service<ContainerManager, ContainerManagerShape>()(
  "v3/cloud/Services/ContainerManager",
) {}
