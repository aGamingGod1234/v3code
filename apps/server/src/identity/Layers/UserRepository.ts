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
  GetUserByGoogleSubInput,
  GetUserByIdInput,
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

  return { upsertFromGoogle, getByGoogleSub, getById } satisfies UserRepositoryShape;
});

export const UserRepositoryLive = Layer.effect(UserRepository, makeUserRepository);
