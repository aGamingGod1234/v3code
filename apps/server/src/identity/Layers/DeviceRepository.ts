import {
  DeviceCapability,
  DeviceId,
  DeviceKind,
  DevicePlatform,
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
  DeviceRecord,
  DeviceRepository,
  GetDeviceInput,
  ListDevicesForUserInput,
  RegisterDeviceInput,
  RemoveDeviceInput,
  SetApprovedInput,
  TouchLastSeenInput,
  type DeviceRepositoryShape,
} from "../Services/DeviceRepository.ts";

const DeviceDbRow = Schema.Struct({
  id: DeviceId,
  userId: UserId,
  name: TrimmedNonEmptyString,
  platform: DevicePlatform,
  kind: DeviceKind,
  capabilitiesJson: Schema.String,
  approvedInt: Schema.Int,
  firstSeenAt: Schema.DateTimeUtcFromString,
  lastSeenAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  removedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
});

const CapabilityArray = Schema.Array(DeviceCapability);

const parseCapabilities = (raw: string): ReadonlyArray<DeviceCapability> => {
  const parsed: unknown = JSON.parse(raw);
  return Schema.decodeUnknownSync(CapabilityArray)(parsed);
};

const toDeviceRecord = (row: typeof DeviceDbRow.Type): DeviceRecord => ({
  id: row.id,
  userId: row.userId,
  name: row.name,
  platform: row.platform,
  kind: row.kind,
  capabilities: parseCapabilities(row.capabilitiesJson),
  approved: row.approvedInt !== 0,
  firstSeenAt: row.firstSeenAt,
  lastSeenAt: row.lastSeenAt,
  removedAt: row.removedAt,
});

const mapErr =
  (sqlOperation: string, decodeOperation: string) =>
  (cause: unknown): PersistenceSqlError | PersistenceDecodeError =>
    Schema.isSchemaError(cause)
      ? toPersistenceDecodeError(decodeOperation)(cause)
      : toPersistenceSqlError(sqlOperation)(cause);

const makeDeviceRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const registerRows = SqlSchema.findAll({
    Request: RegisterDeviceInput,
    Result: DeviceDbRow,
    execute: (input) => {
      const capabilitiesJson = JSON.stringify(input.capabilities);
      return sql`
        INSERT INTO v3_devices (
          id, user_id, name, platform, kind,
          capabilities_json, approved, first_seen_at, last_seen_at, removed_at
        ) VALUES (
          ${input.id}, ${input.userId}, ${input.name}, ${input.platform}, ${input.kind},
          ${capabilitiesJson}, 0, ${input.now}, ${input.now}, NULL
        )
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          platform = excluded.platform,
          kind = excluded.kind,
          capabilities_json = excluded.capabilities_json,
          last_seen_at = excluded.last_seen_at,
          removed_at = NULL
        WHERE v3_devices.user_id = excluded.user_id
        RETURNING
          id AS "id",
          user_id AS "userId",
          name AS "name",
          platform AS "platform",
          kind AS "kind",
          capabilities_json AS "capabilitiesJson",
          approved AS "approvedInt",
          first_seen_at AS "firstSeenAt",
          last_seen_at AS "lastSeenAt",
          removed_at AS "removedAt"
      `;
    },
  });

  const touchRow = SqlSchema.void({
    Request: TouchLastSeenInput,
    execute: ({ id, now }) =>
      sql`
        UPDATE v3_devices
        SET last_seen_at = ${now}
        WHERE id = ${id}
          AND removed_at IS NULL
      `,
  });

  const setApprovedRows = SqlSchema.findAll({
    Request: SetApprovedInput,
    Result: Schema.Struct({ id: DeviceId }),
    execute: ({ id, userId, approved }) => {
      const approvedInt = approved ? 1 : 0;
      return sql`
        UPDATE v3_devices
        SET approved = ${approvedInt}
        WHERE id = ${id}
          AND user_id = ${userId}
          AND removed_at IS NULL
        RETURNING id AS "id"
      `;
    },
  });

  const removeRows = SqlSchema.findAll({
    Request: RemoveDeviceInput,
    Result: Schema.Struct({ id: DeviceId }),
    execute: ({ id, userId, now }) =>
      sql`
        UPDATE v3_devices
        SET removed_at = ${now}
        WHERE id = ${id}
          AND user_id = ${userId}
          AND removed_at IS NULL
        RETURNING id AS "id"
      `,
  });

  const selectDevice = SqlSchema.findOneOption({
    Request: GetDeviceInput,
    Result: DeviceDbRow,
    execute: ({ id, userId }) =>
      sql`
        SELECT
          id AS "id",
          user_id AS "userId",
          name AS "name",
          platform AS "platform",
          kind AS "kind",
          capabilities_json AS "capabilitiesJson",
          approved AS "approvedInt",
          first_seen_at AS "firstSeenAt",
          last_seen_at AS "lastSeenAt",
          removed_at AS "removedAt"
        FROM v3_devices
        WHERE id = ${id}
          AND user_id = ${userId}
      `,
  });

  const listForUserRows = SqlSchema.findAll({
    Request: ListDevicesForUserInput,
    Result: DeviceDbRow,
    execute: ({ userId, includeRemoved }) => {
      const activeOnly = includeRemoved !== true;
      return activeOnly
        ? sql`
            SELECT
              id AS "id",
              user_id AS "userId",
              name AS "name",
              platform AS "platform",
              kind AS "kind",
              capabilities_json AS "capabilitiesJson",
              approved AS "approvedInt",
              first_seen_at AS "firstSeenAt",
              last_seen_at AS "lastSeenAt",
              removed_at AS "removedAt"
            FROM v3_devices
            WHERE user_id = ${userId}
              AND removed_at IS NULL
            ORDER BY first_seen_at ASC, id ASC
          `
        : sql`
            SELECT
              id AS "id",
              user_id AS "userId",
              name AS "name",
              platform AS "platform",
              kind AS "kind",
              capabilities_json AS "capabilitiesJson",
              approved AS "approvedInt",
              first_seen_at AS "firstSeenAt",
              last_seen_at AS "lastSeenAt",
              removed_at AS "removedAt"
            FROM v3_devices
            WHERE user_id = ${userId}
            ORDER BY first_seen_at ASC, id ASC
          `;
    },
  });

  const register: DeviceRepositoryShape["register"] = (input) =>
    registerRows(input).pipe(
      Effect.mapError(
        mapErr("DeviceRepository.register:query", "DeviceRepository.register:decode"),
      ),
      Effect.flatMap((rows) => {
        const first = rows[0];
        return first === undefined
          ? Effect.fail(
              toPersistenceSqlError("DeviceRepository.register:missing-returning")(
                new Error("INSERT ... RETURNING produced no row (probable user_id mismatch)"),
              ),
            )
          : Effect.succeed(toDeviceRecord(first));
      }),
    );

  const touchLastSeen: DeviceRepositoryShape["touchLastSeen"] = (input) =>
    touchRow(input).pipe(
      Effect.mapError(
        mapErr("DeviceRepository.touchLastSeen:query", "DeviceRepository.touchLastSeen:encode"),
      ),
    );

  const setApproved: DeviceRepositoryShape["setApproved"] = (input) =>
    setApprovedRows(input).pipe(
      Effect.mapError(
        mapErr("DeviceRepository.setApproved:query", "DeviceRepository.setApproved:decode"),
      ),
      Effect.map((rows) => rows.length > 0),
    );

  const remove: DeviceRepositoryShape["remove"] = (input) =>
    removeRows(input).pipe(
      Effect.mapError(mapErr("DeviceRepository.remove:query", "DeviceRepository.remove:decode")),
      Effect.map((rows) => rows.length > 0),
    );

  const get: DeviceRepositoryShape["get"] = (input) =>
    selectDevice(input).pipe(
      Effect.mapError(mapErr("DeviceRepository.get:query", "DeviceRepository.get:decode")),
      Effect.map((opt) => Option.map(opt, toDeviceRecord)),
    );

  const listForUser: DeviceRepositoryShape["listForUser"] = (input) =>
    listForUserRows(input).pipe(
      Effect.mapError(
        mapErr("DeviceRepository.listForUser:query", "DeviceRepository.listForUser:decode"),
      ),
      Effect.map((rows) => rows.map(toDeviceRecord)),
    );

  return {
    register,
    touchLastSeen,
    setApproved,
    remove,
    get,
    listForUser,
  } satisfies DeviceRepositoryShape;
});

export const DeviceRepositoryLive = Layer.effect(DeviceRepository, makeDeviceRepository);
