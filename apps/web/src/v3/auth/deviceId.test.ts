import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { __resetDeviceIdForTests, resolveDeviceId } from "./deviceId";

interface FakeStorage {
  readonly storage: Map<string, string>;
}

const makeFakeStorage = (): FakeStorage => {
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

beforeEach(() => {
  makeFakeStorage();
});

afterEach(() => {
  __resetDeviceIdForTests();
  Reflect.deleteProperty(globalThis, "window");
});

describe("resolveDeviceId", () => {
  it("mints a UUID v4 on first call when storage is empty", () => {
    const id = resolveDeviceId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("returns the same id on subsequent calls within a session", () => {
    const first = resolveDeviceId();
    const second = resolveDeviceId();
    expect(second).toBe(first);
  });

  it("regenerates the id when the stored value is malformed", () => {
    const fake = makeFakeStorage();
    fake.storage.set("v3.device-id", "not-a-uuid");
    const id = resolveDeviceId();
    expect(id).not.toBe("not-a-uuid");
    expect(id).toMatch(/^[0-9a-f]{8}-/);
    expect(fake.storage.get("v3.device-id")).toBe(id);
  });

  it("survives a localStorage write failure by returning a freshly minted id", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: () => null,
          setItem: () => {
            throw new Error("quota exceeded");
          },
          removeItem: () => undefined,
        },
      },
    });
    const id = resolveDeviceId();
    expect(id).toMatch(/^[0-9a-f]{8}-/);
  });
});
