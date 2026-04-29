// Runtime discovery for spawn-related options. Probed at app start and on
// demand so the Configuration settings panel only lists environments and
// shells the runner can actually spawn.

import { spawn } from "node:child_process";
import * as FS from "node:fs/promises";
import * as Path from "node:path";

import { ipcMain } from "electron";

export const V3_SPAWN_DISCOVERY_CHANNELS = {
  GET_OPTIONS: "desktop:v3-spawn-discovery-get-options",
} as const;

export interface SpawnAgentEnvironment {
  readonly id: "windows-native" | "wsl" | "mac" | "linux";
  readonly label: string;
}

export interface SpawnTerminalShell {
  readonly id: string;
  readonly label: string;
  readonly path: string;
}

export interface SpawnDiscoveryOptions {
  readonly agentEnvironments: ReadonlyArray<SpawnAgentEnvironment>;
  readonly terminalShells: ReadonlyArray<SpawnTerminalShell>;
}

const probeWslAvailable = async (): Promise<boolean> => {
  if (process.platform !== "win32") return false;
  return new Promise<boolean>((resolve) => {
    try {
      const proc = spawn("wsl.exe", ["--status"], { windowsHide: true });
      let exited = false;
      const finish = (ok: boolean) => {
        if (exited) return;
        exited = true;
        resolve(ok);
      };
      proc.on("error", () => finish(false));
      proc.on("close", (code) => finish(code === 0));
      setTimeout(() => {
        if (!exited) {
          proc.kill();
          finish(false);
        }
      }, 2000);
    } catch {
      resolve(false);
    }
  });
};

const findOnPath = async (binaryName: string): Promise<string | null> => {
  const exts =
    process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  const dirs = (process.env.PATH ?? "").split(Path.delimiter).filter((dir) => dir.length > 0);
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = Path.join(dir, binaryName + ext);
      try {
        const stat = await FS.stat(candidate);
        if (stat.isFile()) return candidate;
      } catch {
        // continue
      }
    }
  }
  return null;
};

const SHELL_CANDIDATES_WIN: ReadonlyArray<{ id: string; label: string; binary: string }> = [
  { id: "pwsh", label: "PowerShell 7+", binary: "pwsh" },
  { id: "powershell", label: "Windows PowerShell", binary: "powershell" },
  { id: "cmd", label: "Command Prompt", binary: "cmd" },
  { id: "bash", label: "Git Bash", binary: "bash" },
];

const SHELL_CANDIDATES_NIX: ReadonlyArray<{ id: string; label: string; binary: string }> = [
  { id: "bash", label: "Bash", binary: "bash" },
  { id: "zsh", label: "Zsh", binary: "zsh" },
  { id: "fish", label: "Fish", binary: "fish" },
  { id: "sh", label: "POSIX sh", binary: "sh" },
];

let cached: SpawnDiscoveryOptions | null = null;

export const getSpawnDiscoveryOptions = async (
  options: { readonly forceRefresh?: boolean } = {},
): Promise<SpawnDiscoveryOptions> => {
  if (cached && !options.forceRefresh) return cached;
  const agentEnvironments: SpawnAgentEnvironment[] = [];
  if (process.platform === "win32") {
    agentEnvironments.push({ id: "windows-native", label: "Windows native" });
    if (await probeWslAvailable()) {
      agentEnvironments.push({ id: "wsl", label: "WSL" });
    }
  } else if (process.platform === "darwin") {
    agentEnvironments.push({ id: "mac", label: "macOS" });
  } else {
    agentEnvironments.push({ id: "linux", label: "Linux" });
  }

  const candidates = process.platform === "win32" ? SHELL_CANDIDATES_WIN : SHELL_CANDIDATES_NIX;
  const terminalShells: SpawnTerminalShell[] = [];
  for (const candidate of candidates) {
    const found = await findOnPath(candidate.binary);
    if (found) {
      terminalShells.push({ id: candidate.id, label: candidate.label, path: found });
    }
  }

  cached = { agentEnvironments, terminalShells };
  return cached;
};

export const registerV3SpawnDiscoveryIpc = (): void => {
  ipcMain.removeHandler(V3_SPAWN_DISCOVERY_CHANNELS.GET_OPTIONS);
  ipcMain.handle(V3_SPAWN_DISCOVERY_CHANNELS.GET_OPTIONS, async (_event, raw: unknown) => {
    const forceRefresh = Boolean(
      typeof raw === "object" && raw !== null
        ? (raw as { forceRefresh?: unknown }).forceRefresh
        : false,
    );
    return getSpawnDiscoveryOptions({ forceRefresh });
  });
};
