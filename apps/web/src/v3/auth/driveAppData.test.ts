import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
  DriveDeviceEntry,
  V3DriveAppDataClient,
  V3DriveConfig,
} from "@v3tools/client-runtime";
import { V3DriveClientError } from "@v3tools/client-runtime";

import {
  __resetV3DriveAppDataSnapshotForTests,
  captureDriveAppDataSnapshot,
  getV3DriveAppDataSnapshot,
} from "./driveAppData";
import {
  clearPendingDrivePublish,
  readPendingDrivePublish,
  writePendingDrivePublish,
} from "./drivePublishState";

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

const EMPTY_CONFIG: V3DriveConfig = {
  v3_config: {
    device_list: [],
  },
};

const CONFIG_WITH_DESKTOP: V3DriveConfig = {
  v3_config: {
    device_list: [DESKTOP],
  },
};

const CONFIG_WITH_SERVER: V3DriveConfig = {
  v3_config: {
    server_url: "https://v3.agaminggod.com",
    device_list: [DESKTOP],
  },
};

const silentLogger = { warn: () => undefined };

const installFakeStorage = () => {
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
  return storage;
};

interface StubClientSpec {
  readonly read: V3DriveAppDataClient["read"];
  readonly readOrInit?: V3DriveAppDataClient["readOrInit"];
  readonly write?: V3DriveAppDataClient["write"];
}

const makeStubClient = (spec: StubClientSpec): V3DriveAppDataClient => ({
  read: spec.read,
  readOrInit:
    spec.readOrInit ??
    (async () => {
      throw new Error("readOrInit not expected in this test");
    }),
  write:
    spec.write ??
    (async () => {
      throw new Error("write not expected in this test");
    }),
  appendDevice: async () => {
    throw new Error("appendDevice should not be used by the current implementation");
  },
});

beforeEach(() => {
  installFakeStorage();
});

afterEach(() => {
  clearPendingDrivePublish();
  __resetV3DriveAppDataSnapshotForTests();
  Reflect.deleteProperty(globalThis, "window");
});

describe("captureDriveAppDataSnapshot", () => {
  it("initializes a missing blob and appends this device before a server URL exists", async () => {
    let readOrInitCalls = 0;
    let writtenConfig: V3DriveConfig | null = null;

    const snapshot = await captureDriveAppDataSnapshot({
      accessToken: "token",
      thisDevice: LAPTOP,
      now: FROZEN_NOW,
      logger: silentLogger,
      client: makeStubClient({
        read: async () => null,
        readOrInit: async () => {
          readOrInitCalls += 1;
          return EMPTY_CONFIG;
        },
        write: async (_token, config) => {
          writtenConfig = config;
        },
      }),
    });

    expect(readOrInitCalls).toBe(1);
    expect(writtenConfig).toEqual({
      v3_config: {
        device_list: [LAPTOP],
      },
    });
    expect(snapshot).toEqual({
      serverUrl: null,
      devices: [LAPTOP],
      blobExists: true,
      capturedAt: FROZEN_ISO,
      error: null,
    });
    expect(getV3DriveAppDataSnapshot()).toEqual(snapshot);
  });

  it("appends the current device to an existing blob even before server_url is published", async () => {
    let writtenConfig: V3DriveConfig | null = null;

    const snapshot = await captureDriveAppDataSnapshot({
      accessToken: "token",
      thisDevice: LAPTOP,
      now: FROZEN_NOW,
      logger: silentLogger,
      client: makeStubClient({
        read: async () => CONFIG_WITH_DESKTOP,
        write: async (_token, config) => {
          writtenConfig = config;
        },
      }),
    });

    expect(writtenConfig).toEqual({
      v3_config: {
        device_list: [DESKTOP, LAPTOP],
      },
    });
    expect(snapshot).toEqual({
      serverUrl: null,
      devices: [DESKTOP, LAPTOP],
      blobExists: true,
      capturedAt: FROZEN_ISO,
      error: null,
    });
  });

  it("consumes a pending setup publish and persists the server metadata", async () => {
    let writtenConfig: V3DriveConfig | null = null;
    writePendingDrivePublish({
      server_url: "https://mesh.example.com",
      server_version_installed: "3.0.0",
      setup_at: "2026-04-19T00:00:00.000Z",
      device_id: LAPTOP.device_id,
      device_name: LAPTOP.name,
    });

    const snapshot = await captureDriveAppDataSnapshot({
      accessToken: "token",
      thisDevice: LAPTOP,
      now: FROZEN_NOW,
      logger: silentLogger,
      client: makeStubClient({
        read: async () => CONFIG_WITH_DESKTOP,
        write: async (_token, config) => {
          writtenConfig = config;
        },
      }),
    });

    expect(writtenConfig).toEqual({
      v3_config: {
        server_url: "https://mesh.example.com",
        server_version_installed: "3.0.0",
        setup_at: "2026-04-19T00:00:00.000Z",
        device_list: [DESKTOP, LAPTOP],
      },
    });
    expect(readPendingDrivePublish()).toBeNull();
    expect(snapshot).toEqual({
      serverUrl: "https://mesh.example.com",
      devices: [DESKTOP, LAPTOP],
      blobExists: true,
      capturedAt: FROZEN_ISO,
      error: null,
    });
  });

  it("logs and ignores Drive read failures so sign-in can continue", async () => {
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

    expect(snapshot).toEqual({
      serverUrl: null,
      devices: [],
      blobExists: false,
      capturedAt: FROZEN_ISO,
      error: "unauthorized",
    });
    expect(warnings[0]).toContain("unauthorized");
    expect(getV3DriveAppDataSnapshot()).toEqual(snapshot);
  });

  it("keeps the last good snapshot when Drive writes fail", async () => {
    const warnings: string[] = [];

    const snapshot = await captureDriveAppDataSnapshot({
      accessToken: "token",
      thisDevice: LAPTOP,
      now: FROZEN_NOW,
      logger: { warn: (message: unknown) => warnings.push(String(message)) },
      client: makeStubClient({
        read: async () => CONFIG_WITH_SERVER,
        write: async () => {
          throw new V3DriveClientError({
            reason: "quota-exhausted",
            message: "full",
            status: 403,
          });
        },
      }),
    });

    expect(snapshot).toEqual({
      serverUrl: "https://v3.agaminggod.com",
      devices: [DESKTOP],
      blobExists: true,
      capturedAt: FROZEN_ISO,
      error: "quota-exhausted",
    });
    expect(warnings[0]).toContain("quota-exhausted");
  });
});
