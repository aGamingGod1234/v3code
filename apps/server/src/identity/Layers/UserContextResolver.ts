import { DeviceId, UserId } from "@v3tools/contracts";
import { Effect, Layer, Option, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import {
  toPersistenceDecodeError,
  toPersistenceSqlError,
  type PersistenceDecodeError,
  type PersistenceSqlError,
} from "../../persistence/Errors.ts";
import { DeviceSessionRepository } from "../Services/DeviceSessionRepository.ts";
import {
  UserContextResolver,
  type UserContextResolverShape,
} from "../Services/UserContextResolver.ts";

// Live resolver: walks auth_session_id → v3_device_sessions → v3_devices and
// returns the derived UserContext. Returns None when the session is not a V3
// session (i.e., the classic T3 pairing flow was used) — the mesh RPC layer
// treats that case as "no V3 user, classic single-user behaviour".
//
// UserId is read directly from v3_devices via a small Schema-typed query
// rather than extending DeviceRepository's public surface; the lookup is
// resolver-specific and doesn't need to be a general repository method.

const DeviceUserRow = Schema.Struct({ userId: UserId });
const DeviceLookupInput = Schema.Struct({ deviceId: DeviceId });

const mapSqlErr =
  (operation: string) =>
  (cause: unknown): PersistenceSqlError | PersistenceDecodeError =>
    Schema.isSchemaError(cause)
      ? toPersistenceDecodeError(`${operation}:decode`)(cause)
      : toPersistenceSqlError(`${operation}:query`)(cause);

export const makeUserContextResolver = Effect.gen(function* () {
  const deviceSessions = yield* DeviceSessionRepository;
  const sql = yield* SqlClient.SqlClient;

  const lookupUserIdForDevice = SqlSchema.findOneOption({
    Request: DeviceLookupInput,
    Result: DeviceUserRow,
    execute: ({ deviceId }) =>
      sql`
        SELECT user_id AS "userId"
        FROM v3_devices
        WHERE id = ${deviceId}
          AND removed_at IS NULL
      `,
  });

  const resolve: UserContextResolverShape["resolve"] = (sessionId) =>
    Effect.gen(function* () {
      const linkOpt = yield* deviceSessions.getBySessionId({ sessionId });
      if (Option.isNone(linkOpt)) return Option.none();
      const deviceId = linkOpt.value.deviceId;

      const userRowOpt = yield* lookupUserIdForDevice({ deviceId }).pipe(
        Effect.mapError(mapSqlErr("UserContextResolver.lookupUserIdForDevice")),
      );
      if (Option.isNone(userRowOpt)) {
        // Device row missing / soft-removed. Treat as "no longer a V3 session".
        return Option.none();
      }

      return Option.some({
        userId: userRowOpt.value.userId,
        deviceId,
      });
    });

  return { resolve } satisfies UserContextResolverShape;
});

export const UserContextResolverLive = Layer.effect(UserContextResolver, makeUserContextResolver);
