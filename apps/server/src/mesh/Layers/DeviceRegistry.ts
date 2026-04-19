import { Effect, Layer, Option, Ref } from "effect";

import { DeviceRegistry, type DeviceRegistryShape } from "../Services/DeviceRegistry.ts";
import { PresenceBroadcaster } from "../Services/PresenceBroadcaster.ts";

const makeDeviceRegistry = Effect.gen(function* () {
  const presence = yield* PresenceBroadcaster;
  const onlineSessionsByDevice = yield* Ref.make(new Map<string, Set<string>>());

  const publishPresence = (deviceId: string, online: boolean, lastSeenAt: string) =>
    presence.publish({
      device_id: deviceId as never,
      online,
      last_seen_at: lastSeenAt,
    });

  return {
    register: (input) =>
      Ref.modify(onlineSessionsByDevice, (current) => {
        const currentSessions = current.get(input.deviceId) ?? new Set<string>();
        const alreadyOnline = currentSessions.size > 0;
        const nextSessions = new Set(currentSessions);
        nextSessions.add(input.sessionId);
        const next = new Map(current);
        next.set(input.deviceId, nextSessions);
        return [alreadyOnline, next] as const;
      }).pipe(
        Effect.flatMap((alreadyOnline) =>
          alreadyOnline ? Effect.void : publishPresence(input.deviceId, true, input.connectedAt),
        ),
      ),
    unregister: (input) =>
      Ref.modify(onlineSessionsByDevice, (current) => {
        const currentSessions = current.get(input.deviceId);
        if (!currentSessions) {
          return [false, current] as const;
        }
        const nextSessions = new Set(currentSessions);
        nextSessions.delete(input.sessionId);
        const next = new Map(current);
        if (nextSessions.size === 0) {
          next.delete(input.deviceId);
        } else {
          next.set(input.deviceId, nextSessions);
        }
        return [currentSessions.size > 0 && nextSessions.size === 0, next] as const;
      }).pipe(
        Effect.flatMap((becameOffline) =>
          becameOffline
            ? publishPresence(input.deviceId, false, input.disconnectedAt)
            : Effect.void,
        ),
      ),
    isOnline: (deviceId) =>
      Ref.get(onlineSessionsByDevice).pipe(
        Effect.map((current) => (current.get(deviceId)?.size ?? 0) > 0),
      ),
    getAnyOnlineSessionId: (deviceId) =>
      Ref.get(onlineSessionsByDevice).pipe(
        Effect.map((current) => {
          const sessionId = current.get(deviceId)?.values().next().value;
          return sessionId ? Option.some(sessionId as never) : Option.none();
        }),
      ),
  } satisfies DeviceRegistryShape;
});

export const DeviceRegistryLive = Layer.effect(DeviceRegistry, makeDeviceRegistry);
