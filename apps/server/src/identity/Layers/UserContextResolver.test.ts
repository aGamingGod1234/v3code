import {
  AuthSessionId,
  DeviceId,
  GoogleSub,
  TrimmedNonEmptyString,
  UserId,
} from "@v3tools/contracts";
import { assert, it } from "@effect/vitest";
import { DateTime, Effect, Layer, Option } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { DeviceRepository } from "../Services/DeviceRepository.ts";
import { DeviceSessionRepository } from "../Services/DeviceSessionRepository.ts";
import { UserContextResolver } from "../Services/UserContextResolver.ts";
import { UserRepository } from "../Services/UserRepository.ts";
import { DeviceRepositoryLive } from "./DeviceRepository.ts";
import { DeviceSessionRepositoryLive } from "./DeviceSessionRepository.ts";
import { UserContextResolverLive } from "./UserContextResolver.ts";
import { UserRepositoryLive } from "./UserRepository.ts";

const stack = Layer.mergeAll(
  UserRepositoryLive,
  DeviceRepositoryLive,
  DeviceSessionRepositoryLive,
  UserContextResolverLive.pipe(Layer.provide(DeviceSessionRepositoryLive)),
);

const layer = it.layer(stack.pipe(Layer.provideMerge(SqlitePersistenceMemory)));

const now = DateTime.makeUnsafe(Date.UTC(2026, 3, 18, 12, 0, 0));

const seedAuthSession = (sessionId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const issued = "2026-04-18T12:00:00.000Z";
    const expires = "2026-05-18T12:00:00.000Z";
    yield* sql`
      INSERT INTO auth_sessions (
        session_id, subject, role, method,
        client_label, client_ip_address, client_user_agent,
        client_device_type, client_os, client_browser,
        issued_at, expires_at, last_connected_at, revoked_at
      ) VALUES (
        ${sessionId}, 'test-subject', 'owner', 'browser-session-cookie',
        NULL, NULL, NULL, 'desktop', NULL, NULL,
        ${issued}, ${expires}, NULL, NULL
      )
    `;
  });

const seedUserAndDevice = Effect.gen(function* () {
  const users = yield* UserRepository;
  const devices = yield* DeviceRepository;
  yield* users.upsertFromGoogle({
    id: UserId.make("u1"),
    googleSub: GoogleSub.make("sub-1"),
    email: TrimmedNonEmptyString.make("u1@example.com"),
    displayName: null,
    avatarUrl: null,
    now,
  });
  yield* devices.register({
    id: DeviceId.make("d1"),
    userId: UserId.make("u1"),
    name: TrimmedNonEmptyString.make("Desktop"),
    platform: "windows",
    kind: "desktop",
    capabilities: [],
    now,
  });
});

layer("UserContextResolverLive", (it) => {
  it.effect("returns Some({userId, deviceId}) for a valid V3 session", () =>
    Effect.gen(function* () {
      yield* seedUserAndDevice;
      yield* seedAuthSession("ucr-happy");
      const deviceSessions = yield* DeviceSessionRepository;
      yield* deviceSessions.link({
        sessionId: AuthSessionId.make("ucr-happy"),
        deviceId: DeviceId.make("d1"),
        now,
      });
      const resolver = yield* UserContextResolver;
      const resolved = yield* resolver.resolve(AuthSessionId.make("ucr-happy"));
      assert.equal(Option.isSome(resolved), true);
      if (Option.isSome(resolved)) {
        assert.equal(resolved.value.userId, UserId.make("u1"));
        assert.equal(resolved.value.deviceId, DeviceId.make("d1"));
      }
    }),
  );

  it.effect("returns None for a session that has no v3_device_sessions entry", () =>
    Effect.gen(function* () {
      yield* seedUserAndDevice;
      yield* seedAuthSession("ucr-no-link");
      // deliberately no link.
      const resolver = yield* UserContextResolver;
      const resolved = yield* resolver.resolve(AuthSessionId.make("ucr-no-link"));
      assert.equal(Option.isNone(resolved), true);
    }),
  );

  it.effect("returns None for a session linked to a soft-removed device", () =>
    Effect.gen(function* () {
      yield* seedUserAndDevice;
      yield* seedAuthSession("ucr-removed");
      const deviceSessions = yield* DeviceSessionRepository;
      const devices = yield* DeviceRepository;
      yield* deviceSessions.link({
        sessionId: AuthSessionId.make("ucr-removed"),
        deviceId: DeviceId.make("d1"),
        now,
      });
      yield* devices.remove({
        id: DeviceId.make("d1"),
        userId: UserId.make("u1"),
        now,
      });
      const resolver = yield* UserContextResolver;
      const resolved = yield* resolver.resolve(AuthSessionId.make("ucr-removed"));
      assert.equal(Option.isNone(resolved), true);
    }),
  );

  it.effect("returns None for an unknown session id", () =>
    Effect.gen(function* () {
      const resolver = yield* UserContextResolver;
      const resolved = yield* resolver.resolve(AuthSessionId.make("ucr-unknown"));
      assert.equal(Option.isNone(resolved), true);
    }),
  );
});
