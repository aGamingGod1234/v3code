import * as Path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  getOpenChromeStatus,
  openOpenChromeExtensionSetup,
  resolveOpenChromePaths,
  type OpenChromeFileSystem,
} from "./openChromeSetup.ts";

const makeFs = (files: ReadonlyMap<string, string>): OpenChromeFileSystem => ({
  exists: async (path) => files.has(path),
  readText: async (path) => files.get(path) ?? null,
});

const makeCompleteFiles = (
  paths: ReturnType<typeof resolveOpenChromePaths>,
): ReadonlyMap<string, string> => {
  const escapedServerPath = paths.serverEntryPath.replace(/\\/g, "\\\\");
  return new Map([
    [paths.installScriptPath, "install script"],
    [paths.extensionManifestPath, "{}"],
    [paths.serverEntryPath, "server entry"],
    [paths.startupLauncherPath, "launcher"],
    [
      paths.codexConfigPath,
      [
        "[mcp_servers.openchrome]",
        'command = "node"',
        `args = ["${escapedServerPath}"]`,
        'env = { OPENCHROME_MCP_PROXY = "1" }',
      ].join("\n"),
    ],
    [paths.pairTokenPath, "343665\n"],
  ]);
};

describe("resolveOpenChromePaths", () => {
  it("honors V3CODE_OPENCHROME_HOME", () => {
    const projectDir = Path.resolve("custom-openchrome");
    const paths = resolveOpenChromePaths({
      env: { V3CODE_OPENCHROME_HOME: projectDir, APPDATA: Path.resolve("appdata") },
      homeDir: Path.resolve("home"),
    });

    expect(paths.projectDir).toBe(projectDir);
    expect(paths.serverEntryPath).toBe(Path.join(projectDir, "server", "dist", "index.js"));
    expect(paths.extensionDir).toBe(Path.join(projectDir, "extension"));
  });
});

describe("getOpenChromeStatus", () => {
  it("reports a complete installed bridge separately from bridge reachability", async () => {
    const paths = resolveOpenChromePaths({
      env: { APPDATA: Path.resolve("appdata") },
      homeDir: Path.resolve("home"),
    });
    const status = await getOpenChromeStatus({
      env: { APPDATA: Path.resolve("appdata") },
      homeDir: Path.resolve("home"),
      fs: makeFs(makeCompleteFiles(paths)),
      probeBridge: async () => false,
    });

    expect(status.installable).toBe(true);
    expect(status.installed).toBe(true);
    expect(status.bridgeReachable).toBe(false);
    expect(status.mcpConfigured).toBe(true);
    expect(status.pairToken).toBe("343665");
    expect(status.issues).toContain(
      "OpenChrome bridge is not reachable on ws://127.0.0.1:8765/ext.",
    );
  });

  it("reports actionable missing-file issues before installation", async () => {
    const status = await getOpenChromeStatus({
      env: { APPDATA: Path.resolve("appdata") },
      homeDir: Path.resolve("home"),
      fs: makeFs(new Map()),
      probeBridge: async () => false,
    });

    expect(status.installable).toBe(false);
    expect(status.installed).toBe(false);
    expect(status.issues.some((issue) => issue.includes("installer not found"))).toBe(true);
    expect(status.issues.some((issue) => issue.includes("extension manifest"))).toBe(true);
  });
});

describe("openOpenChromeExtensionSetup", () => {
  it("opens the manifest folder and browser extension setup page", async () => {
    const paths = resolveOpenChromePaths({
      env: { APPDATA: Path.resolve("appdata") },
      homeDir: Path.resolve("home"),
    });
    const shell = {
      openExternal: vi.fn(async () => undefined),
      showItemInFolder: vi.fn(),
    };

    const result = await openOpenChromeExtensionSetup(shell, {
      env: { APPDATA: Path.resolve("appdata") },
      homeDir: Path.resolve("home"),
      fs: makeFs(makeCompleteFiles(paths)),
      probeBridge: async () => true,
    });

    expect(result.openedExtensionFolder).toBe(true);
    expect(result.openedExtensionsPage).toBe(true);
    expect(shell.showItemInFolder).toHaveBeenCalledWith(paths.extensionManifestPath);
    expect(shell.openExternal).toHaveBeenCalledWith("chrome://extensions");
  });
});
