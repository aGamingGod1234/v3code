import {
  DeviceCapability,
  DeviceId,
  DeviceKind,
  DevicePlatform,
  TrimmedNonEmptyString,
  UserId,
} from "@v3tools/contracts";
import { Context, Option, Schema } from "effect";
import type { Effect } from "effect";

import type { DeviceRepositoryError } from "../Errors.ts";

// Device record as stored + exposed to Effect code.
export const DeviceRecord = Schema.Struct({
  id: DeviceId,
  userId: UserId,
  name: TrimmedNonEmptyString,
  platform: DevicePlatform,
  kind: DeviceKind,
  capabilities: Schema.Array(DeviceCapability),
  approved: Schema.Boolean,
  firstSeenAt: Schema.DateTimeUtcFromString,
  lastSeenAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  removedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
});
export type DeviceRecord = typeof DeviceRecord.Type;

// Registration never sets `approved` — the approval bit is flipped separately
// via `setApproved`. This keeps the registration side-effect side of the API
// purely descriptive ("who am I and what can I do?") and the approval gate on
// its own one-way lever.
export const RegisterDeviceInput = Schema.Struct({
  id: DeviceId,
  userId: UserId,
  name: TrimmedNonEmptyString,
  platform: DevicePlatform,
  kind: DeviceKind,
  capabilities: Schema.Array(DeviceCapability),
  now: Schema.DateTimeUtcFromString,
});
export type RegisterDeviceInput = typeof RegisterDeviceInput.Type;

export const TouchLastSeenInput = Schema.Struct({
  id: DeviceId,
  now: Schema.DateTimeUtcFromString,
});
export type TouchLastSeenInput = typeof TouchLastSeenInput.Type;

export const SetApprovedInput = Schema.Struct({
  id: DeviceId,
  userId: UserId,
  approved: Schema.Boolean,
});
export type SetApprovedInput = typeof SetApprovedInput.Type;

export const RemoveDeviceInput = Schema.Struct({
  id: DeviceId,
  userId: UserId,
  now: Schema.DateTimeUtcFromString,
});
export type RemoveDeviceInput = typeof RemoveDeviceInput.Type;

export const GetDeviceInput = Schema.Struct({
  id: DeviceId,
  userId: UserId,
});
export type GetDeviceInput = typeof GetDeviceInput.Type;

export const ListDevicesForUserInput = Schema.Struct({
  userId: UserId,
  includeRemoved: Schema.optionalKey(Schema.Boolean),
});
export type ListDevicesForUserInput = typeof ListDevicesForUserInput.Type;

export interface DeviceRepositoryShape {
  // Inserts new or refreshes existing (same id + userId). Preserves the
  // existing `approved` flag when the device already exists — approval is a
  // one-way gate driven by `setApproved`.
  readonly register: (
    input: RegisterDeviceInput,
  ) => Effect.Effect<DeviceRecord, DeviceRepositoryError>;
  readonly touchLastSeen: (input: TouchLastSeenInput) => Effect.Effect<void, DeviceRepositoryError>;
  readonly setApproved: (input: SetApprovedInput) => Effect.Effect<boolean, DeviceRepositoryError>;
  // Soft delete: sets removed_at; the row remains so event.actor_device_id
  // lookups still resolve historical attribution.
  readonly remove: (input: RemoveDeviceInput) => Effect.Effect<boolean, DeviceRepositoryError>;
  readonly get: (
    input: GetDeviceInput,
  ) => Effect.Effect<Option.Option<DeviceRecord>, DeviceRepositoryError>;
  readonly listForUser: (
    input: ListDevicesForUserInput,
  ) => Effect.Effect<ReadonlyArray<DeviceRecord>, DeviceRepositoryError>;
}

export class DeviceRepository extends Context.Service<DeviceRepository, DeviceRepositoryShape>()(
  "v3/identity/Services/DeviceRepository",
) {}
