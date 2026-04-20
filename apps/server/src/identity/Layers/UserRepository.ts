import { GoogleSub, TrimmedNonEmptyString, UserId } from "@v3tools/contracts";
import { Effect, Layer, Option, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import {
  toPersistenceDecodeError,
  toPersistenceSqlError,
  type PersistenceDecodeError,
  type PersistenceSqlError,
} from "../../persistence/Errors.ts";
import {
  ClearGitHubTokenInput,
  GetUserByGoogleSubInput,
  GetUserByIdInput,
  GitHubTokenRecord,
  SetGitHubTokenInput,
  UpsertFromGoogleInput,
  UserRecord,
  UserRepository,
  type UserRepositoryShape,
} from "../Services/UserRepository.ts";

const UserDbRow = Schema.Struct({
  id: UserId,
  googleSub: GoogleSub,
  email: TrimmedNonEmptyString,
  displayName: Schema.NullOr(Schema.String),
  avatarUrl: Schema.NullOr(Schema.String),
  githubUsername: Schema.NullOr(Schema.String),
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
});

const toUserRecord = (row: typeof UserDbRow.Type): UserRecord => row;

const mapErr =
  (sqlOperation: string, decodeOperation: string) =>
  (cause: unknown): PersistenceSqlError | PersistenceDecodeError =>
    Schema.isSchemaError(cause)
      ? toPersistenceDecodeError(decodeOperation)(cause)
      : toPersistenceSqlError(sqlOperation)(cause);

const makeUserRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertRows = SqlSchema.findAll({
    Request: UpsertFromGoogleInput,
    Result: UserDbRow,
    execute: (input) =>
      sql`
        INSERT INTO v3_users (
          id,
          google_sub,
          email,
          display_name,
          avatar_url,
          github_access_token_enc,
          github_token_enc_iv,
          github_token_enc_auth_tag,
          github_username,
          created_at,
          updated_at
        ) VALUES (
          ${input.id},
          ${input.googleSub},
          ${input.email},
          ${input.displayName},
          ${input.avatarUrl},
          NULL, NULL, NULL, NULL,
          ${input.now},
          ${input.now}
        )
        ON CONFLICT(google_sub) DO UPDATE SET
          email = excluded.email,
          display_name = excluded.display_name,
          avatar_url = excluded.avatar_url,
          updated_at = excluded.updated_at
        RETURNING
          id AS "id",
          google_sub AS "googleSub",
          email AS "email",
          display_name AS "displayName",
          avatar_url AS "avatarUrl",
          github_username AS "githubUsername",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
      `,
  });

  const selectByGoogleSub = SqlSchema.findOneOption({
    Request: GetUserByGoogleSubInput,
    Result: UserDbRow,
    execute: ({ googleSub }) =>
      sql`
        SELECT
          id AS "id",
          google_sub AS "googleSub",
          email AS "email",
          display_name AS "displayName",
          avatar_url AS "avatarUrl",
          github_username AS "githubUsername",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM v3_users
        WHERE google_sub = ${googleSub}
      `,
  });

  const selectById = SqlSchema.findOneOption({
    Request: GetUserByIdInput,
    Result: UserDbRow,
    execute: ({ id }) =>
      sql`
        SELECT
          id AS "id",
          google_sub AS "googleSub",
          email AS "email",
          display_name AS "displayName",
          avatar_url AS "avatarUrl",
          github_username AS "githubUsername",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM v3_users
        WHERE id = ${id}
      `,
  });

  const upsertFromGoogle: UserRepositoryShape["upsertFromGoogle"] = (input) =>
    upsertRows(input).pipe(
      Effect.mapError(
        mapErr("UserRepository.upsertFromGoogle:query", "UserRepository.upsertFromGoogle:decode"),
      ),
      Effect.flatMap((rows) => {
        const first = rows[0];
        return first === undefined
          ? Effect.fail(
              toPersistenceSqlError("UserRepository.upsertFromGoogle:missing-returning")(
                new Error("INSERT ... RETURNING produced no row"),
              ),
            )
          : Effect.succeed(toUserRecord(first));
      }),
    );

  const getByGoogleSub: UserRepositoryShape["getByGoogleSub"] = (input) =>
    selectByGoogleSub(input).pipe(
      Effect.mapError(
        mapErr("UserRepository.getByGoogleSub:query", "UserRepository.getByGoogleSub:decode"),
      ),
      Effect.map((opt) => Option.map(opt, toUserRecord)),
    );

  const getById: UserRepositoryShape["getById"] = (input) =>
    selectById(input).pipe(
      Effect.mapError(mapErr("UserRepository.getById:query", "UserRepository.getById:decode")),
      Effect.map((opt) => Option.map(opt, toUserRecord)),
    );

  // V3 Phase 1e — GitHub token persistence.
  //
  // `setGitHubToken` writes the AES-GCM blobs + scopes + connected_at.
  // `clearGitHubToken` nulls the same columns back out. `getGitHubToken`
  // loads the blob row for the currently signed-in user so callers can
  // decrypt it when they need to call the GitHub API server-side (e.g.
  // P8 Cloud env container token minting).
  const GitHubTokenDbRow = Schema.Struct({
    userId: UserId,
    githubUsername: TrimmedNonEmptyString,
    githubAccessTokenEnc: Schema.Uint8Array,
    githubTokenEncIv: Schema.Uint8Array,
    githubScopes: Schema.String,
    connectedAt: Schema.DateTimeUtcFromString,
  });

  const updateGitHubTokenRow = SqlSchema.findAll({
    Request: SetGitHubTokenInput,
    Result: Schema.Struct({ userId: UserId }),
    execute: (input) =>
      sql`
        UPDATE v3_users
        SET
          github_access_token_enc = ${input.githubAccessTokenEnc},
          github_token_enc_iv = ${input.githubTokenEncIv},
          github_username = ${input.githubUsername},
          github_scopes = ${input.githubScopes},
          github_connected_at = ${input.now},
          updated_at = ${input.now}
        WHERE id = ${input.userId}
        RETURNING id AS "userId"
      `,
  });

  const clearGitHubTokenRow = SqlSchema.findAll({
    Request: ClearGitHubTokenInput,
    Result: Schema.Struct({ userId: UserId }),
    execute: (input) =>
      sql`
        UPDATE v3_users
        SET
          github_access_token_enc = NULL,
          github_token_enc_iv = NULL,
          github_username = NULL,
          github_scopes = NULL,
          github_connected_at = NULL,
          updated_at = ${input.now}
        WHERE id = ${input.userId}
        RETURNING id AS "userId"
      `,
  });

  const selectGitHubTokenRow = SqlSchema.findOneOption({
    Request: GetUserByIdInput,
    Result: GitHubTokenDbRow,
    execute: ({ id }) =>
      sql`
        SELECT
          id AS "userId",
          github_username AS "githubUsername",
          github_access_token_enc AS "githubAccessTokenEnc",
          github_token_enc_iv AS "githubTokenEncIv",
          github_scopes AS "githubScopes",
          github_connected_at AS "connectedAt"
        FROM v3_users
        WHERE id = ${id}
          AND github_access_token_enc IS NOT NULL
          AND github_token_enc_iv IS NOT NULL
          AND github_username IS NOT NULL
          AND github_scopes IS NOT NULL
          AND github_connected_at IS NOT NULL
      `,
  });

  const setGitHubToken: UserRepositoryShape["setGitHubToken"] = (input) =>
    updateGitHubTokenRow(input).pipe(
      Effect.mapError(
        mapErr("UserRepository.setGitHubToken:query", "UserRepository.setGitHubToken:decode"),
      ),
      Effect.asVoid,
    );

  const clearGitHubToken: UserRepositoryShape["clearGitHubToken"] = (input) =>
    clearGitHubTokenRow(input).pipe(
      Effect.mapError(
        mapErr("UserRepository.clearGitHubToken:query", "UserRepository.clearGitHubToken:decode"),
      ),
      Effect.asVoid,
    );

  const getGitHubToken: UserRepositoryShape["getGitHubToken"] = (input) =>
    selectGitHubTokenRow(input).pipe(
      Effect.mapError(
        mapErr("UserRepository.getGitHubToken:query", "UserRepository.getGitHubToken:decode"),
      ),
      Effect.map(
        (opt): Option.Option<GitHubTokenRecord> =>
          Option.map(
            opt,
            (row): GitHubTokenRecord => ({
              userId: row.userId,
              githubUsername: row.githubUsername,
              githubAccessTokenEnc: row.githubAccessTokenEnc,
              githubTokenEncIv: row.githubTokenEncIv,
              githubScopes: row.githubScopes,
              connectedAt: row.connectedAt,
            }),
          ),
      ),
    );

  return {
    upsertFromGoogle,
    getByGoogleSub,
    getById,
    setGitHubToken,
    clearGitHubToken,
    getGitHubToken,
  } satisfies UserRepositoryShape;
});

export const UserRepositoryLive = Layer.effect(UserRepository, makeUserRepository);
