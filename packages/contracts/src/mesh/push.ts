// V3 Phase 9 — mobile push notification contracts.
//
// Two distinct surfaces live in this module:
//
//   1. `PushTokenRegistration` — client → server, the mesh RPC used
//      by mobile clients to register their FCM / APNs device token.
//      Tokens rotate periodically (Google's policy) so the RPC is
//      idempotent on `(device_id, provider, token)` — repeat sends
//      update `last_seen_at` without creating duplicate rows.
//
//   2. `FcmNotificationEnvelope` — server-side representation of a
//      push message enqueued by the mesh hub. Produced by things like
//      "chat response arrived while receiver is backgrounded",
//      "Cloud env container killed", and "new device approval
//      requested." The envelope is the input to
//      `apps/server/src/mesh/Services/FcmPushService.ts` which
//      hands it off to the FCM Admin SDK.
//
// Both shapes use `TrimmedNonEmptyString` + branded ids so the
// `mesh.*` RPC registrations can decode them directly without extra
// coercion at the handler layer.

import { Schema } from "effect";

import { NonNegativeInt, ThreadId, TrimmedNonEmptyString } from "../baseSchemas.ts";
import { DeviceId, DevicePlatform } from "../identity.ts";

export const PushProvider = Schema.Literals(["fcm", "apns"]);
export type PushProvider = typeof PushProvider.Type;

export const PushRegistrationPayload = Schema.Struct({
  device_id: DeviceId,
  platform: DevicePlatform,
  provider: PushProvider,
  token: TrimmedNonEmptyString,
  app_version: TrimmedNonEmptyString,
  issued_at: Schema.String,
});
export type PushRegistrationPayload = typeof PushRegistrationPayload.Type;

export const PushTokenRegistrationResult = Schema.Struct({
  registered_at: Schema.String,
  rotated: Schema.Boolean,
});
export type PushTokenRegistrationResult = typeof PushTokenRegistrationResult.Type;

export const PushUnregistrationPayload = Schema.Struct({
  device_id: DeviceId,
  token: TrimmedNonEmptyString,
});
export type PushUnregistrationPayload = typeof PushUnregistrationPayload.Type;

// Categories mirror the native bridge in `apps/mobile/src/pushTokens.ts`
// so the Android shell can branch on the category for UI purposes
// without re-parsing the data payload.
export const PushNotificationCategory = Schema.Literals([
  "chat_response",
  "device_approval_requested",
  "container_killed",
  "generic",
]);
export type PushNotificationCategory = typeof PushNotificationCategory.Type;

// Envelope produced by the mesh hub when a user's physical device
// receives something actionable while backgrounded. The
// `FcmPushService` consumer serialises this into an FCM data-only
// message; `notification` is present only for categories we want to
// render in the system tray even if the JS bridge never boots (e.g.
// `container_killed` should wake the user regardless).
export const FcmNotificationEnvelope = Schema.Struct({
  target_device_ids: Schema.Array(DeviceId),
  category: PushNotificationCategory,
  thread_id: Schema.NullOr(ThreadId),
  title: Schema.NullOr(TrimmedNonEmptyString),
  body: Schema.NullOr(TrimmedNonEmptyString),
  data: Schema.Record(Schema.String, Schema.String),
  ttl_seconds: NonNegativeInt,
  priority: Schema.Literals(["normal", "high"]),
  created_at: Schema.String,
});
export type FcmNotificationEnvelope = typeof FcmNotificationEnvelope.Type;

export const MESH_PUSH_WS_METHODS = {
  registerPushToken: "mesh.registerPushToken",
  unregisterPushToken: "mesh.unregisterPushToken",
} as const;

export const MeshRegisterPushTokenInput = PushRegistrationPayload;
export type MeshRegisterPushTokenInput = typeof MeshRegisterPushTokenInput.Type;

export const MeshUnregisterPushTokenInput = PushUnregistrationPayload;
export type MeshUnregisterPushTokenInput = typeof MeshUnregisterPushTokenInput.Type;

export const MeshPushRpcSchemas = {
  registerPushToken: {
    input: MeshRegisterPushTokenInput,
    output: PushTokenRegistrationResult,
  },
  unregisterPushToken: {
    input: MeshUnregisterPushTokenInput,
    output: Schema.Struct({ acknowledged: Schema.Boolean }),
  },
} as const;
