import {
  DeviceId,
  DevicePlatform,
  PushProvider,
  TrimmedNonEmptyString,
  UserId,
} from "@v3tools/contracts";
import { Context, Option, Schema } from "effect";
import type { Effect } from "effect";

import type { DevicePushTokenRepositoryError } from "../Errors.ts";

// V3 Phase 9 — push token registry.
//
// One row per `(device_id, provider, token)`. When a device re-registers
// with the same token, only `last_seen_at` is bumped; when it registers
// with a fresh token, the old row is soft-deleted (`removed_at`) and a
// new row takes its place. `tokenCount` on the admin panel uses the
// `removed_at IS NULL` partial index from migration 031.

export const DevicePushTokenRecord = Schema.Struct({
  id: TrimmedNonEmptyString,
  deviceId: DeviceId,
  userId: UserId,
  platform: DevicePlatform,
  provider: PushProvider,
  token: TrimmedNonEmptyString,
  appVersion: TrimmedNonEmptyString,
  issuedAt: Schema.DateTimeUtcFromString,
  lastSeenAt: Schema.DateTimeUtcFromString,
  removedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
});
export type DevicePushTokenRecord = typeof DevicePushTokenRecord.Type;

export const UpsertPushTokenInput = Schema.Struct({
  id: TrimmedNonEmptyString,
  deviceId: DeviceId,
  userId: UserId,
  platform: DevicePlatform,
  provider: PushProvider,
  token: TrimmedNonEmptyString,
  appVersion: TrimmedNonEmptyString,
  issuedAt: Schema.DateTimeUtcFromString,
  now: Schema.DateTimeUtcFromString,
});
export type UpsertPushTokenInput = typeof UpsertPushTokenInput.Type;

export const UpsertPushTokenResult = Schema.Struct({
  record: DevicePushTokenRecord,
  rotated: Schema.Boolean,
});
export type UpsertPushTokenResult = typeof UpsertPushTokenResult.Type;

export const RemovePushTokenInput = Schema.Struct({
  deviceId: DeviceId,
  token: TrimmedNonEmptyString,
  now: Schema.DateTimeUtcFromString,
});
export type RemovePushTokenInput = typeof RemovePushTokenInput.Type;

export const MarkTokenInvalidInput = Schema.Struct({
  token: TrimmedNonEmptyString,
  now: Schema.DateTimeUtcFromString,
});
export type MarkTokenInvalidInput = typeof MarkTokenInvalidInput.Type;

export const ListTokensForDevicesInput = Schema.Struct({
  deviceIds: Schema.Array(DeviceId),
});
export type ListTokensForDevicesInput = typeof ListTokensForDevicesInput.Type;

export const CountActiveTokensForUserInput = Schema.Struct({
  userId: UserId,
});
export type CountActiveTokensForUserInput = typeof CountActiveTokensForUserInput.Type;

export interface DevicePushTokenRepositoryShape {
  readonly upsert: (
    input: UpsertPushTokenInput,
  ) => Effect.Effect<UpsertPushTokenResult, DevicePushTokenRepositoryError>;
  readonly remove: (
    input: RemovePushTokenInput,
  ) => Effect.Effect<boolean, DevicePushTokenRepositoryError>;
  readonly markInvalid: (
    input: MarkTokenInvalidInput,
  ) => Effect.Effect<boolean, DevicePushTokenRepositoryError>;
  readonly listActiveForDevices: (
    input: ListTokensForDevicesInput,
  ) => Effect.Effect<ReadonlyArray<DevicePushTokenRecord>, DevicePushTokenRepositoryError>;
  readonly getActiveByToken: (
    token: typeof TrimmedNonEmptyString.Type,
  ) => Effect.Effect<Option.Option<DevicePushTokenRecord>, DevicePushTokenRepositoryError>;
  readonly countActiveForUser: (
    input: CountActiveTokensForUserInput,
  ) => Effect.Effect<number, DevicePushTokenRepositoryError>;
}

export class DevicePushTokenRepository extends Context.Service<
  DevicePushTokenRepository,
  DevicePushTokenRepositoryShape
>()("v3/identity/Services/DevicePushTokenRepository") {}
