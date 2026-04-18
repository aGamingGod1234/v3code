import { GoogleSub, TrimmedNonEmptyString, UserId } from "@v3tools/contracts";
import { Context, Option, Schema } from "effect";
import type { Effect } from "effect";

import type { UserRepositoryError } from "../Errors.ts";

// User record as stored. Field names are camelCase on the TS side, snake_case
// in the SQLite row; the Layer does the translation.
export const UserRecord = Schema.Struct({
  id: UserId,
  googleSub: GoogleSub,
  email: TrimmedNonEmptyString,
  displayName: Schema.NullOr(Schema.String),
  avatarUrl: Schema.NullOr(Schema.String),
  githubUsername: Schema.NullOr(Schema.String),
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
});
export type UserRecord = typeof UserRecord.Type;

export const UpsertFromGoogleInput = Schema.Struct({
  id: UserId,
  googleSub: GoogleSub,
  email: TrimmedNonEmptyString,
  displayName: Schema.NullOr(Schema.String),
  avatarUrl: Schema.NullOr(Schema.String),
  now: Schema.DateTimeUtcFromString,
});
export type UpsertFromGoogleInput = typeof UpsertFromGoogleInput.Type;

export const GetUserByGoogleSubInput = Schema.Struct({ googleSub: GoogleSub });
export type GetUserByGoogleSubInput = typeof GetUserByGoogleSubInput.Type;

export const GetUserByIdInput = Schema.Struct({ id: UserId });
export type GetUserByIdInput = typeof GetUserByIdInput.Type;

export interface UserRepositoryShape {
  readonly upsertFromGoogle: (
    input: UpsertFromGoogleInput,
  ) => Effect.Effect<UserRecord, UserRepositoryError>;
  readonly getByGoogleSub: (
    input: GetUserByGoogleSubInput,
  ) => Effect.Effect<Option.Option<UserRecord>, UserRepositoryError>;
  readonly getById: (
    input: GetUserByIdInput,
  ) => Effect.Effect<Option.Option<UserRecord>, UserRepositoryError>;
}

export class UserRepository extends Context.Service<UserRepository, UserRepositoryShape>()(
  "v3/identity/Services/UserRepository",
) {}
