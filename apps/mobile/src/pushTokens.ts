// V3 Phase 9 — FCM token registration helpers.
//
// The Capacitor Firebase Messaging plugin emits two events relevant to
// the V3 mesh:
//
//   1. `tokenReceived` — fires once after `getToken()` succeeds, then
//      again whenever the token rotates (Google policy: ~30d or on
//      re-install). We push every token to the server so the FCM push
//      service always has a live target.
//   2. `notificationReceived` — fires when FCM delivers a data-only
//      message to a foreground / backgrounded app. The spec uses these
//      for three things:
//        - chat response arrived while app backgrounded
//        - device approval requested
//        - Cloud env container killed unexpectedly
//
// This module owns the *bridge* logic: take a plugin-emitted token /
// notification, normalize it into the mesh push contracts, and hand
// it to a `publishToken` / `deliverNotification` callback the caller
// supplies. Keeping the callbacks injected means both the real
// runtime and unit tests can drive the bridge without mocking the
// plugin itself.

import type { DeviceId } from "@v3tools/contracts";
import type { NativePlatform } from "./platform.ts";

export type PushProvider = "fcm" | "apns";

export interface PushTokenRegistration {
  readonly device_id: DeviceId;
  readonly platform: NativePlatform;
  readonly provider: PushProvider;
  readonly token: string;
  readonly app_version: string;
  readonly issued_at: string;
}

export type IncomingPushCategory =
  | "chat_response"
  | "device_approval_requested"
  | "container_killed"
  | "generic";

export interface IncomingPushNotification {
  readonly category: IncomingPushCategory;
  readonly chat_id: string | null;
  readonly device_id: string | null;
  readonly title: string | null;
  readonly body: string | null;
  readonly received_at: string;
}

export interface PushBridgeCallbacks {
  readonly publishToken: (registration: PushTokenRegistration) => Promise<void> | void;
  readonly deliverNotification: (notification: IncomingPushNotification) => Promise<void> | void;
}

export interface PushBridgeInput {
  readonly deviceId: DeviceId;
  readonly platform: NativePlatform;
  readonly appVersion: string;
  readonly now: () => Date;
}

const inferCategory = (raw: Record<string, unknown> | null | undefined): IncomingPushCategory => {
  if (raw === null || raw === undefined) return "generic";
  const explicit = typeof raw.category === "string" ? raw.category.trim() : "";
  if (
    explicit === "chat_response" ||
    explicit === "device_approval_requested" ||
    explicit === "container_killed" ||
    explicit === "generic"
  ) {
    return explicit;
  }
  if (typeof raw.chat_id === "string" && raw.chat_id.length > 0) return "chat_response";
  if (typeof raw.device_approval === "string" || raw.device_approval === true) {
    return "device_approval_requested";
  }
  if (typeof raw.container_killed === "string" || raw.container_killed === true) {
    return "container_killed";
  }
  return "generic";
};

export const normalisePushToken = (
  input: PushBridgeInput,
  rawToken: string,
  provider: PushProvider = "fcm",
): PushTokenRegistration => ({
  device_id: input.deviceId,
  platform: input.platform,
  provider,
  token: rawToken,
  app_version: input.appVersion,
  issued_at: input.now().toISOString(),
});

export const normalisePushNotification = (
  now: Date,
  notification: { title?: string | null; body?: string | null; data?: Record<string, unknown> },
): IncomingPushNotification => {
  const data = notification.data ?? {};
  const chatIdRaw = data.chat_id;
  const deviceIdRaw = data.device_id;
  return {
    category: inferCategory(data),
    chat_id: typeof chatIdRaw === "string" && chatIdRaw.length > 0 ? chatIdRaw : null,
    device_id: typeof deviceIdRaw === "string" && deviceIdRaw.length > 0 ? deviceIdRaw : null,
    title: notification.title ?? null,
    body: notification.body ?? null,
    received_at: now.toISOString(),
  };
};

export const makePushBridge = (input: PushBridgeInput, callbacks: PushBridgeCallbacks) => {
  return {
    onTokenReceived: async (token: string, provider: PushProvider = "fcm") => {
      if (!token || token.length === 0) return;
      const registration = normalisePushToken(input, token, provider);
      await callbacks.publishToken(registration);
    },
    onNotificationReceived: async (
      notification: Parameters<typeof normalisePushNotification>[1],
    ) => {
      const normalised = normalisePushNotification(input.now(), notification);
      await callbacks.deliverNotification(normalised);
    },
  };
};
