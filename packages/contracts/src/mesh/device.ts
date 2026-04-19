import { Schema } from "effect";

import { TrimmedNonEmptyString } from "../baseSchemas.ts";
import { DeviceCapability, DeviceId, DeviceInfo, DeviceKind, DevicePlatform } from "../identity.ts";

export { DeviceInfo };

export const HelloPayload = Schema.Struct({
  device_id: DeviceId,
  device_name: TrimmedNonEmptyString,
  platform: DevicePlatform,
  kind: DeviceKind,
  capabilities: Schema.Array(DeviceCapability),
  app_version: TrimmedNonEmptyString,
});
export type HelloPayload = typeof HelloPayload.Type;

export const PresenceUpdatePayload = Schema.Struct({
  device_id: DeviceId,
  online: Schema.Boolean,
  last_seen_at: Schema.String,
});
export type PresenceUpdatePayload = typeof PresenceUpdatePayload.Type;
