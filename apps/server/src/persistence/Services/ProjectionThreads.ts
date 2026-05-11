/**
 * ProjectionThreadRepository - Projection repository interface for threads.
 *
 * Owns persistence operations for projected thread records in the
 * orchestration read model.
 *
 * @module ProjectionThreadRepository
 */
import {
  DeviceId,
  IsoDateTime,
  ModelSelection,
  NonNegativeInt,
  OrchestratorConfig,
  ProjectId,
  ProviderInteractionMode,
  RuntimeMode,
  SessionMode,
  ThreadId,
  TurnId,
} from "@v3tools/contracts";
import { Option, Schema, Context } from "effect";
import type { Effect } from "effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProjectionThreadForkLineage = Schema.Struct({
  parentChatId: ThreadId,
  parentDeviceId: Schema.NullOr(DeviceId),
  forkedFromStreamVersion: NonNegativeInt,
  forkedAt: IsoDateTime,
});
export type ProjectionThreadForkLineage = typeof ProjectionThreadForkLineage.Type;

export const ProjectionThread = Schema.Struct({
  threadId: ThreadId,
  projectId: ProjectId,
  title: Schema.String,
  hostDeviceId: Schema.NullOr(DeviceId),
  modelSelection: ModelSelection,
  sessionMode: SessionMode,
  orchestratorConfig: Schema.NullOr(OrchestratorConfig),
  runtimeMode: RuntimeMode,
  interactionMode: ProviderInteractionMode,
  branch: Schema.NullOr(Schema.String),
  worktreePath: Schema.NullOr(Schema.String),
  latestTurnId: Schema.NullOr(TurnId),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  archivedAt: Schema.NullOr(IsoDateTime),
  latestUserMessageAt: Schema.NullOr(IsoDateTime),
  pendingApprovalCount: NonNegativeInt,
  pendingUserInputCount: NonNegativeInt,
  hasActionableProposedPlan: NonNegativeInt,
  lastStreamVersion: NonNegativeInt,
  deletedAt: Schema.NullOr(IsoDateTime),
});
export type ProjectionThread = typeof ProjectionThread.Type;

export const SetForkLineageInput = Schema.Struct({
  threadId: ThreadId,
  forkLineage: Schema.NullOr(ProjectionThreadForkLineage),
});
export type SetForkLineageInput = typeof SetForkLineageInput.Type;

export const GetForkLineageInput = Schema.Struct({
  threadId: ThreadId,
});
export type GetForkLineageInput = typeof GetForkLineageInput.Type;

export const GetProjectionThreadInput = Schema.Struct({
  threadId: ThreadId,
});
export type GetProjectionThreadInput = typeof GetProjectionThreadInput.Type;

export const DeleteProjectionThreadInput = Schema.Struct({
  threadId: ThreadId,
});
export type DeleteProjectionThreadInput = typeof DeleteProjectionThreadInput.Type;

export const ListProjectionThreadsByProjectInput = Schema.Struct({
  projectId: ProjectId,
});
export type ListProjectionThreadsByProjectInput = typeof ListProjectionThreadsByProjectInput.Type;

/**
 * ProjectionThreadRepositoryShape - Service API for projected thread records.
 */
export interface ProjectionThreadRepositoryShape {
  /**
   * Insert or replace a projected thread row.
   *
   * Upserts by `threadId`.
   */
  readonly upsert: (thread: ProjectionThread) => Effect.Effect<void, ProjectionRepositoryError>;

  /**
   * Read a projected thread row by id.
   */
  readonly getById: (
    input: GetProjectionThreadInput,
  ) => Effect.Effect<Option.Option<ProjectionThread>, ProjectionRepositoryError>;

  /**
   * List projected threads for a project.
   *
   * Returned in deterministic creation order.
   */
  readonly listByProjectId: (
    input: ListProjectionThreadsByProjectInput,
  ) => Effect.Effect<ReadonlyArray<ProjectionThread>, ProjectionRepositoryError>;

  /**
   * Soft-delete a projected thread row by id.
   */
  readonly deleteById: (
    input: DeleteProjectionThreadInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;

  /**
   * Persist (or clear) the fork lineage columns for a projected thread.
   *
   * Used by the `thread.forked` projector to tag a forked target thread with
   * its parent chat/device + the source stream version.
   */
  readonly setForkLineage: (
    input: SetForkLineageInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;

  /**
   * Read the fork lineage for a projected thread, if any.
   */
  readonly getForkLineage: (
    input: GetForkLineageInput,
  ) => Effect.Effect<Option.Option<ProjectionThreadForkLineage>, ProjectionRepositoryError>;
}

/**
 * ProjectionThreadRepository - Service tag for thread projection persistence.
 */
export class ProjectionThreadRepository extends Context.Service<
  ProjectionThreadRepository,
  ProjectionThreadRepositoryShape
>()("t3/persistence/Services/ProjectionThreads/ProjectionThreadRepository") {}
