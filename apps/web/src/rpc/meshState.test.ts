import { DeviceId, type DeviceInfo, UserId } from "@v3tools/contracts";
import * as DateTime from "effect/DateTime";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resetAppAtomRegistryForTests } from "./atomRegistry";
import { getMeshDeviceSnapshot, resetMeshStateForTests, setMeshDeviceSnapshot } from "./meshState";

const baseDevice = (id: string): DeviceInfo => ({
  id: DeviceId.make(id),
  userId: UserId.make("user-1"),
  name: `Device ${id}`,
  platform: "windows",
  kind: "desktop",
  capabilities: ["codex", "terminal"],
  approved: true,
  online: true,
  firstSeenAt: DateTime.fromDateUnsafe(new Date("2026-04-19T00:00:00.000Z")),
  lastSeenAt: DateTime.fromDateUnsafe(new Date("2026-04-19T01:00:00.000Z")),
});

beforeEach(() => {
  resetAppAtomRegistryForTests();
  resetMeshStateForTests();
});

afterEach(() => {
  resetAppAtomRegistryForTests();
});

describe("meshState", () => {
  it("stores and resets the mesh device snapshot", () => {
    setMeshDeviceSnapshot({
      currentDeviceId: DeviceId.make("device-current"),
      devices: [baseDevice("device-current"), baseDevice("device-other")],
      isPending: true,
      errorMessage: "network failure",
    });

    expect(getMeshDeviceSnapshot()).toEqual({
      currentDeviceId: DeviceId.make("device-current"),
      devices: [baseDevice("device-current"), baseDevice("device-other")],
      isPending: true,
      errorMessage: "network failure",
    });

    resetMeshStateForTests();

    expect(getMeshDeviceSnapshot()).toEqual({
      currentDeviceId: null,
      devices: [],
      isPending: false,
      errorMessage: null,
    });
  });
});
