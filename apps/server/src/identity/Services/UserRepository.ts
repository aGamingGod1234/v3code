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

// V3 Phase 1e — persist an AES-256-GCM encrypted GitHub access token.
// Called by `identity/http.ts` after exchanging the OAuth code and
// fetching the user profile. The token lives in `v3_users` in three
// separate BLOB columns (`github_access_token_enc`, `github_token_enc_iv`,
// plus a tag appended to the ciphertext), and the `github_username` is
// stored alongside so the UI can show the connected account.
export const SetGitHubTokenInput = Schema.Struct({
  userId: UserId,
  githubUsername: TrimmedNonEmptyString,
  githubAccessTokenEnc: Schema.Uint8Array,
  githubTokenEncIv: Schema.Uint8Array,
  githubScopes: Schema.String, // comma-joined list, matches GitHub's Scope header
  now: Schema.DateTimeUtcFromString,
});
export type SetGitHubTokenInput = typeof SetGitHubTokenInput.Type;

export const ClearGitHubTokenInput = Schema.Struct({
  userId: UserId,
  now: Schema.DateTimeUtcFromString,
});
export type ClearGitHubTokenInput = typeof ClearGitHubTokenInput.Type;

export const GitHubTokenRecord = Schema.Struct({
  userId: UserId,
  githubUsername: TrimmedNonEmptyString,
  githubAccessTokenEnc: Schema.Uint8Array,
  githubTokenEncIv: Schema.Uint8Array,
  githubScopes: Schema.String,
  connectedAt: Schema.DateTimeUtcFromString,
});
export type GitHubTokenRecord = typeof GitHubTokenRecord.Type;

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
  readonly setGitHubToken: (input: SetGitHubTokenInput) => Effect.Effect<void, UserRepositoryError>;
  readonly clearGitHubToken: (
    input: ClearGitHubTokenInput,
  ) => Effect.Effect<void, UserRepositoryError>;
  readonly getGitHubToken: (
    input: GetUserByIdInput,
  ) => Effect.Effect<Option.Option<GitHubTokenRecord>, UserRepositoryError>;
}

export class UserRepository extends Context.Service<UserRepository, UserRepositoryShape>()(
  "v3/identity/Services/UserRepository",
) {}
