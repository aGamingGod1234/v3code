import {
  DeviceId,
  FcmNotificationEnvelope,
  PushNotificationCategory,
  ThreadId,
  TrimmedNonEmptyString,
  UserId,
} from "@v3tools/contracts";
import { Context } from "effect";
import type { Effect } from "effect";

import type { FcmPushError } from "../../identity/Errors.ts";

// V3 Phase 9 — FCM dispatch service.
//
// The mesh hub calls `enqueue` when a mesh event needs to reach a
// backgrounded mobile device. The implementation (layer at
// `apps/server/src/mesh/Layers/FcmPushService.ts`) loads the service
// account via `FcmPushConfigRepository`, fetches live push tokens via
// `DevicePushTokenRepository`, and posts to Firebase's v1 send API.
//
// The contract surface here intentionally stays tiny so we can unit-
// test the mesh integration against an in-memory dispatcher without
// touching Firebase. `sendNow` exists for the admin panel's "send
// test push" button — it short-circuits the enqueue step so operators
// can confirm FCM is working end-to-end after uploading the service
// account JSON.

export interface EnqueueInput {
  readonly userId: UserId;
  readonly targetDeviceIds: ReadonlyArray<DeviceId>;
  readonly category: PushNotificationCategory;
  readonly threadId: ThreadId | null;
  readonly title: string | null;
  readonly body: string | null;
  readonly data: Readonly<Record<string, string>>;
  readonly ttlSeconds: number;
  readonly priority: "normal" | "high";
}

export interface FcmDispatchReport {
  readonly envelope: FcmNotificationEnvelope;
  readonly deliveredTo: ReadonlyArray<DeviceId>;
  readonly invalidTokens: ReadonlyArray<typeof TrimmedNonEmptyString.Type>;
  readonly dispatchedAt: string;
}

export interface FcmPushServiceShape {
  readonly enqueue: (input: EnqueueInput) => Effect.Effect<FcmDispatchReport, FcmPushError>;
  readonly sendNow: (
    envelope: FcmNotificationEnvelope,
  ) => Effect.Effect<FcmDispatchReport, FcmPushError>;
  readonly isConfigured: () => Effect.Effect<boolean>;
}

export class FcmPushService extends Context.Service<FcmPushService, FcmPushServiceShape>()(
  "v3/mesh/Services/FcmPushService",
) {}

// Convenience decoder: turn a plain `EnqueueInput` into the wire-shape
// envelope the layer stores and returns. Shared so tests can construct
// predictable envelopes without threading a DateTime clock.
export const toEnvelope = (input: EnqueueInput, createdAt: string): FcmNotificationEnvelope => ({
  target_device_ids: input.targetDeviceIds,
  category: input.category,
  thread_id: input.threadId,
  title: input.title === null ? null : TrimmedNonEmptyString.make(input.title),
  body: input.body === null ? null : TrimmedNonEmptyString.make(input.body),
  data: input.data,
  ttl_seconds: input.ttlSeconds,
  priority: input.priority,
  created_at: createdAt,
});
