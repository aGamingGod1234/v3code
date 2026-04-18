// V3 server-node setup wizard — Electron main-process IPC surface.
//
// The wizard itself renders as React routes inside `apps/web/src/routes/
// setup/*`, but every privileged operation (Docker probe, port probe,
// cloudflared detect, filesystem I/O) has to run here, in the main
// process, because the renderer is sandboxed. This module keeps that
// surface isolated — the factory takes its Electron dependencies as
// parameters so the pure logic is unit-testable without pulling in
// `electron` or touching real filesystems.
//
// All methods resolve to discriminated result shapes (per
// `V3Wizard*Result` in `packages/contracts/src/ipc.ts`). The renderer
// renders each probe as a pass/fail row; a failed probe never throws
// across IPC. Genuine unexpected errors (e.g. the child-process binary
// blew up) still map to `status: "error"` with a readable `message`.

import { spawn } from "node:child_process";
import * as Crypto from "node:crypto";
import * as FS from "node:fs/promises";
import * as Net from "node:net";
import * as OS from "node:os";
import * as Path from "node:path";

import type {
  V3WizardCloudflaredProbeResult,
  V3WizardDockerProbeResult,
  V3WizardPathsProbeResult,
  V3WizardPortProbeResult,
  V3WizardWriteConfigInput,
  V3WizardWriteConfigResult,
} from "@v3tools/contracts";

const CLOUDFLARED_DOCS_URL =
  "https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/";

// Default path mirrors `apps/server/src/serverMode.ts`
// (`~/.v3-code-server/config.toml`). The env-var override is resolved
// here too so wizard writes and the server's startup read agree on the
// target regardless of how the operator invokes the server.
const SERVER_NODE_CONFIG_ENV_VAR = "V3CODE_SERVER_CONFIG_PATH";
const SERVER_NODE_CONFIG_DIR_NAME = ".v3-code-server";
const SERVER_NODE_CONFIG_FILE_NAME = "config.toml";

export interface ResolveConfigPathOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly homeDir?: string;
}

export const resolveServerNodeConfigPath = (options: ResolveConfigPathOptions = {}): string => {
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? OS.homedir();
  const overridden = env[SERVER_NODE_CONFIG_ENV_VAR]?.trim();
  if (overridden && overridden.length > 0) return overridden;
  return Path.join(homeDir, SERVER_NODE_CONFIG_DIR_NAME, SERVER_NODE_CONFIG_FILE_NAME);
};

export const resolveDefaultDataDirectory = (homeDir: string = OS.homedir()): string =>
  Path.join(homeDir, SERVER_NODE_CONFIG_DIR_NAME);

// ---------------------------------------------------------------------------
// Safe subprocess runner: spawn-based, no shell, fixed arg vector.
// Injection is impossible because `args` is a string array passed straight
// to the OS `execve` family; no interpreter between us and the binary.
// ---------------------------------------------------------------------------

export interface CommandRunner {
  readonly run: (
    command: string,
    args: ReadonlyArray<string>,
    options?: { readonly timeoutMs?: number },
  ) => Promise<{ readonly stdout: string; readonly stderr: string; readonly exitCode: number }>;
}

class CommandMissingError extends Error {
  readonly missing = true;
  constructor(command: string) {
    super(`Command not found: ${command}`);
    this.name = "CommandMissingError";
  }
}

export const defaultCommandRunner: CommandRunner = {
  run: async (command, args, options) => {
    const timeoutMs = options?.timeoutMs ?? 3_000;
    return new Promise((resolve, reject) => {
      // `shell: false` is the default for `spawn`, but we set it
      // explicitly so a future reader is certain no shell expansion
      // happens to `command`/`args`.
      const child = spawn(command, [...args], { shell: false });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`Command "${command}" timed out after ${timeoutMs}ms.`));
      }, timeoutMs);
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (error: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        if (error.code === "ENOENT") {
          reject(new CommandMissingError(command));
          return;
        }
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        const exitCode = code ?? 0;
        if (exitCode !== 0) {
          reject(
            Object.assign(new Error(`Command "${command}" exited ${exitCode}: ${stderr.trim()}`), {
              stdout,
              stderr,
              exitCode,
            }),
          );
          return;
        }
        resolve({ stdout, stderr, exitCode });
      });
    });
  },
};

// ---------------------------------------------------------------------------
// Pure helpers — no Electron, no filesystem except via explicit fs injection.
// These are what the unit tests exercise directly.
// ---------------------------------------------------------------------------

// Parse "Docker version 27.2.0, build ..." / "cloudflared version
// 2024.3.0 (built 2024-03-12)" → "27.2.0" / "2024.3.0".
export const extractVersion = (output: string): string | null => {
  const match = /version\s+([0-9]+\.[0-9]+(?:\.[0-9]+)?(?:[-.][A-Za-z0-9]+)?)/i.exec(output);
  return match?.[1] ?? null;
};

const isMissingCommandError = (cause: unknown): boolean => {
  if (cause instanceof CommandMissingError) return true;
  const message = cause instanceof Error ? cause.message : String(cause);
  return /ENOENT|command not found|not recognized/i.test(message);
};

export const probeDockerWith = async (
  runner: CommandRunner = defaultCommandRunner,
): Promise<V3WizardDockerProbeResult> => {
  try {
    const { stdout } = await runner.run("docker", ["--version"], { timeoutMs: 3_000 });
    const version = extractVersion(stdout);
    return { status: "ok", version, message: null };
  } catch (cause) {
    if (isMissingCommandError(cause)) {
      return { status: "missing", version: null, message: null };
    }
    const message = cause instanceof Error ? cause.message : String(cause);
    return { status: "error", version: null, message };
  }
};

export const probePortWith = async (
  port: number,
  listenerFactory: () => Net.Server = () => Net.createServer(),
): Promise<V3WizardPortProbeResult> =>
  new Promise<V3WizardPortProbeResult>((resolve) => {
    const server = listenerFactory();
    server.unref();
    server.once("error", (error: NodeJS.ErrnoException) => {
      const message =
        error.code === "EADDRINUSE"
          ? `Port ${port} is already in use.`
          : `Port probe failed: ${error.message}`;
      try {
        server.close();
      } catch {
        // already closed
      }
      resolve({ port, available: false, message });
    });
    server.once("listening", () => {
      server.close(() => {
        resolve({ port, available: true, message: null });
      });
    });
    try {
      server.listen(port, "127.0.0.1");
    } catch (cause) {
      resolve({
        port,
        available: false,
        message: cause instanceof Error ? cause.message : String(cause),
      });
    }
  });

export const probeCloudflaredWith = async (
  runner: CommandRunner = defaultCommandRunner,
): Promise<V3WizardCloudflaredProbeResult> => {
  try {
    const { stdout } = await runner.run("cloudflared", ["--version"], { timeoutMs: 3_000 });
    const version = extractVersion(stdout);
    return { status: "ok", version, installDocsUrl: CLOUDFLARED_DOCS_URL };
  } catch (cause) {
    if (isMissingCommandError(cause)) {
      return { status: "missing", version: null, installDocsUrl: CLOUDFLARED_DOCS_URL };
    }
    return { status: "error", version: null, installDocsUrl: CLOUDFLARED_DOCS_URL };
  }
};

export interface ProbePathsOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly homeDir?: string;
  readonly fileExists?: (path: string) => Promise<boolean>;
}

const defaultFileExists = async (path: string): Promise<boolean> => {
  try {
    await FS.access(path);
    return true;
  } catch {
    return false;
  }
};

export const probePathsWith = async (
  options: ProbePathsOptions = {},
): Promise<V3WizardPathsProbeResult> => {
  const configPath = resolveServerNodeConfigPath({
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
  });
  const defaultDataDirectory = resolveDefaultDataDirectory(options.homeDir);
  const exists = await (options.fileExists ?? defaultFileExists)(configPath);
  return {
    configPath,
    configExists: exists,
    defaultDataDirectory,
  };
};

// Crypto helper: 32 random bytes, hex-encoded (64 chars). Matches the
// width expected by AES-256-GCM in `apps/server/src/identity/
// tokenEncryption.ts` when the key is unhex'd at load time.
export const generateEncryptionKey = (): string => Crypto.randomBytes(32).toString("hex");

// Filesystem adapter for the write step. Extracted so tests can assert
// the right bytes are written without touching real disk.
export interface WizardFileSystem {
  readonly mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  readonly writeFile: (path: string, content: string) => Promise<void>;
  readonly stat: (path: string) => Promise<{ size: number }>;
}

const defaultFileSystem: WizardFileSystem = {
  mkdir: async (path, options) => {
    await FS.mkdir(path, { recursive: options?.recursive ?? false });
  },
  writeFile: async (path, content) => {
    await FS.writeFile(path, content, { encoding: "utf8", mode: 0o600 });
  },
  stat: async (path) => {
    const st = await FS.stat(path);
    return { size: st.size };
  },
};

export const writeServerNodeConfigWith = async (
  input: V3WizardWriteConfigInput,
  options: {
    readonly env?: NodeJS.ProcessEnv;
    readonly homeDir?: string;
    readonly fs?: WizardFileSystem;
  } = {},
): Promise<V3WizardWriteConfigResult> => {
  const configPath = resolveServerNodeConfigPath({
    ...(options.env !== undefined ? { env: options.env } : {}),
    ...(options.homeDir !== undefined ? { homeDir: options.homeDir } : {}),
  });
  const fs = options.fs ?? defaultFileSystem;
  const normalizedToml = input.contentToml.endsWith("\n")
    ? input.contentToml
    : `${input.contentToml}\n`;
  if (input.createDirectories) {
    await fs.mkdir(Path.dirname(configPath), { recursive: true });
  }
  await fs.writeFile(configPath, normalizedToml);
  const stats = await fs.stat(configPath);
  return { path: configPath, bytesWritten: stats.size };
};

// ---------------------------------------------------------------------------
// IPC registration (main.ts calls this once on window creation).
// ---------------------------------------------------------------------------

export const V3_WIZARD_CHANNELS = {
  PROBE_DOCKER: "desktop:v3-wizard-probe-docker",
  PROBE_PORT: "desktop:v3-wizard-probe-port",
  PROBE_CLOUDFLARED: "desktop:v3-wizard-probe-cloudflared",
  PROBE_PATHS: "desktop:v3-wizard-probe-paths",
  PICK_DATA_DIRECTORY: "desktop:v3-wizard-pick-data-directory",
  WRITE_CONFIG: "desktop:v3-wizard-write-config",
  GENERATE_KEY: "desktop:v3-wizard-generate-key",
} as const;

export interface V3SetupWizardIpcDeps {
  readonly ipcMain: {
    readonly handle: (
      channel: string,
      listener: (event: unknown, ...args: unknown[]) => Promise<unknown> | unknown,
    ) => void;
    readonly removeHandler: (channel: string) => void;
  };
  readonly pickDataDirectory: (options: {
    readonly initialPath?: string | null;
  }) => Promise<string | null>;
}

export const registerV3SetupWizardIpc = (deps: V3SetupWizardIpcDeps): void => {
  const { ipcMain, pickDataDirectory } = deps;

  ipcMain.removeHandler(V3_WIZARD_CHANNELS.PROBE_DOCKER);
  ipcMain.handle(V3_WIZARD_CHANNELS.PROBE_DOCKER, async () => probeDockerWith());

  ipcMain.removeHandler(V3_WIZARD_CHANNELS.PROBE_PORT);
  ipcMain.handle(V3_WIZARD_CHANNELS.PROBE_PORT, async (_event, rawPort: unknown) => {
    const port = typeof rawPort === "number" ? Math.trunc(rawPort) : NaN;
    if (!Number.isFinite(port) || port <= 0 || port > 65_535) {
      return {
        port: Number.isFinite(port) ? port : 0,
        available: false,
        message: "Invalid port number.",
      } satisfies V3WizardPortProbeResult;
    }
    return probePortWith(port);
  });

  ipcMain.removeHandler(V3_WIZARD_CHANNELS.PROBE_CLOUDFLARED);
  ipcMain.handle(V3_WIZARD_CHANNELS.PROBE_CLOUDFLARED, async () => probeCloudflaredWith());

  ipcMain.removeHandler(V3_WIZARD_CHANNELS.PROBE_PATHS);
  ipcMain.handle(V3_WIZARD_CHANNELS.PROBE_PATHS, async () => probePathsWith());

  ipcMain.removeHandler(V3_WIZARD_CHANNELS.PICK_DATA_DIRECTORY);
  ipcMain.handle(V3_WIZARD_CHANNELS.PICK_DATA_DIRECTORY, async (_event, rawOptions: unknown) => {
    const maybeInitial =
      typeof rawOptions === "object" && rawOptions !== null
        ? (rawOptions as { initialPath?: unknown }).initialPath
        : undefined;
    const initialPath = typeof maybeInitial === "string" ? maybeInitial : null;
    return pickDataDirectory({ initialPath });
  });

  ipcMain.removeHandler(V3_WIZARD_CHANNELS.WRITE_CONFIG);
  ipcMain.handle(V3_WIZARD_CHANNELS.WRITE_CONFIG, async (_event, rawInput: unknown) => {
    if (
      typeof rawInput !== "object" ||
      rawInput === null ||
      typeof (rawInput as { contentToml?: unknown }).contentToml !== "string"
    ) {
      throw new Error("Invalid V3 wizard write-config input.");
    }
    const { contentToml, createDirectories } = rawInput as {
      contentToml: string;
      createDirectories?: unknown;
    };
    return writeServerNodeConfigWith({
      contentToml,
      createDirectories: createDirectories === true,
    });
  });

  ipcMain.removeHandler(V3_WIZARD_CHANNELS.GENERATE_KEY);
  ipcMain.handle(V3_WIZARD_CHANNELS.GENERATE_KEY, async () => generateEncryptionKey());
};
