import {
  DeviceId,
  DevicePlatform,
  PushProvider,
  TrimmedNonEmptyString,
  UserId,
} from "@v3tools/contracts";
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
  CountActiveTokensForUserInput,
  DevicePushTokenRecord,
  DevicePushTokenRepository,
  ListTokensForDevicesInput,
  MarkTokenInvalidInput,
  RemovePushTokenInput,
  UpsertPushTokenInput,
  type DevicePushTokenRepositoryShape,
  type UpsertPushTokenResult,
} from "../Services/DevicePushTokenRepository.ts";

const DbRow = Schema.Struct({
  id: TrimmedNonEmptyString,
  deviceId: DeviceId,
  userId: UserId,
  platform: DevicePlatform,
  provider: PushProvider,
  token: TrimmedNonEmptyString,
  appVersion: TrimmedNonEmptyString,
  issuedAt: Schema.DateTimeUtcFromString,
  lastSeenAt: Schema.DateTimeUtcFromString,
  removedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
});

const toRecord = (row: typeof DbRow.Type): DevicePushTokenRecord => ({
  id: row.id,
  deviceId: row.deviceId,
  userId: row.userId,
  platform: row.platform,
  provider: row.provider,
  token: row.token,
  appVersion: row.appVersion,
  issuedAt: row.issuedAt,
  lastSeenAt: row.lastSeenAt,
  removedAt: row.removedAt,
});

const mapErr =
  (sqlOperation: string, decodeOperation: string) =>
  (cause: unknown): PersistenceSqlError | PersistenceDecodeError =>
    Schema.isSchemaError(cause)
      ? toPersistenceDecodeError(decodeOperation)(cause)
      : toPersistenceSqlError(sqlOperation)(cause);

const makeRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertRows = SqlSchema.findAll({
    Request: UpsertPushTokenInput,
    Result: Schema.Struct({
      id: TrimmedNonEmptyString,
      deviceId: DeviceId,
      userId: UserId,
      platform: DevicePlatform,
      provider: PushProvider,
      token: TrimmedNonEmptyString,
      appVersion: TrimmedNonEmptyString,
      issuedAt: Schema.DateTimeUtcFromString,
      lastSeenAt: Schema.DateTimeUtcFromString,
      removedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
      wasInsert: Schema.Int,
    }),
    execute: (input) =>
      sql`
        INSERT INTO v3_device_push_tokens (
          id, device_id, user_id, platform, provider,
          token, app_version, issued_at, last_seen_at, removed_at
        ) VALUES (
          ${input.id}, ${input.deviceId}, ${input.userId}, ${input.platform}, ${input.provider},
          ${input.token}, ${input.appVersion}, ${input.issuedAt}, ${input.now}, NULL
        )
        ON CONFLICT(device_id, provider, token) WHERE removed_at IS NULL
        DO UPDATE SET
          last_seen_at = excluded.last_seen_at,
          app_version = excluded.app_version,
          user_id = excluded.user_id,
          platform = excluded.platform
        RETURNING
          id AS "id",
          device_id AS "deviceId",
          user_id AS "userId",
          platform AS "platform",
          provider AS "provider",
          token AS "token",
          app_version AS "appVersion",
          issued_at AS "issuedAt",
          last_seen_at AS "lastSeenAt",
          removed_at AS "removedAt",
          CASE WHEN issued_at = ${input.issuedAt} THEN 1 ELSE 0 END AS "wasInsert"
      `,
  });

  const softDeleteOtherTokens = SqlSchema.void({
    Request: Schema.Struct({
      deviceId: DeviceId,
      provider: PushProvider,
      token: TrimmedNonEmptyString,
      now: Schema.DateTimeUtcFromString,
    }),
    execute: ({ deviceId, provider, token, now }) => sql`
      UPDATE v3_device_push_tokens
      SET removed_at = ${now}
      WHERE device_id = ${deviceId}
        AND provider = ${provider}
        AND token <> ${token}
        AND removed_at IS NULL
    `,
  });

  const removeRow = SqlSchema.findAll({
    Request: RemovePushTokenInput,
    Result: Schema.Struct({ id: TrimmedNonEmptyString }),
    execute: ({ deviceId, token, now }) => sql`
      UPDATE v3_device_push_tokens
      SET removed_at = ${now}
      WHERE device_id = ${deviceId}
        AND token = ${token}
        AND removed_at IS NULL
      RETURNING id AS "id"
    `,
  });

  const markInvalidRow = SqlSchema.findAll({
    Request: MarkTokenInvalidInput,
    Result: Schema.Struct({ id: TrimmedNonEmptyString }),
    execute: ({ token, now }) => sql`
      UPDATE v3_device_push_tokens
      SET removed_at = ${now}
      WHERE token = ${token}
        AND removed_at IS NULL
      RETURNING id AS "id"
    `,
  });

  const listTokensForDevices = SqlSchema.findAll({
    Request: ListTokensForDevicesInput,
    Result: DbRow,
    execute: ({ deviceIds }) => {
      if (deviceIds.length === 0) {
        return sql`
          SELECT
            id AS "id",
            device_id AS "deviceId",
            user_id AS "userId",
            platform AS "platform",
            provider AS "provider",
            token AS "token",
            app_version AS "appVersion",
            issued_at AS "issuedAt",
            last_seen_at AS "lastSeenAt",
            removed_at AS "removedAt"
          FROM v3_device_push_tokens
          WHERE 1 = 0
        `;
      }
      return sql`
        SELECT
          id AS "id",
          device_id AS "deviceId",
          user_id AS "userId",
          platform AS "platform",
          provider AS "provider",
          token AS "token",
          app_version AS "appVersion",
          issued_at AS "issuedAt",
          last_seen_at AS "lastSeenAt",
          removed_at AS "removedAt"
        FROM v3_device_push_tokens
        WHERE removed_at IS NULL
          AND device_id IN ${sql.in(deviceIds)}
        ORDER BY last_seen_at DESC
      `;
    },
  });

  const selectByToken = SqlSchema.findOneOption({
    Request: TrimmedNonEmptyString,
    Result: DbRow,
    execute: (token) => sql`
      SELECT
        id AS "id",
        device_id AS "deviceId",
        user_id AS "userId",
        platform AS "platform",
        provider AS "provider",
        token AS "token",
        app_version AS "appVersion",
        issued_at AS "issuedAt",
        last_seen_at AS "lastSeenAt",
        removed_at AS "removedAt"
      FROM v3_device_push_tokens
      WHERE token = ${token}
        AND removed_at IS NULL
    `,
  });

  const countActiveForUserRows = SqlSchema.findAll({
    Request: CountActiveTokensForUserInput,
    Result: Schema.Struct({ total: Schema.Int }),
    execute: ({ userId }) => sql`
      SELECT COUNT(*) AS "total"
      FROM v3_device_push_tokens
      WHERE user_id = ${userId}
        AND removed_at IS NULL
    `,
  });

  const upsert: DevicePushTokenRepositoryShape["upsert"] = (input) =>
    Effect.gen(function* () {
      const rows = yield* upsertRows(input).pipe(
        Effect.mapError(
          mapErr(
            "DevicePushTokenRepository.upsert:query",
            "DevicePushTokenRepository.upsert:decode",
          ),
        ),
      );
      const first = rows[0];
      if (first === undefined) {
        return yield* toPersistenceSqlError("DevicePushTokenRepository.upsert:missing-returning")(
          new Error("INSERT ... RETURNING produced no row"),
        );
      }
      const rotated = yield* softDeleteOtherTokens({
        deviceId: input.deviceId,
        provider: input.provider,
        token: input.token,
        now: input.now,
      }).pipe(
        Effect.mapError(
          mapErr(
            "DevicePushTokenRepository.upsert:softDelete",
            "DevicePushTokenRepository.upsert:softDelete:encode",
          ),
        ),
        Effect.map(() => first.wasInsert === 1),
      );
      return {
        record: toRecord({
          id: first.id,
          deviceId: first.deviceId,
          userId: first.userId,
          platform: first.platform,
          provider: first.provider,
          token: first.token,
          appVersion: first.appVersion,
          issuedAt: first.issuedAt,
          lastSeenAt: first.lastSeenAt,
          removedAt: first.removedAt,
        }),
        rotated,
      } satisfies UpsertPushTokenResult;
    });

  const remove: DevicePushTokenRepositoryShape["remove"] = (input) =>
    removeRow(input).pipe(
      Effect.mapError(
        mapErr("DevicePushTokenRepository.remove:query", "DevicePushTokenRepository.remove:decode"),
      ),
      Effect.map((rows) => rows.length > 0),
    );

  const markInvalid: DevicePushTokenRepositoryShape["markInvalid"] = (input) =>
    markInvalidRow(input).pipe(
      Effect.mapError(
        mapErr(
          "DevicePushTokenRepository.markInvalid:query",
          "DevicePushTokenRepository.markInvalid:decode",
        ),
      ),
      Effect.map((rows) => rows.length > 0),
    );

  const listActiveForDevices: DevicePushTokenRepositoryShape["listActiveForDevices"] = (input) =>
    listTokensForDevices(input).pipe(
      Effect.mapError(
        mapErr(
          "DevicePushTokenRepository.listActiveForDevices:query",
          "DevicePushTokenRepository.listActiveForDevices:decode",
        ),
      ),
      Effect.map((rows) => rows.map(toRecord)),
    );

  const getActiveByToken: DevicePushTokenRepositoryShape["getActiveByToken"] = (token) =>
    selectByToken(token).pipe(
      Effect.mapError(
        mapErr(
          "DevicePushTokenRepository.getActiveByToken:query",
          "DevicePushTokenRepository.getActiveByToken:decode",
        ),
      ),
      Effect.map((opt) => Option.map(opt, toRecord)),
    );

  const countActiveForUser: DevicePushTokenRepositoryShape["countActiveForUser"] = (input) =>
    countActiveForUserRows(input).pipe(
      Effect.mapError(
        mapErr(
          "DevicePushTokenRepository.countActiveForUser:query",
          "DevicePushTokenRepository.countActiveForUser:decode",
        ),
      ),
      Effect.map((rows) => rows[0]?.total ?? 0),
    );

  return {
    upsert,
    remove,
    markInvalid,
    listActiveForDevices,
    getActiveByToken,
    countActiveForUser,
  } satisfies DevicePushTokenRepositoryShape;
});

export const DevicePushTokenRepositoryLive = Layer.effect(
  DevicePushTokenRepository,
  makeRepository,
);
