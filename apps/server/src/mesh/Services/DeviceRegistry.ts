import { AuthSessionId, DeviceId } from "@v3tools/contracts";
import { Context, Option, Schema } from "effect";
import type { Effect } from "effect";

export const RegisterDeviceConnectionInput = Schema.Struct({
  deviceId: DeviceId,
  sessionId: AuthSessionId,
  connectedAt: Schema.String,
});
export type RegisterDeviceConnectionInput = typeof RegisterDeviceConnectionInput.Type;

export const UnregisterDeviceConnectionInput = Schema.Struct({
  deviceId: DeviceId,
  sessionId: AuthSessionId,
  disconnectedAt: Schema.String,
});
export type UnregisterDeviceConnectionInput = typeof UnregisterDeviceConnectionInput.Type;

export interface DeviceRegistryShape {
  readonly register: (input: RegisterDeviceConnectionInput) => Effect.Effect<void>;
  readonly unregister: (input: UnregisterDeviceConnectionInput) => Effect.Effect<void>;
  readonly isOnline: (deviceId: DeviceId) => Effect.Effect<boolean>;
  readonly getAnyOnlineSessionId: (
    deviceId: DeviceId,
  ) => Effect.Effect<Option.Option<AuthSessionId>>;
}

export class DeviceRegistry extends Context.Service<DeviceRegistry, DeviceRegistryShape>()(
  "v3/mesh/Services/DeviceRegistry",
) {}
