import {
  AuthSessionId,
  DeviceId,
  GoogleSub,
  TrimmedNonEmptyString,
  UserId,
} from "@v3tools/contracts";
import { assert, it } from "@effect/vitest";
import { DateTime, Effect, Layer, Option } from "effect";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { DeviceRepository } from "../Services/DeviceRepository.ts";
import { DeviceSessionRepository } from "../Services/DeviceSessionRepository.ts";
import { UserRepository } from "../Services/UserRepository.ts";
import { DeviceRepositoryLive } from "./DeviceRepository.ts";
import { DeviceSessionRepositoryLive } from "./DeviceSessionRepository.ts";
import { UserRepositoryLive } from "./UserRepository.ts";
import * as SqlClient from "effect/unstable/sql/SqlClient";

// v3_device_sessions references auth_sessions(session_id). Seed a minimal
// auth_sessions row so the foreign key can be satisfied in tests.
const seedAuthSession = (sessionId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const now = "2026-04-18T12:00:00.000Z";
    const later = "2026-05-18T12:00:00.000Z";
    yield* sql`
      INSERT INTO auth_sessions (
        session_id, subject, role, method,
        client_label, client_ip_address, client_user_agent,
        client_device_type, client_os, client_browser,
        issued_at, expires_at, last_connected_at, revoked_at
      ) VALUES (
        ${sessionId}, 'test-subject', 'owner', 'browser-session-cookie',
        NULL, NULL, NULL, 'desktop', NULL, NULL,
        ${now}, ${later}, NULL, NULL
      )
    `;
  });

const fullLayer = Layer.mergeAll(
  UserRepositoryLive,
  DeviceRepositoryLive,
  DeviceSessionRepositoryLive,
);

const layer = it.layer(fullLayer.pipe(Layer.provideMerge(SqlitePersistenceMemory)));

const now = DateTime.makeUnsafe(Date.UTC(2026, 3, 18, 12, 0, 0));

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

layer("DeviceSessionRepositoryLive", (it) => {
  it.effect("links a session to a device and round-trips via getBySessionId", () =>
    Effect.gen(function* () {
      yield* seedUserAndDevice;
      yield* seedAuthSession("session-link-roundtrip");
      const deviceSessions = yield* DeviceSessionRepository;
      yield* deviceSessions.link({
        sessionId: AuthSessionId.make("session-link-roundtrip"),
        deviceId: DeviceId.make("d1"),
        now,
      });
      const fetched = yield* deviceSessions.getBySessionId({
        sessionId: AuthSessionId.make("session-link-roundtrip"),
      });
      assert.equal(Option.isSome(fetched), true);
      if (Option.isSome(fetched)) {
        assert.equal(fetched.value.deviceId, DeviceId.make("d1"));
        assert.equal(fetched.value.sessionId, AuthSessionId.make("session-link-roundtrip"));
      }
    }),
  );

  it.effect("link is idempotent on the same session_id (updates device)", () =>
    Effect.gen(function* () {
      yield* seedUserAndDevice;
      yield* seedAuthSession("session-link-idempotent");
      const devices = yield* DeviceRepository;
      yield* devices.register({
        id: DeviceId.make("d2"),
        userId: UserId.make("u1"),
        name: TrimmedNonEmptyString.make("Laptop"),
        platform: "macos",
        kind: "laptop",
        capabilities: [],
        now,
      });
      const deviceSessions = yield* DeviceSessionRepository;
      yield* deviceSessions.link({
        sessionId: AuthSessionId.make("session-link-idempotent"),
        deviceId: DeviceId.make("d1"),
        now,
      });
      yield* deviceSessions.link({
        sessionId: AuthSessionId.make("session-link-idempotent"),
        deviceId: DeviceId.make("d2"),
        now,
      });
      const fetched = yield* deviceSessions.getBySessionId({
        sessionId: AuthSessionId.make("session-link-idempotent"),
      });
      assert.equal(Option.isSome(fetched), true);
      if (Option.isSome(fetched)) {
        assert.equal(fetched.value.deviceId, DeviceId.make("d2"));
      }
    }),
  );

  it.effect("getBySessionId returns None for an unknown session", () =>
    Effect.gen(function* () {
      const deviceSessions = yield* DeviceSessionRepository;
      const fetched = yield* deviceSessions.getBySessionId({
        sessionId: AuthSessionId.make("no-such-session"),
      });
      assert.equal(Option.isNone(fetched), true);
    }),
  );
});
