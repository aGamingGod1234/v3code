import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DriveDeviceEntry, V3DriveAppDataClient } from "@v3tools/client-runtime";
import { V3DriveClientError } from "@v3tools/client-runtime";

import {
  __resetV3DriveAppDataSnapshotForTests,
  captureDriveAppDataSnapshot,
  getV3DriveAppDataSnapshot,
} from "./driveAppData";

const FROZEN_NOW = () => new Date("2026-04-19T00:00:00.000Z");
const FROZEN_ISO = "2026-04-19T00:00:00.000Z";

const LAPTOP: DriveDeviceEntry = {
  device_id: "device-laptop",
  name: "Laptop",
  added_at: "2026-04-19T00:00:00.000Z",
};

const DESKTOP: DriveDeviceEntry = {
  device_id: "device-desktop",
  name: "Desktop",
  added_at: "2026-04-18T10:00:00.000Z",
};

interface StorageShape {
  readonly storage: Map<string, string>;
}

const installFakeStorage = (): StorageShape => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    },
  });
  return { storage };
};

interface StubClientSpec {
  readonly read: V3DriveAppDataClient["read"];
  readonly appendDevice?: V3DriveAppDataClient["appendDevice"];
}

const makeStubClient = (spec: StubClientSpec): V3DriveAppDataClient => ({
  read: spec.read,
  readOrInit: async (_token) => {
    throw new Error("readOrInit not exercised in these tests");
  },
  write: async (_token, _config) => {
    throw new Error("write not exercised in these tests");
  },
  appendDevice:
    spec.appendDevice ??
    (async (_token, _entry) => {
      throw new Error("appendDevice not expected in this test");
    }),
});

const silentLogger = { warn: () => undefined };

beforeEach(() => {
  installFakeStorage();
});

afterEach(() => {
  __resetV3DriveAppDataSnapshotForTests();
  Reflect.deleteProperty(globalThis, "window");
});

describe("captureDriveAppDataSnapshot", () => {
  it("returns an empty snapshot when no blob exists and does not call appendDevice", async () => {
    let appendCalls = 0;
    const snapshot = await captureDriveAppDataSnapshot({
      accessToken: "token",
      thisDevice: LAPTOP,
      now: FROZEN_NOW,
      logger: silentLogger,
      client: makeStubClient({
        read: async () => null,
        appendDevice: async () => {
          appendCalls += 1;
          throw new Error("should not append");
        },
      }),
    });
    expect(snapshot).toEqual({
      serverUrl: null,
      devices: [],
      blobExists: false,
      capturedAt: FROZEN_ISO,
      error: null,
    });
    expect(appendCalls).toBe(0);
    expect(getV3DriveAppDataSnapshot()).toEqual(snapshot);
  });

  it("captures the existing blob without writing when server_url is absent", async () => {
    let appendCalls = 0;
    const snapshot = await captureDriveAppDataSnapshot({
      accessToken: "token",
      thisDevice: LAPTOP,
      now: FROZEN_NOW,
      logger: silentLogger,
      client: makeStubClient({
        read: async () => ({
          v3_config: { device_list: [DESKTOP] },
        }),
        appendDevice: async () => {
          appendCalls += 1;
          throw new Error("should not append when server_url missing");
        },
      }),
    });
    expect(appendCalls).toBe(0);
    expect(snapshot).toEqual({
      serverUrl: null,
      devices: [DESKTOP],
      blobExists: true,
      capturedAt: FROZEN_ISO,
      error: null,
    });
  });

  it("skips append and captures as-is when this device is already listed", async () => {
    let appendCalls = 0;
    const snapshot = await captureDriveAppDataSnapshot({
      accessToken: "token",
      thisDevice: DESKTOP,
      now: FROZEN_NOW,
      logger: silentLogger,
      client: makeStubClient({
        read: async () => ({
          v3_config: {
            server_url: "https://v3.agaminggod.com",
            device_list: [DESKTOP],
          },
        }),
        appendDevice: async () => {
          appendCalls += 1;
          throw new Error("should not re-append");
        },
      }),
    });
    expect(appendCalls).toBe(0);
    expect(snapshot.devices).toEqual([DESKTOP]);
    expect(snapshot.serverUrl).toBe("https://v3.agaminggod.com");
  });

  it("appends this device when server_url is set and we are missing", async () => {
    let appendedWith: DriveDeviceEntry | null = null;
    const snapshot = await captureDriveAppDataSnapshot({
      accessToken: "token",
      thisDevice: LAPTOP,
      now: FROZEN_NOW,
      logger: silentLogger,
      client: makeStubClient({
        read: async () => ({
          v3_config: {
            server_url: "https://v3.agaminggod.com",
            device_list: [DESKTOP],
          },
        }),
        appendDevice: async (_token, entry) => {
          appendedWith = entry;
          return {
            v3_config: {
              server_url: "https://v3.agaminggod.com",
              device_list: [DESKTOP, entry],
            },
          };
        },
      }),
    });
    expect(appendedWith).toEqual(LAPTOP);
    expect(snapshot.devices).toEqual([DESKTOP, LAPTOP]);
    expect(snapshot.error).toBeNull();
  });

  it("log-and-ignores Drive read failures (keeps sign-in flowing)", async () => {
    const warnings: string[] = [];
    const snapshot = await captureDriveAppDataSnapshot({
      accessToken: "token",
      thisDevice: LAPTOP,
      now: FROZEN_NOW,
      logger: { warn: (message: unknown) => warnings.push(String(message)) },
      client: makeStubClient({
        read: async () => {
          throw new V3DriveClientError({
            reason: "unauthorized",
            message: "bad token",
            status: 401,
          });
        },
      }),
    });
    expect(snapshot.error).toBe("unauthorized");
    expect(snapshot.blobExists).toBe(false);
    expect(warnings[0]).toContain("unauthorized");
    expect(getV3DriveAppDataSnapshot()).toEqual(snapshot);
  });

  it("log-and-ignores quota-exhausted on append and keeps the last good state", async () => {
    const warnings: string[] = [];
    const snapshot = await captureDriveAppDataSnapshot({
      accessToken: "token",
      thisDevice: LAPTOP,
      now: FROZEN_NOW,
      logger: { warn: (message: unknown) => warnings.push(String(message)) },
      client: makeStubClient({
        read: async () => ({
          v3_config: {
            server_url: "https://v3.agaminggod.com",
            device_list: [DESKTOP],
          },
        }),
        appendDevice: async () => {
          throw new V3DriveClientError({
            reason: "quota-exhausted",
            message: "full",
            status: 403,
          });
        },
      }),
    });
    expect(snapshot.error).toBe("quota-exhausted");
    expect(snapshot.serverUrl).toBe("https://v3.agaminggod.com");
    expect(snapshot.devices).toEqual([DESKTOP]);
    expect(warnings[0]).toContain("quota-exhausted");
  });
});
