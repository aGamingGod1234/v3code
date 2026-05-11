import { DeviceId, type DeviceInfo, UserId } from "@v3tools/contracts";
import { DateTime } from "effect";
import { describe, expect, it } from "vitest";

import type { DeviceListSnapshot } from "../hooks/useDevices";
import { applyPresenceStreamItemToDeviceList } from "./meshPresence";

const makeDevice = (input: {
  readonly id: string;
  readonly name: string;
  readonly online: boolean;
  readonly lastSeenAt?: string | null;
}): DeviceInfo => ({
  id: DeviceId.make(input.id),
  userId: UserId.make("user-1"),
  name: input.name,
  platform: "windows",
  kind: "desktop",
  capabilities: ["execute", "codex", "terminal"],
  approved: true,
  online: input.online,
  firstSeenAt: DateTime.fromDateUnsafe(new Date("2026-04-19T00:00:00.000Z")),
  lastSeenAt:
    input.lastSeenAt === undefined || input.lastSeenAt === null
      ? null
      : DateTime.fromDateUnsafe(new Date(input.lastSeenAt)),
});

const makeSnapshot = (): DeviceListSnapshot => ({
  currentDeviceId: DeviceId.make("device-a"),
  devices: [
    makeDevice({
      id: "device-a",
      name: "Desktop",
      online: true,
      lastSeenAt: "2026-04-19T01:00:00.000Z",
    }),
    makeDevice({
      id: "device-b",
      name: "Laptop",
      online: false,
      lastSeenAt: "2026-04-19T00:30:00.000Z",
    }),
  ],
});

describe("applyPresenceStreamItemToDeviceList", () => {
  it("applies a presence snapshot to existing devices", () => {
    const result = applyPresenceStreamItemToDeviceList(makeSnapshot(), {
      kind: "snapshot",
      snapshot: {
        devices: [
          {
            device_id: DeviceId.make("device-a"),
            online: true,
            last_seen_at: "2026-04-19T01:00:00.000Z",
          },
          {
            device_id: DeviceId.make("device-b"),
            online: true,
            last_seen_at: "2026-04-19T01:15:00.000Z",
          },
        ],
      },
    });

    expect(result?.devices[1]?.online).toBe(true);
    expect(DateTime.formatIso(result!.devices[1]!.lastSeenAt!)).toBe("2026-04-19T01:15:00.000Z");
  });

  it("applies a live update without changing unknown devices", () => {
    const snapshot = makeSnapshot();
    const result = applyPresenceStreamItemToDeviceList(snapshot, {
      kind: "presence",
      update: {
        device_id: DeviceId.make("device-b"),
        online: true,
        last_seen_at: "2026-04-19T02:00:00.000Z",
      },
    });

    expect(result).not.toBe(snapshot);
    expect(result?.devices[0]).toBe(snapshot.devices[0]);
    expect(result?.devices[1]?.online).toBe(true);
  });

  it("keeps the same snapshot when the update does not affect known devices", () => {
    const snapshot = makeSnapshot();
    const result = applyPresenceStreamItemToDeviceList(snapshot, {
      kind: "presence",
      update: {
        device_id: DeviceId.make("device-unknown"),
        online: true,
        last_seen_at: "2026-04-19T02:00:00.000Z",
      },
    });

    expect(result).toBe(snapshot);
  });

  it("keeps the previous last-seen value when the stream timestamp is invalid", () => {
    const snapshot = makeSnapshot();
    const result = applyPresenceStreamItemToDeviceList(snapshot, {
      kind: "presence",
      update: {
        device_id: DeviceId.make("device-b"),
        online: true,
        last_seen_at: "not-a-date",
      },
    });

    expect(result?.devices[1]?.online).toBe(true);
    expect(DateTime.formatIso(result!.devices[1]!.lastSeenAt!)).toBe("2026-04-19T00:30:00.000Z");
  });
});
