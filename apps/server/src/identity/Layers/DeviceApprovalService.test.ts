import {
  AuthSessionId,
  DeviceId,
  GoogleSub,
  TrimmedNonEmptyString,
  UserId,
} from "@v3tools/contracts";
import { assert, it } from "@effect/vitest";
import { DateTime, Effect, Layer } from "effect";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import { DeviceRegistryLive } from "../../mesh/Layers/DeviceRegistry.ts";
import { PresenceBroadcasterLive } from "../../mesh/Layers/PresenceBroadcaster.ts";
import { DeviceRegistry } from "../../mesh/Services/DeviceRegistry.ts";
import { DeviceApprovalService } from "../Services/DeviceApprovalService.ts";
import { DeviceRepositoryLive } from "./DeviceRepository.ts";
import { DeviceApprovalServiceLive } from "./DeviceApprovalService.ts";
import { UserRepository } from "../Services/UserRepository.ts";
import { UserRepositoryLive } from "./UserRepository.ts";

const baseLayer = Layer.mergeAll(
  UserRepositoryLive,
  DeviceRepositoryLive,
  PresenceBroadcasterLive,
).pipe(Layer.provideMerge(SqlitePersistenceMemory));

const deviceRegistryLayer = DeviceRegistryLive.pipe(Layer.provide(baseLayer));

const approvalLayer = Layer.mergeAll(
  baseLayer,
  deviceRegistryLayer,
  DeviceApprovalServiceLive.pipe(Layer.provide(deviceRegistryLayer), Layer.provide(baseLayer)),
);

const layer = it.layer(approvalLayer);

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

const registerInput = (
  deviceId: string,
  userId: string,
  overrides?: { readonly maxDevices?: number },
) => ({
  userId: UserId.make(userId),
  deviceId: DeviceId.make(deviceId),
  deviceName: TrimmedNonEmptyString.make(`Device ${deviceId}`),
  platform: "windows" as const,
  kind: "desktop" as const,
  capabilities: ["execute", "claude_code"] as const,
  // Tests run with a generous cap so the existing behaviour assertions
  // stay focused on the approval state machine. The limit-enforcement
  // test below overrides this.
  maxDevices: overrides?.maxDevices ?? 20,
  now,
});

layer("DeviceApprovalServiceLive", (it) => {
  it.effect("auto-approves a new device when no other approved device is online", () =>
    Effect.gen(function* () {
      yield* seedUser("u1", "sub-1");
      const approvals = yield* DeviceApprovalService;
      const result = yield* approvals.registerOrResume(registerInput("d1", "u1"));
      assert.equal(result.device.approved, true);
      assert.equal(result.needsApproval, false);
      assert.equal(result.wasNewlyInserted, true);
    }),
  );

  it.effect("leaves a second device unapproved when another approved device is online", () =>
    Effect.gen(function* () {
      yield* seedUser("u1", "sub-1");
      const approvals = yield* DeviceApprovalService;
      const registry = yield* DeviceRegistry;
      yield* approvals.registerOrResume(registerInput("d1", "u1"));
      yield* registry.register({
        deviceId: DeviceId.make("d1"),
        sessionId: AuthSessionId.make("session-1"),
        connectedAt: now.toString(),
      });
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

  // Spec §10.4 [limits].max_devices_per_user — once the cap is reached,
  // a brand-new device registration fails with DeviceLimitReachedError.
  // Re-registering an already-known device still succeeds (operators
  // depend on that idempotency for token rotation).
  it.effect("rejects a new device past max_devices_per_user", () =>
    Effect.gen(function* () {
      yield* seedUser("u1", "sub-1");
      const approvals = yield* DeviceApprovalService;
      yield* approvals.registerOrResume(registerInput("d1", "u1", { maxDevices: 2 }));
      yield* approvals.registerOrResume(registerInput("d2", "u1", { maxDevices: 2 }));
      const exit = yield* Effect.exit(
        approvals.registerOrResume(registerInput("d3", "u1", { maxDevices: 2 })),
      );
      assert.equal(exit._tag, "Failure");
      if (exit._tag === "Failure") {
        const failure = exit.cause.toString();
        assert.ok(failure.includes("DeviceLimitReachedError"), failure);
      }
    }),
  );

  it.effect("re-register of a known device ignores the cap", () =>
    Effect.gen(function* () {
      yield* seedUser("u1", "sub-1");
      const approvals = yield* DeviceApprovalService;
      yield* approvals.registerOrResume(registerInput("d1", "u1", { maxDevices: 1 }));
      const resumed = yield* approvals.registerOrResume({
        ...registerInput("d1", "u1", { maxDevices: 1 }),
        now: later,
      });
      assert.equal(resumed.wasNewlyInserted, false);
    }),
  );
});
