import { AuthSessionId, DeviceId } from "@v3tools/contracts";
import { Context, Option, Schema } from "effect";
import type { Effect } from "effect";

import type { DeviceRepositoryError } from "../Errors.ts";

// v3_device_sessions links an auth_sessions row to a v3_devices row. The link
// is 1:1 by session_id (a session belongs to at most one device) and N:1 by
// device_id (a device has many lifetime sessions).

export const DeviceSessionRecord = Schema.Struct({
  sessionId: AuthSessionId,
  deviceId: DeviceId,
  linkedAt: Schema.DateTimeUtcFromString,
});
export type DeviceSessionRecord = typeof DeviceSessionRecord.Type;

export const LinkDeviceSessionInput = Schema.Struct({
  sessionId: AuthSessionId,
  deviceId: DeviceId,
  now: Schema.DateTimeUtcFromString,
});
export type LinkDeviceSessionInput = typeof LinkDeviceSessionInput.Type;

export const GetDeviceSessionInput = Schema.Struct({ sessionId: AuthSessionId });
export type GetDeviceSessionInput = typeof GetDeviceSessionInput.Type;

export interface DeviceSessionRepositoryShape {
  readonly link: (input: LinkDeviceSessionInput) => Effect.Effect<void, DeviceRepositoryError>;
  readonly getBySessionId: (
    input: GetDeviceSessionInput,
  ) => Effect.Effect<Option.Option<DeviceSessionRecord>, DeviceRepositoryError>;
}

export class DeviceSessionRepository extends Context.Service<
  DeviceSessionRepository,
  DeviceSessionRepositoryShape
>()("v3/identity/Services/DeviceSessionRepository") {}
