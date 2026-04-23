import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Minimal in-memory localStorage stub — jsdom is not configured for
// this vitest workspace (the webapp's unit suite runs in node
// environment) so we bolt a stub onto `window`.
const installLocalStorage = () => {
  const store = new Map<string, string>();
  const stub: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? (store.get(key) as string) : null),
    key: (index) => {
      const keys = Array.from(store.keys());
      return keys[index] ?? null;
    },
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
  const maybeGlobal = globalThis as { window?: { localStorage?: Storage } };
  if (!maybeGlobal.window) {
    maybeGlobal.window = { localStorage: stub };
  } else {
    maybeGlobal.window.localStorage = stub;
  }
};

beforeEach(() => {
  installLocalStorage();
  vi.resetModules();
});

afterEach(() => {
  vi.resetModules();
});

describe("githubTokenStore", () => {
  it("returns null when no token is present", async () => {
    const mod = await import("./githubTokenStore");
    expect(mod.readStoredGitHubToken()).toBeNull();
  });

  it("round-trips tokens", async () => {
    const mod = await import("./githubTokenStore");
    mod.storeGitHubToken({ token: "ghp_abc", scope: "repo" });
    const read = mod.readStoredGitHubToken();
    expect(read).not.toBeNull();
    expect(read?.token).toBe("ghp_abc");
    expect(read?.scope).toBe("repo");
    expect(typeof read?.savedAt).toBe("string");
  });

  it("clears tokens on request", async () => {
    const mod = await import("./githubTokenStore");
    mod.storeGitHubToken({ token: "ghp_xyz" });
    mod.clearGitHubToken();
    expect(mod.readStoredGitHubToken()).toBeNull();
  });

  it("gracefully handles corrupted JSON payloads", async () => {
    const maybeGlobal = globalThis as { window: { localStorage: Storage } };
    maybeGlobal.window.localStorage.setItem("v3.cloud-mode.github-token", "{not valid json");
    const mod = await import("./githubTokenStore");
    expect(mod.readStoredGitHubToken()).toBeNull();
  });
});
