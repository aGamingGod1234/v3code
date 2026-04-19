import { afterEach, describe, expect, it } from "vitest";

import { resolveClientServerMode } from "./useServerMode";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

describe("resolveClientServerMode", () => {
  it("treats desktop-managed bootstrap as desktop mode", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        desktopBridge: {
          getLocalEnvironmentBootstrap: () => ({
            httpBaseUrl: "http://127.0.0.1:3773",
            wsBaseUrl: "ws://127.0.0.1:3773",
          }),
        },
        location: { origin: "http://localhost:3773" },
      },
    });

    expect(resolveClientServerMode()).toBe("desktop");
  });

  it("treats loopback browser targets as web mode", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        desktopBridge: undefined,
        location: { origin: "http://127.0.0.1:3773" },
      },
    });

    expect(resolveClientServerMode()).toBe("web");
  });

  it("treats non-loopback browser targets as server-node mode", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        desktopBridge: undefined,
        location: { origin: "https://mesh.example.com" },
      },
    });

    expect(resolveClientServerMode()).toBe("server-node");
  });
});
