import { spawn } from "node:child_process";
import * as FS from "node:fs/promises";
import * as Net from "node:net";
import * as OS from "node:os";
import * as Path from "node:path";

import type {
  DesktopOpenChromeInstallResult,
  DesktopOpenChromeSetupOpenResult,
  DesktopOpenChromeSetupStatus,
} from "@v3tools/contracts";

const OPENCHROME_HOME_ENV_VAR = "V3CODE_OPENCHROME_HOME";
const OPENCHROME_PROJECT_DIR_NAME = "claude-in-chrome-clone";
const OPENCHROME_INSTALL_SCRIPT_NAME = "install-windows.ps1";
const OPENCHROME_SERVER_ENTRY = ["server", "dist", "index.js"] as const;
const OPENCHROME_EXTENSION_MANIFEST = ["extension", "manifest.json"] as const;
const OPENCHROME_PAIR_TOKEN = [".openchrome-mcp", "pair-token.txt"] as const;
const CODEX_CONFIG = [".codex", "config.toml"] as const;
const STARTUP_LAUNCHER = [
  "Microsoft",
  "Windows",
  "Start Menu",
  "Programs",
  "Startup",
  "openchrome-bridge.vbs",
] as const;
const OPENCHROME_BRIDGE_HOST = "127.0.0.1";
const OPENCHROME_BRIDGE_PORT = 8765;
const STATUS_PROBE_TIMEOUT_MS = 500;
const INSTALL_TIMEOUT_MS = 120_000;
const INSTALL_OUTPUT_LIMIT = 24_000;
const CHROME_EXTENSIONS_PAGE = "chrome://extensions";
const CHROME_EXTENSION_LOAD_UNPACKED_DOCS =
  "https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked";

export const V3_OPENCHROME_CHANNELS = {
  GET_STATUS: "desktop:v3-openchrome-get-status",
  INSTALL: "desktop:v3-openchrome-install",
  OPEN_EXTENSION_SETUP: "desktop:v3-openchrome-open-extension-setup",
} as const;

export interface OpenChromePaths {
  readonly projectDir: string;
  readonly extensionDir: string;
  readonly extensionManifestPath: string;
  readonly serverEntryPath: string;
  readonly installScriptPath: string;
  readonly startupLauncherPath: string;
  readonly codexConfigPath: string;
  readonly pairTokenPath: string;
}

export interface ResolveOpenChromePathsOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly homeDir?: string;
}

export interface OpenChromeFileSystem {
  readonly exists: (path: string) => Promise<boolean>;
  readonly readText: (path: string) => Promise<string | null>;
}

export interface OpenChromeStatusOptions extends ResolveOpenChromePathsOptions {
  readonly fs?: OpenChromeFileSystem;
  readonly probeBridge?: () => Promise<boolean>;
}

export interface OpenChromeIpcDeps {
  readonly ipcMain: {
    readonly handle: (
      channel: string,
      listener: (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown,
    ) => void;
    readonly removeHandler: (channel: string) => void;
  };
  readonly shell: OpenChromeShell;
}

export interface OpenChromeShell {
  readonly openExternal: (url: string) => Promise<void>;
  readonly showItemInFolder: (fullPath: string) => void;
}

const defaultFs: OpenChromeFileSystem = {
  exists: async (path) => {
    try {
      await FS.access(path);
      return true;
    } catch {
      return false;
    }
  },
  readText: async (path) => {
    try {
      return await FS.readFile(path, "utf8");
    } catch {
      return null;
    }
  },
};

const appendLimited = (existing: string, chunk: Buffer): string =>
  `${existing}${chunk.toString("utf8")}`.slice(-INSTALL_OUTPUT_LIMIT);

const normalizeConfigPath = (path: string): string =>
  path.toLocaleLowerCase().replace(/\\\\/g, "\\");

const isOpenChromeMcpConfigured = (content: string | null, serverEntryPath: string): boolean => {
  if (!content) return false;
  const lower = content.toLocaleLowerCase();
  if (!lower.includes("[mcp_servers.openchrome]")) return false;

  const expected = normalizeConfigPath(serverEntryPath);
  const expectedForwardSlashes = expected.replace(/\\/g, "/");
  const expectedEscapedBackslashes = expected.replace(/\\/g, "\\\\");
  const normalizedContent = normalizeConfigPath(lower);
  return (
    normalizedContent.includes(expected) ||
    lower.includes(expectedForwardSlashes) ||
    lower.includes(expectedEscapedBackslashes)
  );
};

const defaultProjectDir = (homeDir: string): string =>
  Path.join(homeDir, "projects", OPENCHROME_PROJECT_DIR_NAME);

const resolveAppDataDir = (env: NodeJS.ProcessEnv, homeDir: string): string =>
  env.APPDATA?.trim() || Path.join(homeDir, "AppData", "Roaming");

export const resolveOpenChromePaths = (
  options: ResolveOpenChromePathsOptions = {},
): OpenChromePaths => {
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? OS.homedir();
  const overriddenProjectDir = env[OPENCHROME_HOME_ENV_VAR]?.trim();
  const projectDir = overriddenProjectDir
    ? Path.resolve(overriddenProjectDir)
    : defaultProjectDir(homeDir);
  const appDataDir = resolveAppDataDir(env, homeDir);
  const extensionManifestPath = Path.join(projectDir, ...OPENCHROME_EXTENSION_MANIFEST);

  return {
    projectDir,
    extensionDir: Path.dirname(extensionManifestPath),
    extensionManifestPath,
    serverEntryPath: Path.join(projectDir, ...OPENCHROME_SERVER_ENTRY),
    installScriptPath: Path.join(projectDir, OPENCHROME_INSTALL_SCRIPT_NAME),
    startupLauncherPath: Path.join(appDataDir, ...STARTUP_LAUNCHER),
    codexConfigPath: Path.join(homeDir, ...CODEX_CONFIG),
    pairTokenPath: Path.join(homeDir, ...OPENCHROME_PAIR_TOKEN),
  };
};

export const probeOpenChromeBridge = (
  timeoutMs: number = STATUS_PROBE_TIMEOUT_MS,
): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    const socket = Net.createConnection({
      host: OPENCHROME_BRIDGE_HOST,
      port: OPENCHROME_BRIDGE_PORT,
    });
    let settled = false;
    const finish = (reachable: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });

export const getOpenChromeStatus = async (
  options: OpenChromeStatusOptions = {},
): Promise<DesktopOpenChromeSetupStatus> => {
  const paths = resolveOpenChromePaths(options);
  const fs = options.fs ?? defaultFs;
  const probeBridge = options.probeBridge ?? (() => probeOpenChromeBridge());

  const [
    installScriptExists,
    extensionManifestExists,
    serverEntryExists,
    startupLauncherExists,
    codexConfig,
    rawPairToken,
    bridgeReachable,
  ] = await Promise.all([
    fs.exists(paths.installScriptPath),
    fs.exists(paths.extensionManifestPath),
    fs.exists(paths.serverEntryPath),
    fs.exists(paths.startupLauncherPath),
    fs.readText(paths.codexConfigPath),
    fs.readText(paths.pairTokenPath),
    probeBridge(),
  ]);

  const mcpConfigured = isOpenChromeMcpConfigured(codexConfig, paths.serverEntryPath);
  const pairToken = rawPairToken?.trim() || null;
  const installable = installScriptExists && extensionManifestExists && serverEntryExists;
  const installed = serverEntryExists && startupLauncherExists && mcpConfigured;
  const issues: string[] = [];
  if (!installScriptExists)
    issues.push(`OpenChrome installer not found at ${paths.installScriptPath}.`);
  if (!extensionManifestExists)
    issues.push(`OpenChrome extension manifest not found in ${paths.extensionDir}.`);
  if (!serverEntryExists)
    issues.push(`OpenChrome MCP server entry not found at ${paths.serverEntryPath}.`);
  if (installable && !startupLauncherExists)
    issues.push("OpenChrome bridge is not registered for startup.");
  if (installable && !mcpConfigured) issues.push("Codex MCP config does not include openchrome.");
  if (installed && !bridgeReachable) {
    issues.push(
      `OpenChrome bridge is not reachable on ws://${OPENCHROME_BRIDGE_HOST}:${OPENCHROME_BRIDGE_PORT}/ext.`,
    );
  }
  if (installed && !pairToken) issues.push("OpenChrome pair token has not been generated yet.");

  return {
    projectDir: paths.projectDir,
    extensionDir: paths.extensionDir,
    serverEntryPath: paths.serverEntryPath,
    installScriptPath: paths.installScriptPath,
    startupLauncherPath: paths.startupLauncherPath,
    codexConfigPath: paths.codexConfigPath,
    pairTokenPath: paths.pairTokenPath,
    installScriptExists,
    extensionManifestExists,
    serverEntryExists,
    startupLauncherExists,
    mcpConfigured,
    pairToken,
    bridgeReachable,
    installable,
    installed,
    issues,
  };
};

const resolvePowerShellCommand = (): string =>
  process.platform === "win32" ? "powershell.exe" : "pwsh";

export const installOpenChrome = async (
  options: OpenChromeStatusOptions = {},
): Promise<DesktopOpenChromeInstallResult> => {
  const before = await getOpenChromeStatus(options);
  if (!before.installScriptExists) {
    throw new Error(`OpenChrome installer not found at ${before.installScriptPath}.`);
  }

  return new Promise<DesktopOpenChromeInstallResult>((resolve) => {
    const child = spawn(
      resolvePowerShellCommand(),
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", before.installScriptPath],
      {
        cwd: before.projectDir,
        shell: false,
        windowsHide: true,
      },
    );
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = async (exitCode: number | null, timedOut: boolean) => {
      if (settled) return;
      settled = true;
      const status = await getOpenChromeStatus(options);
      resolve({ exitCode, timedOut, stdout, stderr, status });
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      void finish(null, true);
    }, INSTALL_TIMEOUT_MS);
    timer.unref();

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendLimited(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendLimited(stderr, chunk);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      stderr = appendLimited(stderr, Buffer.from(error.message));
      void finish(null, false);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      void finish(code ?? 0, false);
    });
  });
};

export const openOpenChromeExtensionSetup = async (
  shell: OpenChromeShell,
  options: OpenChromeStatusOptions = {},
): Promise<DesktopOpenChromeSetupOpenResult> => {
  const status = await getOpenChromeStatus(options);
  let openedExtensionFolder = false;
  let openedExtensionsPage = false;

  if (status.extensionManifestExists) {
    const paths = resolveOpenChromePaths(options);
    shell.showItemInFolder(paths.extensionManifestPath);
    openedExtensionFolder = true;
  }

  try {
    await shell.openExternal(CHROME_EXTENSIONS_PAGE);
    openedExtensionsPage = true;
  } catch {
    try {
      await shell.openExternal(CHROME_EXTENSION_LOAD_UNPACKED_DOCS);
      openedExtensionsPage = true;
    } catch {
      openedExtensionsPage = false;
    }
  }

  return { openedExtensionFolder, openedExtensionsPage };
};

export const registerOpenChromeSetupIpc = (deps: OpenChromeIpcDeps): void => {
  const { ipcMain, shell } = deps;

  ipcMain.removeHandler(V3_OPENCHROME_CHANNELS.GET_STATUS);
  ipcMain.handle(V3_OPENCHROME_CHANNELS.GET_STATUS, async () => getOpenChromeStatus());

  ipcMain.removeHandler(V3_OPENCHROME_CHANNELS.INSTALL);
  ipcMain.handle(V3_OPENCHROME_CHANNELS.INSTALL, async () => installOpenChrome());

  ipcMain.removeHandler(V3_OPENCHROME_CHANNELS.OPEN_EXTENSION_SETUP);
  ipcMain.handle(V3_OPENCHROME_CHANNELS.OPEN_EXTENSION_SETUP, async () =>
    openOpenChromeExtensionSetup(shell),
  );
};
