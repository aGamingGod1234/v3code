import { Context, Option, Schema } from "effect";
import type { Effect } from "effect";

import {
  CloudContainerStatus,
  NonNegativeInt,
  ThreadId,
  TrimmedNonEmptyString,
  UserId,
} from "@v3tools/contracts";

import type { PersistenceDecodeError, PersistenceSqlError } from "../../persistence/Errors.ts";

// V3 Phase 8 — persistence shape for the `v3_cloud_containers` table
// introduced in migration 031.
//
// The repository is intentionally thin: raw CRUD + a couple of
// "active" queries that power the admin panel and the startup
// reaper. Business logic (GitHub cloning, container lifecycle) lives
// in `CloudEnvService`.

export type CloudContainerRepositoryError = PersistenceSqlError | PersistenceDecodeError;

export const CloudContainerRecord = Schema.Struct({
  chatId: ThreadId,
  userId: UserId,
  containerId: TrimmedNonEmptyString,
  image: TrimmedNonEmptyString,
  githubRepo: Schema.NullOr(TrimmedNonEmptyString),
  githubBranch: Schema.NullOr(TrimmedNonEmptyString),
  status: CloudContainerStatus,
  statusMessage: Schema.NullOr(Schema.String),
  cpuLimit: NonNegativeInt,
  memoryMb: NonNegativeInt,
  diskGb: NonNegativeInt,
  startedAt: Schema.DateTimeUtcFromString,
  readyAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  endedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  lastCheckedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
});
export type CloudContainerRecord = typeof CloudContainerRecord.Type;

export const UpsertCloudContainerInput = Schema.Struct({
  chatId: ThreadId,
  userId: UserId,
  containerId: TrimmedNonEmptyString,
  image: TrimmedNonEmptyString,
  githubRepo: Schema.NullOr(TrimmedNonEmptyString),
  githubBranch: Schema.NullOr(TrimmedNonEmptyString),
  status: CloudContainerStatus,
  statusMessage: Schema.NullOr(Schema.String),
  cpuLimit: NonNegativeInt,
  memoryMb: NonNegativeInt,
  diskGb: NonNegativeInt,
  startedAt: Schema.DateTimeUtcFromString,
});
export type UpsertCloudContainerInput = typeof UpsertCloudContainerInput.Type;

export const UpdateStatusInput = Schema.Struct({
  chatId: ThreadId,
  status: CloudContainerStatus,
  statusMessage: Schema.optionalKey(Schema.NullOr(Schema.String)),
  readyAt: Schema.optionalKey(Schema.NullOr(Schema.DateTimeUtcFromString)),
  endedAt: Schema.optionalKey(Schema.NullOr(Schema.DateTimeUtcFromString)),
  lastCheckedAt: Schema.DateTimeUtcFromString,
});
export type UpdateStatusInput = typeof UpdateStatusInput.Type;

export const GetByChatInput = Schema.Struct({ chatId: ThreadId });
export type GetByChatInput = typeof GetByChatInput.Type;

export const ListForUserInput = Schema.Struct({
  userId: UserId,
  includeEnded: Schema.optionalKey(Schema.Boolean),
});
export type ListForUserInput = typeof ListForUserInput.Type;

export interface CloudContainerRepositoryShape {
  readonly upsert: (
    input: UpsertCloudContainerInput,
  ) => Effect.Effect<CloudContainerRecord, CloudContainerRepositoryError>;
  readonly updateStatus: (
    input: UpdateStatusInput,
  ) => Effect.Effect<CloudContainerRecord, CloudContainerRepositoryError>;
  readonly getByChat: (
    input: GetByChatInput,
  ) => Effect.Effect<Option.Option<CloudContainerRecord>, CloudContainerRepositoryError>;
  readonly listForUser: (
    input: ListForUserInput,
  ) => Effect.Effect<ReadonlyArray<CloudContainerRecord>, CloudContainerRepositoryError>;
  // Returns every row where status is not terminal — used by the
  // startup reaper to reconcile with the actual Docker daemon state.
  readonly listActive: Effect.Effect<
    ReadonlyArray<CloudContainerRecord>,
    CloudContainerRepositoryError
  >;
}

export class CloudContainerRepository extends Context.Service<
  CloudContainerRepository,
  CloudContainerRepositoryShape
>()("v3/cloud/Services/CloudContainerRepository") {}
