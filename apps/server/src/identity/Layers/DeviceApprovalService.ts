import type { DeviceInfo } from "@v3tools/contracts";
import { Effect, Layer, Option, PubSub, Stream } from "effect";

import { DeviceRepository } from "../Services/DeviceRepository.ts";
import type { DeviceRecord } from "../Services/DeviceRepository.ts";
import { DeviceRegistry } from "../../mesh/Services/DeviceRegistry.ts";
import {
  DeviceApprovalEvent,
  DeviceApprovalService,
  type DeviceApprovalServiceShape,
} from "../Services/DeviceApprovalService.ts";

const toDeviceInfo = (record: DeviceRecord): DeviceInfo => ({
  id: record.id,
  userId: record.userId,
  name: record.name,
  platform: record.platform,
  kind: record.kind,
  capabilities: record.capabilities,
  approved: record.approved,
  // Presence is not tracked at the repository level — the MeshHub layer will
  // join this DeviceInfo with live-session data in P2. Default to offline here.
  online: false,
  firstSeenAt: record.firstSeenAt,
  lastSeenAt: record.lastSeenAt,
});

export const makeDeviceApprovalService = Effect.gen(function* () {
  const devices = yield* DeviceRepository;
  const deviceRegistry = yield* DeviceRegistry;
  const changesPubSub = yield* PubSub.unbounded<DeviceApprovalEvent>();

  const emit = (event: DeviceApprovalEvent) =>
    PubSub.publish(changesPubSub, event).pipe(Effect.asVoid);

  const registerOrResume: DeviceApprovalServiceShape["registerOrResume"] = (input) =>
    Effect.gen(function* () {
      const existing = yield* devices.get({ id: input.deviceId, userId: input.userId });
      const wasNewlyInserted = Option.isNone(existing);

      const registered = yield* devices.register({
        id: input.deviceId,
        userId: input.userId,
        name: input.deviceName,
        platform: input.platform,
        kind: input.kind,
        capabilities: input.capabilities,
        now: input.now,
      });
      yield* devices.touchLastSeen({ id: input.deviceId, now: input.now });

      if (!wasNewlyInserted) {
        // Known device coming back. Approval state is whatever it was.
        const device = toDeviceInfo({ ...registered, lastSeenAt: input.now });
        return {
          device,
          needsApproval: !registered.approved,
          wasNewlyInserted: false,
        };
      }

      // Brand-new device. Auto-approve when no other approved device for this
      // user is currently online; otherwise leave it pending.
      const allDevices = yield* devices.listForUser({ userId: input.userId });
      const otherApprovedDevices = allDevices.filter(
        (device) => device.id !== input.deviceId && device.approved,
      );
      const otherApprovedOnline = yield* Effect.forEach(
        otherApprovedDevices,
        (device) => deviceRegistry.isOnline(device.id),
        { concurrency: "unbounded" },
      ).pipe(Effect.map((states) => states.some(Boolean)));

      if (!otherApprovedOnline) {
        yield* devices.setApproved({
          id: input.deviceId,
          userId: input.userId,
          approved: true,
        });
        const approvedDevice = toDeviceInfo({
          ...registered,
          approved: true,
          lastSeenAt: input.now,
        });
        yield* emit({
          type: "device-registered",
          userId: input.userId,
          device: approvedDevice,
          needsApproval: false,
        });
        return {
          device: approvedDevice,
          needsApproval: false,
          wasNewlyInserted: true,
        };
      }

      const pendingDevice = toDeviceInfo({ ...registered, lastSeenAt: input.now });
      yield* emit({
        type: "device-registered",
        userId: input.userId,
        device: pendingDevice,
        needsApproval: true,
      });
      return {
        device: pendingDevice,
        needsApproval: true,
        wasNewlyInserted: true,
      };
    });

  const approve: DeviceApprovalServiceShape["approve"] = (input) =>
    Effect.gen(function* () {
      const updated = yield* devices.setApproved({
        id: input.deviceId,
        userId: input.userId,
        approved: true,
      });
      if (!updated) return false;
      const current = yield* devices.get({ id: input.deviceId, userId: input.userId });
      if (Option.isSome(current)) {
        yield* emit({
          type: "device-approved",
          userId: input.userId,
          device: toDeviceInfo(current.value),
        });
      }
      return true;
    });

  const remove: DeviceApprovalServiceShape["remove"] = (input) =>
    Effect.gen(function* () {
      const removed = yield* devices.remove({
        id: input.deviceId,
        userId: input.userId,
        now: input.now,
      });
      if (removed) {
        yield* emit({
          type: "device-removed",
          userId: input.userId,
          deviceId: input.deviceId,
        });
      }
      return removed;
    });

  return {
    registerOrResume,
    approve,
    remove,
    streamChanges: Stream.fromPubSub(changesPubSub),
  } satisfies DeviceApprovalServiceShape;
});

export const DeviceApprovalServiceLive = Layer.effect(
  DeviceApprovalService,
  makeDeviceApprovalService,
);
