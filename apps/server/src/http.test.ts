import { describe, expect, it } from "vitest";

import {
  isLoopbackHostname,
  resolveDevRedirectUrl,
  shouldRedirectPairToLogin,
  shouldRedirectRootToCloudApp,
} from "./http.ts";

describe("http dev routing", () => {
  it("treats localhost and loopback addresses as local", () => {
    expect(isLoopbackHostname("127.0.0.1")).toBe(true);
    expect(isLoopbackHostname("localhost")).toBe(true);
    expect(isLoopbackHostname("::1")).toBe(true);
    expect(isLoopbackHostname("[::1]")).toBe(true);
  });

  it("does not treat LAN addresses as local", () => {
    expect(isLoopbackHostname("192.168.86.35")).toBe(false);
    expect(isLoopbackHostname("10.0.0.24")).toBe(false);
    expect(isLoopbackHostname("example.local")).toBe(false);
  });

  it("preserves path and query when redirecting to the dev server", () => {
    const devUrl = new URL("http://127.0.0.1:5173/");
    const requestUrl = new URL("http://127.0.0.1:3774/pair?token=test-token");

    expect(resolveDevRedirectUrl(devUrl, requestUrl)).toBe(
      "http://127.0.0.1:5173/pair?token=test-token",
    );
  });

  it("redirects the legacy pairing route only for server-node cloud deployments", () => {
    expect(shouldRedirectPairToLogin("server-node", "/pair")).toBe(true);
    expect(shouldRedirectPairToLogin("web", "/pair")).toBe(false);
    expect(shouldRedirectPairToLogin("desktop", "/pair")).toBe(false);
    expect(shouldRedirectPairToLogin("server-node", "/pairing")).toBe(false);
  });

  it("redirects the legacy root route only for server-node cloud deployments", () => {
    expect(shouldRedirectRootToCloudApp("server-node", "/")).toBe(true);
    expect(shouldRedirectRootToCloudApp("web", "/")).toBe(false);
    expect(shouldRedirectRootToCloudApp("desktop", "/")).toBe(false);
    expect(shouldRedirectRootToCloudApp("server-node", "/app")).toBe(false);
  });
});
