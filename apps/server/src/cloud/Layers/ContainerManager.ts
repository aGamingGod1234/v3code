import { Buffer } from "node:buffer";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { AdminContainerInfo, ThreadId } from "@v3tools/contracts";
import { DateTime, Effect, Layer, Option } from "effect";

import { runProcess } from "../../processRunner.ts";
import { ServerConfig } from "../../config.ts";
import { toCloudError } from "../errors.ts";
import {
  ContainerManager,
  type CloudLaunchSpec,
  type CloudWorkspaceMetadata,
  type CloudWorkspaceResult,
  type ContainerManagerShape,
} from "../Services/ContainerManager.ts";

const CLOUD_THREADS_DIR_NAME = "cloud";
const METADATA_FILE_NAME = "metadata.json";
const REPO_DIR_NAME = "repo";
const SECRET_DIR_NAME = "secrets";
const BIN_DIR_NAME = "bin";
const TOKEN_FILE_NAME = "github-token";
const CONTAINER_NAME_PREFIX = "v3-chat-";
const PREVIEW_PORT_CANDIDATES = [3000, 4173, 5173, 8080, 8000, 4200, 5000];
const FORWARDED_PROVIDER_ENV_VARS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENROUTER_API_KEY",
  "GOOGLE_API_KEY",
  "GEMINI_API_KEY",
  "AZURE_OPENAI_API_KEY",
  "XAI_API_KEY",
] as const;

type DockerInspectResponse = {
  readonly Id?: string;
  readonly Name?: string;
  readonly State?: {
    readonly Status?: string;
    readonly Running?: boolean;
    readonly StartedAt?: string;
  };
  readonly NetworkSettings?: {
    readonly Networks?: Record<
      string,
      {
        readonly IPAddress?: string;
      }
    >;
  };
};

type ContainerStatus = "starting" | "running" | "stopping" | "dead" | "ended";

interface PersistedMetadata extends CloudWorkspaceMetadata {}

function parseRepoFullName(repoFullName: string): {
  readonly owner: string;
  readonly repo: string;
} {
  const match = /^([^/\s]+)\/([^/\s]+)$/.exec(repoFullName.trim());
  if (!match?.[1] || !match[2]) {
    throw new Error(`Invalid repo '${repoFullName}'. Expected owner/repo.`);
  }
  return { owner: match[1], repo: match[2] };
}

function toStorageOptSize(gigabytes: number): string {
  return `${Math.max(1, Math.floor(gigabytes))}G`;
}

function toContainerStatus(input: {
  readonly endedAt: string | null;
  readonly dockerStatus: string | null;
}): ContainerStatus {
  if (input.endedAt) return "ended";
  switch ((input.dockerStatus ?? "").toLowerCase()) {
    case "created":
    case "restarting":
    case "paused":
      return "starting";
    case "running":
      return "running";
    case "removing":
    case "exited":
      return "stopping";
    case "dead":
      return "dead";
    default:
      return "dead";
  }
}

function escapeShellSingleQuoted(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function escapeWindowsCmdDoubleQuoted(value: string): string {
  return value.replace(/"/g, '""');
}

function buildGitAuthEnv(accessToken: string): NodeJS.ProcessEnv {
  const basicAuth = Buffer.from(`x-access-token:${accessToken}`, "utf8").toString("base64");
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: Basic ${basicAuth}`,
  };
}

function buildForwardedEnvArgs(metadata: PersistedMetadata): ReadonlyArray<string> {
  const args = [
    "-e",
    "GIT_ASKPASS=/run/v3-secrets/git-askpass.sh",
    "-e",
    "GIT_TERMINAL_PROMPT=0",
    "-e",
    `GIT_AUTHOR_NAME=${metadata.gitUserName}`,
    "-e",
    `GIT_AUTHOR_EMAIL=${metadata.gitUserEmail}`,
    "-e",
    `GIT_COMMITTER_NAME=${metadata.gitUserName}`,
    "-e",
    `GIT_COMMITTER_EMAIL=${metadata.gitUserEmail}`,
  ];

  for (const envName of FORWARDED_PROVIDER_ENV_VARS) {
    const value = process.env[envName];
    if (!value || value.trim().length === 0) continue;
    args.push("-e", `${envName}=${value}`);
  }

  return args;
}

function buildUnixWrapperScript(input: {
  readonly containerName: string;
  readonly providerBinary: string;
  readonly tokenFile: string;
  readonly forwardedEnvArgs: ReadonlyArray<string>;
}) {
  const dockerArgs = [
    "exec",
    "-i",
    "-w",
    "/workspace",
    "-e",
    '"GITHUB_TOKEN=$V3_GITHUB_TOKEN"',
    "-e",
    '"GH_TOKEN=$V3_GITHUB_TOKEN"',
    ...input.forwardedEnvArgs.map((value) => escapeShellSingleQuoted(value)),
    escapeShellSingleQuoted(input.containerName),
    escapeShellSingleQuoted(input.providerBinary),
    '"$@"',
  ].join(" \\\n  ");

  return [
    "#!/bin/sh",
    "set -eu",
    `V3_GITHUB_TOKEN=$(cat ${escapeShellSingleQuoted(input.tokenFile)})`,
    `exec docker ${dockerArgs}`,
    "",
  ].join("\n");
}

function buildWindowsWrapperScript(input: {
  readonly containerName: string;
  readonly providerBinary: string;
  readonly tokenFile: string;
  readonly forwardedEnvArgs: ReadonlyArray<string>;
}) {
  const dockerLines = [
    "docker exec -i -w /workspace ^",
    '  -e "GITHUB_TOKEN=%V3_GITHUB_TOKEN%" ^',
    '  -e "GH_TOKEN=%V3_GITHUB_TOKEN%" ^',
    ...input.forwardedEnvArgs.map((value) => `  -e "${escapeWindowsCmdDoubleQuoted(value)}" ^`),
    `  "${escapeWindowsCmdDoubleQuoted(input.containerName)}" ^`,
    `  "${escapeWindowsCmdDoubleQuoted(input.providerBinary)}" %*`,
  ];
  return [
    "@echo off",
    "setlocal",
    `set /p V3_GITHUB_TOKEN=<"${escapeWindowsCmdDoubleQuoted(input.tokenFile)}"`,
    ...dockerLines,
    "",
  ].join("\r\n");
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function removePathIfExists(filePath: string): Promise<void> {
  try {
    await fs.rm(filePath, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup.
  }
}

async function ensureExecutable(filePath: string): Promise<void> {
  if (process.platform === "win32") return;
  await fs.chmod(filePath, 0o755);
}

async function probePreviewOrigin(origin: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_200);
  try {
    const response = await fetch(origin, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    });
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function parseListeningPorts(stdout: string): ReadonlyArray<number> {
  const ports = new Set<number>();
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const portMatch = /:(\d+)(?:\s|$)/.exec(trimmed);
    if (!portMatch?.[1]) continue;
    const port = Number.parseInt(portMatch[1], 10);
    if (Number.isFinite(port) && port > 0 && port < 65_536) {
      ports.add(port);
    }
  }
  return [...ports];
}

function orderPreviewPorts(ports: ReadonlyArray<number>): ReadonlyArray<number> {
  const seen = new Set<number>();
  const ordered: number[] = [];
  for (const preferred of PREVIEW_PORT_CANDIDATES) {
    if (ports.includes(preferred) && !seen.has(preferred)) {
      ordered.push(preferred);
      seen.add(preferred);
    }
  }
  for (const port of ports) {
    if (!seen.has(port)) {
      ordered.push(port);
      seen.add(port);
    }
  }
  return ordered;
}

async function resolveContainerListeningPorts(
  containerName: string,
): Promise<ReadonlyArray<number>> {
  const result = await runProcess(
    "docker",
    [
      "exec",
      containerName,
      "sh",
      "-lc",
      "ss -ltnH 2>/dev/null || netstat -ltn 2>/dev/null || true",
    ],
    {
      allowNonZeroExit: true,
      timeoutMs: 5_000,
      outputMode: "truncate",
      maxBufferBytes: 64 * 1024,
    },
  );
  if ((result.code ?? 1) !== 0) {
    return [];
  }
  return parseListeningPorts(result.stdout);
}

function cloudThreadRoot(config: { readonly worktreesDir: string }, threadId: ThreadId): string {
  return path.join(config.worktreesDir, CLOUD_THREADS_DIR_NAME, String(threadId));
}

function cloudMetadataPath(config: { readonly worktreesDir: string }, threadId: ThreadId): string {
  return path.join(cloudThreadRoot(config, threadId), METADATA_FILE_NAME);
}

function providerWrapperPath(
  metadata: PersistedMetadata,
  provider: "codex" | "claudeAgent",
): string {
  const extension = process.platform === "win32" ? ".cmd" : ".sh";
  const name = provider === "claudeAgent" ? "claude-wrapper" : "codex-wrapper";
  return path.join(metadata.binDir, `${name}${extension}`);
}

async function readMetadata(
  config: { readonly worktreesDir: string },
  threadId: ThreadId,
): Promise<PersistedMetadata | null> {
  return readJsonFile<PersistedMetadata>(cloudMetadataPath(config, threadId));
}

async function writeMetadata(
  config: { readonly worktreesDir: string },
  metadata: PersistedMetadata,
): Promise<void> {
  await writeJsonFile(cloudMetadataPath(config, metadata.threadId), metadata);
}

async function inspectContainer(containerName: string): Promise<DockerInspectResponse | null> {
  const result = await runProcess("docker", ["inspect", containerName], {
    allowNonZeroExit: true,
    timeoutMs: 5_000,
    outputMode: "truncate",
    maxBufferBytes: 128 * 1024,
  });
  if ((result.code ?? 1) !== 0 || result.stdout.trim().length === 0) {
    return null;
  }
  const parsed = JSON.parse(result.stdout) as ReadonlyArray<DockerInspectResponse>;
  return parsed[0] ?? null;
}

async function dockerAvailable(): Promise<boolean> {
  try {
    const result = await runProcess("docker", ["info", "--format", "{{.ServerVersion}}"], {
      allowNonZeroExit: true,
      timeoutMs: 5_000,
      outputMode: "truncate",
      maxBufferBytes: 32 * 1024,
    });
    return (result.code ?? 1) === 0 && result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

function requireCloudEnabled(config: {
  readonly mode: string;
  readonly cloudEnvEnabled: boolean;
}): void {
  if (config.mode !== "server-node" || !config.cloudEnvEnabled) {
    throw new Error("Cloud environments are not enabled on this server node.");
  }
}

async function createProviderWrappers(metadata: PersistedMetadata): Promise<void> {
  await fs.mkdir(metadata.binDir, { recursive: true });
  const forwardedEnvArgs = buildForwardedEnvArgs(metadata);

  const codexPath = providerWrapperPath(metadata, "codex");
  const claudePath = providerWrapperPath(metadata, "claudeAgent");
  const codexScript =
    process.platform === "win32"
      ? buildWindowsWrapperScript({
          containerName: metadata.containerName,
          providerBinary: "codex",
          tokenFile: metadata.tokenFile,
          forwardedEnvArgs,
        })
      : buildUnixWrapperScript({
          containerName: metadata.containerName,
          providerBinary: "codex",
          tokenFile: metadata.tokenFile,
          forwardedEnvArgs,
        });
  const claudeScript =
    process.platform === "win32"
      ? buildWindowsWrapperScript({
          containerName: metadata.containerName,
          providerBinary: "claude",
          tokenFile: metadata.tokenFile,
          forwardedEnvArgs,
        })
      : buildUnixWrapperScript({
          containerName: metadata.containerName,
          providerBinary: "claude",
          tokenFile: metadata.tokenFile,
          forwardedEnvArgs,
        });

  await Promise.all([
    fs.writeFile(codexPath, codexScript, "utf8"),
    fs.writeFile(claudePath, claudeScript, "utf8"),
  ]);
  await Promise.all([ensureExecutable(codexPath), ensureExecutable(claudePath)]);
}

async function createSecretFiles(metadata: PersistedMetadata, accessToken: string): Promise<void> {
  await fs.mkdir(metadata.secretDir, { recursive: true });
  await fs.writeFile(metadata.tokenFile, accessToken, "utf8");
  const askPassPath = path.join(metadata.secretDir, "git-askpass.sh");
  const askPassScript = [
    "#!/bin/sh",
    'case "$1" in',
    '  *Username*) printf "%s\\n" "x-access-token" ;;',
    "  *Password*) cat /run/v3-secrets/github-token ;;",
    "  *) cat /run/v3-secrets/github-token ;;",
    "esac",
    "",
  ].join("\n");
  await fs.writeFile(askPassPath, askPassScript, "utf8");
  await ensureExecutable(askPassPath);
}

async function startContainer(input: {
  readonly metadata: PersistedMetadata;
  readonly image: string;
  readonly cpuLimit: number;
  readonly memoryMb: number;
  readonly diskGb: number;
}): Promise<string> {
  const args = [
    "run",
    "-d",
    "--init",
    "--name",
    input.metadata.containerName,
    "--label",
    "v3.cloud=1",
    "--label",
    `v3.thread_id=${input.metadata.threadId}`,
    "--label",
    `v3.user_id=${input.metadata.userId}`,
    "--cpus",
    String(Math.max(1, input.cpuLimit)),
    "--memory",
    `${Math.max(256, input.memoryMb)}m`,
    "--mount",
    `type=bind,src=${input.metadata.repoDir},dst=/workspace`,
    "--mount",
    `type=bind,src=${input.metadata.secretDir},dst=/run/v3-secrets,readonly`,
    "-e",
    "HOST=0.0.0.0",
    "-e",
    "BIND_HOST=0.0.0.0",
  ];
  if (process.platform !== "win32") {
    args.push("--storage-opt", `size=${toStorageOptSize(input.diskGb)}`);
  }
  args.push(input.image, "sh", "-lc", "trap 'exit 0' TERM INT; while :; do sleep 3600; done");
  const result = await runProcess("docker", args, {
    timeoutMs: 20_000,
    outputMode: "truncate",
    maxBufferBytes: 64 * 1024,
  });
  const containerId = result.stdout.trim();
  if (containerId.length === 0) {
    throw new Error("Docker did not return a container id.");
  }
  return containerId;
}

async function cloneRepo(input: {
  readonly repoFullName: string;
  readonly branch: string;
  readonly repoDir: string;
  readonly accessToken: string;
}): Promise<void> {
  await removePathIfExists(input.repoDir);
  await fs.mkdir(path.dirname(input.repoDir), { recursive: true });
  await runProcess(
    "git",
    [
      "clone",
      "--branch",
      input.branch,
      "--single-branch",
      `https://github.com/${input.repoFullName}.git`,
      input.repoDir,
    ],
    {
      timeoutMs: 180_000,
      env: buildGitAuthEnv(input.accessToken),
      outputMode: "truncate",
      maxBufferBytes: 512 * 1024,
    },
  );
}

async function cleanupWorkspaceArtifacts(metadata: PersistedMetadata): Promise<void> {
  await Promise.all([
    removePathIfExists(metadata.repoDir),
    removePathIfExists(metadata.secretDir),
    removePathIfExists(metadata.binDir),
  ]);
}

export const makeContainerManager = Effect.gen(function* () {
  const config = yield* ServerConfig;

  const getWorkspaceMetadata: ContainerManagerShape["getWorkspaceMetadata"] = (threadId) =>
    Effect.tryPromise({
      try: async () => {
        const metadata = await readMetadata(config, threadId);
        return metadata ? Option.some(metadata) : Option.none();
      },
      catch: toCloudError("Failed to read cloud workspace metadata."),
    });

  const dockerAvailableEffect: ContainerManagerShape["dockerAvailable"] = () =>
    Effect.promise(() => dockerAvailable());

  const isAvailable: ContainerManagerShape["isAvailable"] = () =>
    Effect.promise(async () => {
      if (config.mode !== "server-node" || !config.cloudEnvEnabled) {
        return false;
      }
      return dockerAvailable();
    });

  const createWorkspace: ContainerManagerShape["createWorkspace"] = (input) =>
    Effect.tryPromise({
      try: async () => {
        requireCloudEnabled(config);
        if (!(await dockerAvailable())) {
          throw new Error("Docker is unavailable on this server node.");
        }
        const activeContainers = await (async () => {
          const metadataRoot = path.join(config.worktreesDir, CLOUD_THREADS_DIR_NAME);
          if (!(await pathExists(metadataRoot))) return 0;
          const threadIds = await fs.readdir(metadataRoot);
          let count = 0;
          for (const threadEntry of threadIds) {
            const metadata = await readJsonFile<PersistedMetadata>(
              path.join(metadataRoot, threadEntry, METADATA_FILE_NAME),
            );
            if (metadata && metadata.endedAt === null) {
              count += 1;
            }
          }
          return count;
        })();
        if (activeContainers >= config.cloudEnvMaxContainers) {
          throw new Error(
            `Cloud environment limit reached (${config.cloudEnvMaxContainers} active containers).`,
          );
        }

        const parsedRepo = parseRepoFullName(input.repoFullName);
        const threadRoot = cloudThreadRoot(config, input.threadId);
        await removePathIfExists(threadRoot);
        const metadata: PersistedMetadata = {
          threadId: input.threadId,
          userId: input.userId,
          repoFullName: input.repoFullName,
          owner: parsedRepo.owner,
          repo: parsedRepo.repo,
          branch: input.branch,
          repoDir: path.join(threadRoot, REPO_DIR_NAME),
          threadRoot,
          tokenFile: path.join(threadRoot, SECRET_DIR_NAME, TOKEN_FILE_NAME),
          secretDir: path.join(threadRoot, SECRET_DIR_NAME),
          binDir: path.join(threadRoot, BIN_DIR_NAME),
          gitUserName: input.gitUserName,
          gitUserEmail: input.gitUserEmail,
          containerName: `${CONTAINER_NAME_PREFIX}${input.threadId}`,
          containerId: null,
          createdAt: input.createdAt,
          startedAt: input.createdAt,
          endedAt: null,
          previewPort: null,
        };

        await fs.mkdir(threadRoot, { recursive: true });
        await createSecretFiles(metadata, input.accessToken);
        await cloneRepo({
          repoFullName: input.repoFullName,
          branch: input.branch,
          repoDir: metadata.repoDir,
          accessToken: input.accessToken,
        });
        const containerId = await startContainer({
          metadata,
          image: config.cloudEnvBaseImage,
          cpuLimit: config.cloudEnvContainerCpuLimit,
          memoryMb: config.cloudEnvContainerMemoryMb,
          diskGb: config.cloudEnvContainerDiskGb,
        });
        const persisted: PersistedMetadata = {
          ...metadata,
          containerId,
          startedAt: new Date().toISOString(),
        };
        await createProviderWrappers(persisted);
        await writeMetadata(config, persisted);
        return {
          repoDir: persisted.repoDir,
          metadata: persisted,
        } satisfies CloudWorkspaceResult;
      },
      catch: toCloudError("Failed to create cloud workspace."),
    });

  const prepareProviderLaunch: ContainerManagerShape["prepareProviderLaunch"] = (input) =>
    Effect.tryPromise({
      try: async () => {
        const metadata = await readMetadata(config, input.threadId);
        if (!metadata) {
          return {
            binaryPath: input.binaryPath,
            ...(input.cwd ? { cwd: input.cwd } : {}),
          } satisfies CloudLaunchSpec;
        }
        if (metadata.endedAt) {
          throw new Error("This cloud environment has already been ended.");
        }
        const inspection = await inspectContainer(metadata.containerName);
        if (!inspection?.State?.Running) {
          throw new Error("The cloud environment container is not running.");
        }
        const wrapperPath = providerWrapperPath(metadata, input.provider);
        if (!(await pathExists(wrapperPath))) {
          await createProviderWrappers(metadata);
        }
        return {
          binaryPath: wrapperPath,
          cwd: metadata.repoDir,
        } satisfies CloudLaunchSpec;
      },
      catch: toCloudError("Failed to prepare provider launch."),
    });

  const resolvePreviewTarget: ContainerManagerShape["resolvePreviewTarget"] = (threadId) =>
    Effect.tryPromise({
      try: async () => {
        const metadata = await readMetadata(config, threadId);
        if (!metadata || metadata.endedAt) {
          return Option.none();
        }
        const inspection = await inspectContainer(metadata.containerName);
        const containerIp =
          inspection?.NetworkSettings?.Networks &&
          Object.values(inspection.NetworkSettings.Networks).find(
            (network) => typeof network?.IPAddress === "string" && network.IPAddress.length > 0,
          )?.IPAddress;
        if (!inspection?.State?.Running || !containerIp) {
          return Option.none();
        }

        const candidatePorts = orderPreviewPorts([
          ...(metadata.previewPort !== null ? [metadata.previewPort] : []),
          ...(await resolveContainerListeningPorts(metadata.containerName)),
        ]);

        for (const port of candidatePorts) {
          const origin = `http://${containerIp}:${port}`;
          if (await probePreviewOrigin(origin)) {
            if (metadata.previewPort !== port) {
              await writeMetadata(config, {
                ...metadata,
                previewPort: port,
              });
            }
            return Option.some({ origin });
          }
        }

        return Option.none();
      },
      catch: toCloudError("Failed to resolve cloud preview target."),
    });

  const stopThreadEnvironment: ContainerManagerShape["stopThreadEnvironment"] = (threadId) =>
    Effect.tryPromise({
      try: async () => {
        const metadata = await readMetadata(config, threadId);
        if (!metadata) {
          return;
        }
        await runProcess("docker", ["rm", "-f", metadata.containerName], {
          allowNonZeroExit: true,
          timeoutMs: 20_000,
          outputMode: "truncate",
          maxBufferBytes: 64 * 1024,
        }).catch(() => undefined);
        await cleanupWorkspaceArtifacts(metadata);
        await writeMetadata(config, {
          ...metadata,
          containerId: null,
          endedAt: metadata.endedAt ?? new Date().toISOString(),
          previewPort: null,
        });
      },
      catch: toCloudError("Failed to stop cloud environment."),
    });

  const listContainers: ContainerManagerShape["listContainers"] = () =>
    Effect.tryPromise({
      try: async () => {
        const metadataRoot = path.join(config.worktreesDir, CLOUD_THREADS_DIR_NAME);
        if (!(await pathExists(metadataRoot))) {
          return [];
        }
        const threadEntries = await fs.readdir(metadataRoot);
        const containers: AdminContainerInfo[] = [];
        for (const threadEntry of threadEntries) {
          const metadata = await readJsonFile<PersistedMetadata>(
            path.join(metadataRoot, threadEntry, METADATA_FILE_NAME),
          );
          if (!metadata || metadata.endedAt) continue;
          const inspection = await inspectContainer(metadata.containerName);
          const startedAt = inspection?.State?.StartedAt || metadata.startedAt;
          const status = toContainerStatus({
            endedAt: metadata.endedAt,
            dockerStatus: inspection?.State?.Status ?? null,
          });
          const startedAtMs = new Date(startedAt).getTime();
          const safeStartedAtIso = Number.isFinite(startedAtMs)
            ? new Date(startedAtMs).toISOString()
            : new Date().toISOString();
          containers.push({
            chatId: metadata.threadId as AdminContainerInfo["chatId"],
            containerId: (inspection?.Id ??
              metadata.containerId ??
              metadata.containerName) as AdminContainerInfo["containerId"],
            status: status === "ended" ? "dead" : status,
            cpuCount: Math.max(1, Math.floor(config.cloudEnvContainerCpuLimit)),
            memoryMb: Math.max(256, config.cloudEnvContainerMemoryMb),
            startedAt: DateTime.toUtc(DateTime.makeUnsafe(safeStartedAtIso)),
            uptimeSeconds: Math.max(0, Math.floor((Date.now() - startedAtMs) / 1_000)),
          });
        }
        return containers;
      },
      catch: toCloudError("Failed to list cloud containers."),
    });

  const pruneExpired: ContainerManagerShape["pruneExpired"] = () =>
    Effect.tryPromise({
      try: async () => {
        const metadataRoot = path.join(config.worktreesDir, CLOUD_THREADS_DIR_NAME);
        if (!(await pathExists(metadataRoot))) {
          return;
        }
        const maxAgeMs = Math.max(1, config.cloudEnvContainerMaxRuntimeHours) * 60 * 60 * 1_000;
        const threadEntries = await fs.readdir(metadataRoot);
        for (const threadEntry of threadEntries) {
          const metadata = await readJsonFile<PersistedMetadata>(
            path.join(metadataRoot, threadEntry, METADATA_FILE_NAME),
          );
          if (!metadata || metadata.endedAt) continue;
          const startedAtMs = new Date(metadata.startedAt).getTime();
          if (!Number.isFinite(startedAtMs)) continue;
          if (Date.now() - startedAtMs < maxAgeMs) continue;
          await runProcess("docker", ["rm", "-f", metadata.containerName], {
            allowNonZeroExit: true,
            timeoutMs: 20_000,
            outputMode: "truncate",
            maxBufferBytes: 64 * 1024,
          }).catch(() => undefined);
          await cleanupWorkspaceArtifacts(metadata);
          await writeMetadata(config, {
            ...metadata,
            containerId: null,
            endedAt: new Date().toISOString(),
            previewPort: null,
          });
        }
      },
      catch: toCloudError("Failed to prune expired cloud environments."),
    });

  return {
    dockerAvailable: dockerAvailableEffect,
    isAvailable,
    getWorkspaceMetadata,
    createWorkspace,
    prepareProviderLaunch,
    resolvePreviewTarget,
    stopThreadEnvironment,
    listContainers,
    pruneExpired,
  } satisfies ContainerManagerShape;
});

export const ContainerManagerLive = Layer.effect(ContainerManager, makeContainerManager);
