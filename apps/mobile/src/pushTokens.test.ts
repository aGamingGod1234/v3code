import { describe, expect, it } from "vitest";

import { makePushBridge, normalisePushNotification, normalisePushToken } from "./pushTokens.ts";

const NOW = new Date("2026-04-22T10:15:00.000Z");

const bridgeInput = {
  deviceId: "3fae2de7-8a28-4b96-9b2a-8f62dfabc123" as never,
  platform: "android" as const,
  appVersion: "0.0.20",
  now: () => NOW,
};

describe("normalisePushToken", () => {
  it("stamps the token with device id + now + provider", () => {
    const registration = normalisePushToken(bridgeInput, "fcm-token-xyz");
    expect(registration).toMatchObject({
      device_id: bridgeInput.deviceId,
      platform: "android",
      provider: "fcm",
      token: "fcm-token-xyz",
      app_version: "0.0.20",
      issued_at: "2026-04-22T10:15:00.000Z",
    });
  });
});

describe("normalisePushNotification", () => {
  it("infers chat_response when chat_id is present", () => {
    const normalised = normalisePushNotification(NOW, {
      title: "Claude replied",
      body: "New response in V3 debug",
      data: { chat_id: "chat-123" },
    });
    expect(normalised.category).toBe("chat_response");
    expect(normalised.chat_id).toBe("chat-123");
  });

  it("respects explicit category fields", () => {
    const normalised = normalisePushNotification(NOW, {
      data: { category: "container_killed", chat_id: "chat-42" },
    });
    expect(normalised.category).toBe("container_killed");
    expect(normalised.chat_id).toBe("chat-42");
  });

  it("falls back to generic when no signal is present", () => {
    const normalised = normalisePushNotification(NOW, { data: {} });
    expect(normalised.category).toBe("generic");
    expect(normalised.chat_id).toBeNull();
  });
});

describe("makePushBridge", () => {
  it("dedupes empty tokens", async () => {
    let published = 0;
    const bridge = makePushBridge(bridgeInput, {
      publishToken: () => {
        published += 1;
      },
      deliverNotification: () => undefined,
    });
    await bridge.onTokenReceived("");
    expect(published).toBe(0);
    await bridge.onTokenReceived("real-token");
    expect(published).toBe(1);
  });

  it("forwards notifications through the callback", async () => {
    const seen: Array<string | null> = [];
    const bridge = makePushBridge(bridgeInput, {
      publishToken: () => undefined,
      deliverNotification: (notification) => {
        seen.push(notification.chat_id);
      },
    });
    await bridge.onNotificationReceived({
      title: "hi",
      body: "hi",
      data: { chat_id: "chat-1" },
    });
    expect(seen).toEqual(["chat-1"]);
  });
});
