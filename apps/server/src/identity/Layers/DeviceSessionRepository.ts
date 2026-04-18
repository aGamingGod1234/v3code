import { AuthSessionId, DeviceId } from "@v3tools/contracts";
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
  DeviceSessionRecord,
  DeviceSessionRepository,
  GetDeviceSessionInput,
  LinkDeviceSessionInput,
  type DeviceSessionRepositoryShape,
} from "../Services/DeviceSessionRepository.ts";

const DeviceSessionDbRow = Schema.Struct({
  sessionId: AuthSessionId,
  deviceId: DeviceId,
  linkedAt: Schema.DateTimeUtcFromString,
});

const toRecord = (row: typeof DeviceSessionDbRow.Type): DeviceSessionRecord => row;

const mapErr =
  (sqlOperation: string, decodeOperation: string) =>
  (cause: unknown): PersistenceSqlError | PersistenceDecodeError =>
    Schema.isSchemaError(cause)
      ? toPersistenceDecodeError(decodeOperation)(cause)
      : toPersistenceSqlError(sqlOperation)(cause);

const makeDeviceSessionRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const linkRow = SqlSchema.void({
    Request: LinkDeviceSessionInput,
    execute: ({ sessionId, deviceId, now }) =>
      sql`
        INSERT INTO v3_device_sessions (session_id, device_id, linked_at)
        VALUES (${sessionId}, ${deviceId}, ${now})
        ON CONFLICT(session_id) DO UPDATE SET
          device_id = excluded.device_id,
          linked_at = excluded.linked_at
      `,
  });

  const selectBySessionId = SqlSchema.findOneOption({
    Request: GetDeviceSessionInput,
    Result: DeviceSessionDbRow,
    execute: ({ sessionId }) =>
      sql`
        SELECT
          session_id AS "sessionId",
          device_id AS "deviceId",
          linked_at AS "linkedAt"
        FROM v3_device_sessions
        WHERE session_id = ${sessionId}
      `,
  });

  const link: DeviceSessionRepositoryShape["link"] = (input) =>
    linkRow(input).pipe(
      Effect.mapError(
        mapErr("DeviceSessionRepository.link:query", "DeviceSessionRepository.link:encode"),
      ),
    );

  const getBySessionId: DeviceSessionRepositoryShape["getBySessionId"] = (input) =>
    selectBySessionId(input).pipe(
      Effect.mapError(
        mapErr(
          "DeviceSessionRepository.getBySessionId:query",
          "DeviceSessionRepository.getBySessionId:decode",
        ),
      ),
      Effect.map((opt) => Option.map(opt, toRecord)),
    );

  return { link, getBySessionId } satisfies DeviceSessionRepositoryShape;
});

export const DeviceSessionRepositoryLive = Layer.effect(
  DeviceSessionRepository,
  makeDeviceSessionRepository,
);
