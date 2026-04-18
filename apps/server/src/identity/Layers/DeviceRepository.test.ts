import { DeviceId, GoogleSub, TrimmedNonEmptyString, UserId } from "@v3tools/contracts";
import { assert, it } from "@effect/vitest";
import { DateTime, Effect, Layer, Option } from "effect";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { DeviceRepository } from "../Services/DeviceRepository.ts";
import { UserRepository } from "../Services/UserRepository.ts";
import { DeviceRepositoryLive } from "./DeviceRepository.ts";
import { UserRepositoryLive } from "./UserRepository.ts";

const identityLayer = Layer.mergeAll(UserRepositoryLive, DeviceRepositoryLive);
const layer = it.layer(identityLayer.pipe(Layer.provideMerge(SqlitePersistenceMemory)));

const now = DateTime.makeUnsafe(Date.UTC(2026, 3, 18, 12, 0, 0));
const later = DateTime.makeUnsafe(Date.UTC(2026, 3, 18, 13, 0, 0));

const seedUser = (userId: string, sub: string) =>
  Effect.gen(function* () {
    const users = yield* UserRepository;
    return yield* users.upsertFromGoogle({
      id: UserId.make(userId),
      googleSub: GoogleSub.make(sub),
      email: TrimmedNonEmptyString.make(`${userId}@example.com`),
      displayName: null,
      avatarUrl: null,
      now,
    });
  });

const registerDesktop = (deviceId: string, userId: string) =>
  Effect.gen(function* () {
    const devices = yield* DeviceRepository;
    return yield* devices.register({
      id: DeviceId.make(deviceId),
      userId: UserId.make(userId),
      name: TrimmedNonEmptyString.make(`Desktop ${deviceId}`),
      platform: "windows",
      kind: "desktop",
      capabilities: ["execute", "claude_code", "codex", "terminal"],
      now,
    });
  });

layer("DeviceRepositoryLive", (it) => {
  it.effect("register inserts a new device with approved=false (approval is separate)", () =>
    Effect.gen(function* () {
      yield* seedUser("u1", "sub-1");
      const d = yield* registerDesktop("d1", "u1");
      assert.equal(d.id, DeviceId.make("d1"));
      assert.equal(d.userId, UserId.make("u1"));
      assert.equal(d.approved, false);
      assert.deepEqual([...d.capabilities], ["execute", "claude_code", "codex", "terminal"]);
    }),
  );

  it.effect("register is idempotent on repeated calls and preserves approval", () =>
    Effect.gen(function* () {
      yield* seedUser("u1", "sub-1");
      const devices = yield* DeviceRepository;
      yield* registerDesktop("d1", "u1");
      yield* devices.setApproved({
        id: DeviceId.make("d1"),
        userId: UserId.make("u1"),
        approved: true,
      });
      const second = yield* devices.register({
        id: DeviceId.make("d1"),
        userId: UserId.make("u1"),
        name: TrimmedNonEmptyString.make("Desktop renamed"),
        platform: "linux",
        kind: "laptop",
        capabilities: ["execute"],
        now: later,
      });
      assert.equal(second.approved, true, "approval should be preserved on re-register");
      assert.equal(second.name, "Desktop renamed");
      assert.equal(second.kind, "laptop");
    }),
  );

  it.effect("setApproved flips the flag and can be toggled off", () =>
    Effect.gen(function* () {
      yield* seedUser("u1", "sub-1");
      yield* registerDesktop("d1", "u1");
      const devices = yield* DeviceRepository;
      const approvedOn = yield* devices.setApproved({
        id: DeviceId.make("d1"),
        userId: UserId.make("u1"),
        approved: true,
      });
      const fetched = yield* devices.get({ id: DeviceId.make("d1"), userId: UserId.make("u1") });
      assert.equal(approvedOn, true);
      assert.equal(Option.isSome(fetched), true);
      if (Option.isSome(fetched)) {
        assert.equal(fetched.value.approved, true);
      }
    }),
  );

  it.effect(
    "remove is a soft delete: listForUser excludes by default, includeRemoved returns all",
    () =>
      Effect.gen(function* () {
        yield* seedUser("u1", "sub-1");
        yield* registerDesktop("d1", "u1");
        yield* registerDesktop("d2", "u1");
        const devices = yield* DeviceRepository;
        const removed = yield* devices.remove({
          id: DeviceId.make("d1"),
          userId: UserId.make("u1"),
          now: later,
        });
        assert.equal(removed, true);

        const activeList = yield* devices.listForUser({ userId: UserId.make("u1") });
        assert.deepEqual(
          activeList.map((r) => r.id),
          [DeviceId.make("d2")],
        );

        const fullList = yield* devices.listForUser({
          userId: UserId.make("u1"),
          includeRemoved: true,
        });
        assert.equal(fullList.length, 2);
        const d1 = fullList.find((r) => r.id === DeviceId.make("d1"));
        assert.ok(d1);
        assert.ok(d1?.removedAt !== null);
      }),
  );

  it.effect("register rejects when user_id mismatches an existing device id", () =>
    Effect.gen(function* () {
      yield* seedUser("u1", "sub-1");
      yield* seedUser("u2", "sub-2");
      yield* registerDesktop("d1", "u1");
      const devices = yield* DeviceRepository;
      const result = yield* Effect.flip(
        devices.register({
          id: DeviceId.make("d1"),
          userId: UserId.make("u2"),
          name: TrimmedNonEmptyString.make("Attempted steal"),
          platform: "macos",
          kind: "laptop",
          capabilities: [],
          now: later,
        }),
      );
      assert.equal(result._tag, "PersistenceSqlError");
    }),
  );
});
