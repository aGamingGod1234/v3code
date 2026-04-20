import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The build flag constant is captured at module load time (it's a
// `define`-injected literal in the actual bundle). We use dynamic
// imports to re-evaluate the module after setting
// `import.meta.env.VITE_V3_CLOUD_MODE` to different values — the vite
// vitest runner respects `vi.stubEnv`.

const reimport = async () => {
  vi.resetModules();
  return await import("./build-flags");
};

describe("IS_CLOUD_MODE", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("is false when the env var is unset", async () => {
    vi.stubEnv("VITE_V3_CLOUD_MODE", "");
    const mod = await reimport();
    expect(mod.IS_CLOUD_MODE).toBe(false);
    expect(mod.IS_HOST_CAPABLE_BUILD).toBe(true);
    expect(mod.CLOUD_MODE_BASE_PATH).toBe("/");
  });

  it("is true for `1`", async () => {
    vi.stubEnv("VITE_V3_CLOUD_MODE", "1");
    const mod = await reimport();
    expect(mod.IS_CLOUD_MODE).toBe(true);
    expect(mod.IS_HOST_CAPABLE_BUILD).toBe(false);
    expect(mod.CLOUD_MODE_BASE_PATH).toBe("/app");
  });

  it("is true for `true` (case-insensitive)", async () => {
    vi.stubEnv("VITE_V3_CLOUD_MODE", "TRUE");
    const mod = await reimport();
    expect(mod.IS_CLOUD_MODE).toBe(true);
  });

  it("is false for unexpected values", async () => {
    vi.stubEnv("VITE_V3_CLOUD_MODE", "maybe");
    const mod = await reimport();
    expect(mod.IS_CLOUD_MODE).toBe(false);
  });
});
