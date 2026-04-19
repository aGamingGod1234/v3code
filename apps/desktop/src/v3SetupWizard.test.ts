import { describe, expect, it, vi } from "vitest";

import {
  extractVersion,
  probeCloudflaredWith,
  probeDockerWith,
  probePathsWith,
  probePortWith,
  resolveDefaultDataDirectory,
  resolveServerNodeConfigPath,
  writeServerNodeConfigWith,
  type CommandRunner,
  type WizardFileSystem,
} from "./v3SetupWizard.ts";

const makeCommandRunner = (
  impl: (
    command: string,
    args: ReadonlyArray<string>,
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>,
): CommandRunner => ({
  run: (command: string, args: ReadonlyArray<string>) => impl(command, args),
});

const missingCommand = (command: string) =>
  makeCommandRunner(async () => {
    const error = Object.assign(new Error(`Command not found: ${command}`), { code: "ENOENT" });
    throw error;
  });

const failingCommand = (message: string) =>
  makeCommandRunner(async () => {
    throw new Error(message);
  });

describe("extractVersion", () => {
  it("parses Docker's version string", () => {
    expect(extractVersion("Docker version 27.2.0, build abc123")).toBe("27.2.0");
  });

  it("parses cloudflared's version string", () => {
    expect(extractVersion("cloudflared version 2024.3.0 (built 2024-03-12)")).toBe("2024.3.0");
  });

  it("returns null when there is no matching pattern", () => {
    expect(extractVersion("unexpected output")).toBeNull();
  });
});

describe("probeDockerWith", () => {
  it("returns ok with a parsed version on success", async () => {
    const runner = makeCommandRunner(async (command) => {
      expect(command).toBe("docker");
      return { stdout: "Docker version 27.0.0, build xyz", stderr: "", exitCode: 0 };
    });
    const result = await probeDockerWith(runner);
    expect(result).toEqual({ status: "ok", version: "27.0.0", message: null });
  });

  it("returns missing when the binary is not on PATH", async () => {
    const result = await probeDockerWith(missingCommand("docker"));
    expect(result.status).toBe("missing");
    expect(result.version).toBeNull();
  });

  it("returns error with a human message for non-ENOENT failures", async () => {
    const result = await probeDockerWith(
      failingCommand('Command "docker" exited 1: Cannot connect to the Docker daemon'),
    );
    expect(result.status).toBe("error");
    expect(result.message).toContain("Cannot connect");
  });
});

describe("probeCloudflaredWith", () => {
  it("returns missing with the install docs URL when cloudflared is absent", async () => {
    const result = await probeCloudflaredWith(missingCommand("cloudflared"));
    expect(result.status).toBe("missing");
    expect(result.installDocsUrl).toContain("cloudflare.com");
  });

  it("returns ok when cloudflared is available", async () => {
    const runner = makeCommandRunner(async () => ({
      stdout: "cloudflared version 2024.3.0 (built 2024-03-12)",
      stderr: "",
      exitCode: 0,
    }));
    const result = await probeCloudflaredWith(runner);
    expect(result.status).toBe("ok");
    expect(result.version).toBe("2024.3.0");
  });
});

describe("probePortWith", () => {
  it("reports a port as available when no server is currently using it", async () => {
    // Pick a high random port unlikely to be in use.
    const port = 53_210;
    const result = await probePortWith(port);
    expect(result.port).toBe(port);
    expect(result.available).toBe(true);
  });

  it("reports EADDRINUSE when the port is already bound", async () => {
    const result = await probePortWith(8080, () => {
      const fakeServer = {
        unref: () => undefined,
        close: (cb?: () => void) => cb?.(),
        once: (event: string, listener: (value: unknown) => void) => {
          if (event === "error") {
            queueMicrotask(() =>
              listener(Object.assign(new Error("EADDRINUSE"), { code: "EADDRINUSE" })),
            );
          }
          return fakeServer;
        },
        listen: () => fakeServer,
      } as unknown as import("node:net").Server;
      return fakeServer;
    });
    expect(result.available).toBe(false);
    expect(result.message).toMatch(/already in use/);
  });
});

describe("resolveServerNodeConfigPath / resolveDefaultDataDirectory", () => {
  it("honors V3CODE_SERVER_CONFIG_PATH when set", () => {
    expect(
      resolveServerNodeConfigPath({
        env: { V3CODE_SERVER_CONFIG_PATH: "/tmp/override.toml" },
        homeDir: "/home/test",
      }),
    ).toBe("/tmp/override.toml");
  });

  it("falls back to ~/.v3-code-server/config.toml", () => {
    const result = resolveServerNodeConfigPath({
      env: {},
      homeDir: "/home/test",
    });
    // Platform-tolerant assertion: the right home + suffix segments are present.
    expect(result).toMatch(/\.v3-code-server/);
    expect(result).toMatch(/config\.toml$/);
  });

  it("resolves the default data directory to ~/.v3-code-server", () => {
    const result = resolveDefaultDataDirectory("/home/test");
    expect(result).toMatch(/\.v3-code-server$/);
  });
});

describe("probePathsWith", () => {
  it("reports config_exists=false when the file does not exist", async () => {
    const result = await probePathsWith({
      env: {},
      homeDir: "/home/test",
      fileExists: async () => false,
    });
    expect(result.configExists).toBe(false);
    expect(result.configPath).toMatch(/config\.toml$/);
  });

  it("reports config_exists=true when the file exists", async () => {
    const result = await probePathsWith({
      env: {},
      homeDir: "/home/test",
      fileExists: async () => true,
    });
    expect(result.configExists).toBe(true);
  });
});

describe("writeServerNodeConfigWith", () => {
  it("creates the directory and writes a normalized TOML blob", async () => {
    const calls: Array<{ op: string; args: unknown[] }> = [];
    const fs: WizardFileSystem = {
      mkdir: vi.fn(async (path: string, options?: { recursive?: boolean }) => {
        calls.push({ op: "mkdir", args: [path, options] });
      }),
      writeFile: vi.fn(async (path: string, content: string) => {
        calls.push({ op: "writeFile", args: [path, content] });
      }),
      stat: vi.fn(async () => ({ size: 123 })),
    };
    const result = await writeServerNodeConfigWith(
      { contentToml: "[server]\nbind_port = 8080", createDirectories: true },
      { env: {}, homeDir: "/home/test", fs },
    );
    expect(result.bytesWritten).toBe(123);
    expect(calls[0]!.op).toBe("mkdir");
    expect(calls[1]!.op).toBe("writeFile");
    // Ensure a trailing newline was appended.
    const writtenContent = calls[1]!.args[1] as string;
    expect(writtenContent.endsWith("\n")).toBe(true);
  });

  it("skips mkdir when createDirectories is false", async () => {
    const mkdir = vi.fn();
    const fs: WizardFileSystem = {
      mkdir,
      writeFile: async () => undefined,
      stat: async () => ({ size: 0 }),
    };
    await writeServerNodeConfigWith(
      { contentToml: "x = 1\n", createDirectories: false },
      { env: {}, homeDir: "/home/test", fs },
    );
    expect(mkdir).not.toHaveBeenCalled();
  });
});
