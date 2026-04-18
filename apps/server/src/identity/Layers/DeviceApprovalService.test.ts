import { DeviceId, GoogleSub, TrimmedNonEmptyString, UserId } from "@v3tools/contracts";
import { assert, it } from "@effect/vitest";
import { DateTime, Effect, Layer } from "effect";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { DeviceApprovalService } from "../Services/DeviceApprovalService.ts";
import { DeviceRepositoryLive } from "./DeviceRepository.ts";
import { DeviceApprovalServiceLive } from "./DeviceApprovalService.ts";
import { UserRepository } from "../Services/UserRepository.ts";
import { UserRepositoryLive } from "./UserRepository.ts";

const approvalLayer = Layer.mergeAll(
  UserRepositoryLive,
  DeviceRepositoryLive,
  DeviceApprovalServiceLive.pipe(Layer.provide(DeviceRepositoryLive)),
);

const layer = it.layer(approvalLayer.pipe(Layer.provideMerge(SqlitePersistenceMemory)));

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

const registerInput = (deviceId: string, userId: string) => ({
  userId: UserId.make(userId),
  deviceId: DeviceId.make(deviceId),
  deviceName: TrimmedNonEmptyString.make(`Device ${deviceId}`),
  platform: "windows" as const,
  kind: "desktop" as const,
  capabilities: ["execute", "claude_code"] as const,
  now,
});

layer("DeviceApprovalServiceLive", (it) => {
  it.effect("auto-approves the first device ever registered for a user", () =>
    Effect.gen(function* () {
      yield* seedUser("u1", "sub-1");
      const approvals = yield* DeviceApprovalService;
      const result = yield* approvals.registerOrResume(registerInput("d1", "u1"));
      assert.equal(result.device.approved, true);
      assert.equal(result.needsApproval, false);
      assert.equal(result.wasNewlyInserted, true);
    }),
  );

  it.effect("leaves a second device unapproved and needing approval", () =>
    Effect.gen(function* () {
      yield* seedUser("u1", "sub-1");
      const approvals = yield* DeviceApprovalService;
      yield* approvals.registerOrResume(registerInput("d1", "u1"));
      const result = yield* approvals.registerOrResume(registerInput("d2", "u1"));
      assert.equal(result.device.approved, false);
      assert.equal(result.needsApproval, true);
      assert.equal(result.wasNewlyInserted, true);
    }),
  );

  it.effect("re-register of an approved device preserves approval and marks it not-new", () =>
    Effect.gen(function* () {
      yield* seedUser("u1", "sub-1");
      const approvals = yield* DeviceApprovalService;
      yield* approvals.registerOrResume(registerInput("d1", "u1"));
      const result = yield* approvals.registerOrResume({
        ...registerInput("d1", "u1"),
        now: later,
      });
      assert.equal(result.device.approved, true);
      assert.equal(result.needsApproval, false);
      assert.equal(result.wasNewlyInserted, false);
    }),
  );

  it.effect("re-register of an unapproved device still needs approval", () =>
    Effect.gen(function* () {
      yield* seedUser("u1", "sub-1");
      const approvals = yield* DeviceApprovalService;
      yield* approvals.registerOrResume(registerInput("d1", "u1"));
      yield* approvals.registerOrResume(registerInput("d2", "u1"));
      const result = yield* approvals.registerOrResume({
        ...registerInput("d2", "u1"),
        now: later,
      });
      assert.equal(result.device.approved, false);
      assert.equal(result.needsApproval, true);
      assert.equal(result.wasNewlyInserted, false);
    }),
  );

  it.effect("approve flips an existing pending device and returns true", () =>
    Effect.gen(function* () {
      yield* seedUser("u1", "sub-1");
      const approvals = yield* DeviceApprovalService;
      yield* approvals.registerOrResume(registerInput("d1", "u1"));
      yield* approvals.registerOrResume(registerInput("d2", "u1"));
      const ok = yield* approvals.approve({
        userId: UserId.make("u1"),
        deviceId: DeviceId.make("d2"),
      });
      assert.equal(ok, true);
    }),
  );

  it.effect("approve returns false for an unknown device", () =>
    Effect.gen(function* () {
      yield* seedUser("u1", "sub-1");
      const approvals = yield* DeviceApprovalService;
      const ok = yield* approvals.approve({
        userId: UserId.make("u1"),
        deviceId: DeviceId.make("d-absent"),
      });
      assert.equal(ok, false);
    }),
  );

  it.effect("remove soft-deletes and returns true", () =>
    Effect.gen(function* () {
      yield* seedUser("u1", "sub-1");
      const approvals = yield* DeviceApprovalService;
      yield* approvals.registerOrResume(registerInput("d1", "u1"));
      const ok = yield* approvals.remove({
        userId: UserId.make("u1"),
        deviceId: DeviceId.make("d1"),
        now: later,
      });
      assert.equal(ok, true);
    }),
  );
});
