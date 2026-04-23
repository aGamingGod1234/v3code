import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { DeviceInfo, DeviceId, UserId } from "@v3tools/contracts";
import { DateTime } from "effect";

import { RemoteHostBanner } from "./RemoteHostBanner";

const DEVICE_BASE: Omit<DeviceInfo, "id" | "name" | "online"> = {
  userId: "user-1" as UserId,
  platform: "linux",
  kind: "desktop",
  capabilities: ["claude_code"],
  approved: true,
  firstSeenAt: DateTime.makeUnsafe("2026-04-20T10:00:00Z"),
  lastSeenAt: DateTime.makeUnsafe("2026-04-21T18:00:00Z"),
};

const makeDevice = (id: string, name: string, online: boolean): DeviceInfo => ({
  ...DEVICE_BASE,
  id: id as DeviceId,
  name,
  online,
});

describe("RemoteHostBanner", () => {
  it("renders nothing for a locally hosted chat", () => {
    const markup = renderToStaticMarkup(
      <RemoteHostBanner
        currentDeviceId={"device-a" as DeviceId}
        hostDeviceId={"device-a" as DeviceId}
        devices={[makeDevice("device-a", "Desktop", true)]}
      />,
    );

    expect(markup).toBe("");
  });

  it("renders the spec §8.2 strip when host is a different online device", () => {
    const markup = renderToStaticMarkup(
      <RemoteHostBanner
        currentDeviceId={"device-laptop" as DeviceId}
        hostDeviceId={"device-desktop" as DeviceId}
        devices={[
          makeDevice("device-laptop", "Laptop", true),
          makeDevice("device-desktop", "Desktop", true),
        ]}
      />,
    );

    expect(markup).toContain("Viewing chat hosted on Desktop");
    expect(markup).toContain("All prompts you send will run there");
  });

  it("warns that prompts queue when the remote host is offline", () => {
    const markup = renderToStaticMarkup(
      <RemoteHostBanner
        currentDeviceId={"device-laptop" as DeviceId}
        hostDeviceId={"device-desktop" as DeviceId}
        devices={[
          makeDevice("device-laptop", "Laptop", true),
          makeDevice("device-desktop", "Desktop", false),
        ]}
      />,
    );

    expect(markup).toContain("Viewing chat hosted on Desktop");
    expect(markup).toContain("Desktop is offline");
  });

  it("falls back to a generic label when the host device is unknown", () => {
    const markup = renderToStaticMarkup(
      <RemoteHostBanner
        currentDeviceId={"device-laptop" as DeviceId}
        hostDeviceId={"device-ghost" as DeviceId}
        devices={[makeDevice("device-laptop", "Laptop", true)]}
      />,
    );

    expect(markup).toContain("Viewing chat hosted on another device");
  });
});
