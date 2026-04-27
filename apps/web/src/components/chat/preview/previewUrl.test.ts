import { describe, expect, it } from "vitest";

import { resolvePreviewUrl } from "./previewUrl.ts";

describe("resolvePreviewUrl", () => {
  it("returns null when nothing is known", () => {
    expect(
      resolvePreviewUrl({ hint: null, cloudProxyOrigin: null, cloudProxyPath: null }),
    ).toBeNull();
  });

  it("uses localhost hint when provided", () => {
    const resolved = resolvePreviewUrl({
      hint: {
        host: "localhost",
        origin: "http://127.0.0.1:3000",
        port: 3000,
        path: "/",
        detectedAt: "2026-04-22T10:00:00.000Z",
      },
      cloudProxyOrigin: null,
      cloudProxyPath: null,
    });
    expect(resolved).not.toBeNull();
    expect(resolved!.url).toBe("http://127.0.0.1:3000/");
    expect(resolved!.host).toBe("localhost");
  });

  it("rewrites cloud hints through the reverse proxy origin", () => {
    const resolved = resolvePreviewUrl({
      hint: {
        host: "cloud",
        origin: "http://container.internal:3000",
        port: 3000,
        path: "/dashboard",
        detectedAt: "2026-04-22T10:00:00.000Z",
      },
      cloudProxyOrigin: "https://v3.agaminggod.com",
      cloudProxyPath: null,
    });
    expect(resolved!.url).toBe("https://v3.agaminggod.com/dashboard");
    expect(resolved!.host).toBe("cloud");
  });

  it("falls back to a cloud proxy path when no hint exists", () => {
    const resolved = resolvePreviewUrl({
      hint: null,
      cloudProxyOrigin: "https://v3.agaminggod.com",
      cloudProxyPath: "/preview/chat-42/",
    });
    expect(resolved!.url).toBe("https://v3.agaminggod.com/preview/chat-42/");
    expect(resolved!.host).toBe("cloud");
    expect(resolved!.detectedAt).toBeNull();
  });

  it("normalises missing leading slashes in the path", () => {
    const resolved = resolvePreviewUrl({
      hint: {
        host: "localhost",
        origin: "http://localhost:5173",
        port: 5173,
        path: "dashboard",
        detectedAt: "2026-04-22T10:00:00.000Z",
      },
      cloudProxyOrigin: null,
      cloudProxyPath: null,
    });
    expect(resolved!.url).toBe("http://localhost:5173/dashboard");
  });
});
