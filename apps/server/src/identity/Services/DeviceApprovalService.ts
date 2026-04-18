import {
  DeviceCapability,
  DeviceId,
  DeviceInfo,
  DeviceKind,
  DevicePlatform,
  TrimmedNonEmptyString,
  UserId,
} from "@v3tools/contracts";
import { Context, Schema, Stream } from "effect";
import type { Effect } from "effect";

import type { DeviceRepositoryError } from "../Errors.ts";

// Streaming event types surfaced whenever a device lifecycle step happens.
// Consumers (future WS `device_approval_requested` / `device_registered` pushes
// in P2) subscribe via streamChanges.

export const DeviceApprovalEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("device-registered"),
    userId: UserId,
    device: DeviceInfo,
    needsApproval: Schema.Boolean,
  }),
  Schema.Struct({
    type: Schema.Literal("device-approved"),
    userId: UserId,
    device: DeviceInfo,
  }),
  Schema.Struct({
    type: Schema.Literal("device-removed"),
    userId: UserId,
    deviceId: DeviceId,
  }),
]);
export type DeviceApprovalEvent = typeof DeviceApprovalEvent.Type;

// Input for registerOrResume: everything we need to record a device's hello,
// sourced from the Google-bootstrap HTTP body (spec §3.3).
export const RegisterOrResumeInput = Schema.Struct({
  userId: UserId,
  deviceId: DeviceId,
  deviceName: TrimmedNonEmptyString,
  platform: DevicePlatform,
  kind: DeviceKind,
  capabilities: Schema.Array(DeviceCapability),
  now: Schema.DateTimeUtcFromString,
});
export type RegisterOrResumeInput = typeof RegisterOrResumeInput.Type;

export const ApproveDeviceInput = Schema.Struct({
  userId: UserId,
  deviceId: DeviceId,
});
export type ApproveDeviceInput = typeof ApproveDeviceInput.Type;

export const RemoveDeviceInput = Schema.Struct({
  userId: UserId,
  deviceId: DeviceId,
  now: Schema.DateTimeUtcFromString,
});
export type RemoveDeviceInput = typeof RemoveDeviceInput.Type;

export interface RegisterOrResumeResult {
  readonly device: DeviceInfo;
  readonly needsApproval: boolean;
  // True if the device was freshly inserted by this call. False means this
  // was a re-register of an already-known device.
  readonly wasNewlyInserted: boolean;
}

export interface DeviceApprovalServiceShape {
  readonly registerOrResume: (
    input: RegisterOrResumeInput,
  ) => Effect.Effect<RegisterOrResumeResult, DeviceRepositoryError>;
  readonly approve: (input: ApproveDeviceInput) => Effect.Effect<boolean, DeviceRepositoryError>;
  readonly remove: (input: RemoveDeviceInput) => Effect.Effect<boolean, DeviceRepositoryError>;
  readonly streamChanges: Stream.Stream<DeviceApprovalEvent>;
}

export class DeviceApprovalService extends Context.Service<
  DeviceApprovalService,
  DeviceApprovalServiceShape
>()("v3/identity/Services/DeviceApprovalService") {}
