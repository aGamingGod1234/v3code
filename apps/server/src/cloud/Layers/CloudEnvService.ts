import { DateTime, Effect, Layer, Option, pipe } from "effect";

import {
  CLOUD_DEVICE_NAME,
  type CloudContainerInfo,
  type CloudContainerStatus,
  type CloudEndChatResult,
  type CloudGitHubBranchSummary,
  type CloudGitHubRepoSummary,
  type CloudProvisionResult,
  type DeviceCapability,
  type IsoDateTime,
  TrimmedNonEmptyString,
  type UserId,
  makeCloudDeviceId,
} from "@v3tools/contracts";
import type { DispatchableClientOrchestrationCommand } from "@v3tools/contracts";

import {
  ServerSecretStore,
  type ServerSecretStoreShape,
} from "../../auth/Services/ServerSecretStore.ts";
import { ServerConfig } from "../../config.ts";
import { decrypt as decryptToken } from "../../identity/tokenEncryption.ts";
import {
  DeviceRepository,
  type DeviceRepositoryShape,
} from "../../identity/Services/DeviceRepository.ts";
import {
  UserRepository,
  type UserRepositoryShape,
} from "../../identity/Services/UserRepository.ts";
import { OrchestrationEngineService } from "../../orchestration/Services/OrchestrationEngine.ts";
import { CloudEnvError } from "../Errors.ts";
import { buildDefaultLabels } from "./DockerCloudRuntime.ts";
import {
  DockerCloudRuntime,
  DOCKER_CONTAINER_NAME_PREFIX,
} from "../Services/DockerCloudRuntime.ts";
import {
  CloudContainerRepository,
  type CloudContainerRecord,
} from "../Services/CloudContainerRepository.ts";
import {
  CloudEnvService,
  type CloudEnvServiceShape,
  type CloudPublicConfigView,
} from "../Services/CloudEnvService.ts";

const GITHUB_TOKEN_ENCRYPTION_KEY_NAME = "v3-token-enc-key";
const GITHUB_TOKEN_ENCRYPTION_KEY_BYTES = 32;

// Build a `git clone` argv with the user's GitHub token injected via
// `x-access-token`. The token only exists inside the argv for the
// lifetime of the exec call — we never persist it to disk from here.
const buildCloneArgs = (
  token: string,
  repoFullName: string,
  branch: string,
): ReadonlyArray<string> => [
  "git",
  "clone",
  "--depth",
  "1",
  "--branch",
  branch,
  `https://x-access-token:${token}@github.com/${repoFullName}.git`,
  "/workspace/repo",
];

// Cloud-env device capabilities. `execute`, `claude_code`, and
// `codex` mirror what a workstation exposes; the cloud_env image
// ships both CLIs. `terminal` flows from the container having an
// interactive shell in it.
const CLOUD_DEVICE_CAPABILITIES: ReadonlyArray<DeviceCapability> = [
  "execute",
  "claude_code",
  "codex",
  "terminal",
];

const toContainerInfo = (record: CloudContainerRecord): CloudContainerInfo => ({
  chatId: record.chatId,
  containerId: record.containerId,
  image: record.image,
  status: record.status,
  statusMessage: record.statusMessage,
  githubRepo: record.githubRepo,
  githubBranch: record.githubBranch,
  cpuLimit: record.cpuLimit,
  memoryMb: record.memoryMb,
  diskGb: record.diskGb,
  startedAt: DateTime.formatIso(record.startedAt) as IsoDateTime,
  readyAt: record.readyAt ? (DateTime.formatIso(record.readyAt) as IsoDateTime) : null,
  endedAt: record.endedAt ? (DateTime.formatIso(record.endedAt) as IsoDateTime) : null,
});

// Map a docker container state string into our narrow status enum.
// Called by `syncWithDocker` on reconcile; never from the create path
// because we already know the status there.
const statusFromDockerState = (state: string): CloudContainerStatus => {
  const lower = state.toLowerCase();
  if (lower.startsWith("running")) return "running";
  if (lower.startsWith("created") || lower.startsWith("starting")) return "starting";
  if (lower.startsWith("exited") || lower.startsWith("removed") || lower === "dead") return "dead";
  return "error";
};

// Extract the GitHub access token from the encrypted v3_users row.
// Returns Option.some(plaintext) only when the decryption succeeds; on
// decrypt error we null and force the caller to treat the user as
// "not linked" (the encryption key rotated or the blob is corrupted).
interface GitHubTokenDeps {
  readonly users: UserRepositoryShape;
  readonly secretStore: ServerSecretStoreShape;
}

const resolveGitHubToken = (deps: GitHubTokenDeps, userId: UserId) =>
  Effect.gen(function* () {
    const tokenOpt = yield* deps.users.getGitHubToken({ id: userId }).pipe(
      Effect.mapError(
        (cause) =>
          new CloudEnvError({
            reason: "unknown",
            message: "Failed to load GitHub token row.",
            cause,
          }),
      ),
    );
    if (Option.isNone(tokenOpt)) return Option.none<string>();
    const record = tokenOpt.value;
    const key = yield* deps.secretStore
      .getOrCreateRandom(GITHUB_TOKEN_ENCRYPTION_KEY_NAME, GITHUB_TOKEN_ENCRYPTION_KEY_BYTES)
      .pipe(
        Effect.mapError(
          (cause) =>
            new CloudEnvError({
              reason: "unknown",
              message: "Failed to access GitHub token encryption key.",
              cause,
            }),
        ),
      );
    // Packed blob (iv + ciphertext + tag) — per the P1e convention we
    // stored the auth tag concatenated onto the ciphertext.
    const packed = record.githubAccessTokenEnc;
    if (packed.length < 17) return Option.none<string>();
    const authTag = packed.slice(packed.length - 16);
    const ciphertext = packed.slice(0, packed.length - 16);
    const plaintext = yield* Effect.try({
      try: () =>
        decryptToken(
          {
            ciphertext,
            iv: record.githubTokenEncIv,
            authTag,
          },
          key,
        ),
      catch: (cause) =>
        new CloudEnvError({
          reason: "repo-access",
          message: "GitHub token failed to decrypt — reconnect your GitHub account.",
          cause,
        }),
    }).pipe(Effect.option);
    return Option.isSome(plaintext) ? Option.some(plaintext.value) : Option.none<string>();
  });

interface GitHubRepoApiResponse {
  readonly full_name?: unknown;
  readonly description?: unknown;
  readonly default_branch?: unknown;
  readonly private?: unknown;
  readonly pushed_at?: unknown;
}

interface GitHubBranchApiResponse {
  readonly name?: unknown;
  readonly protected?: unknown;
}

const parseRepoSummary = (value: unknown): CloudGitHubRepoSummary | null => {
  if (!value || typeof value !== "object") return null;
  const v = value as GitHubRepoApiResponse;
  if (typeof v.full_name !== "string" || v.full_name.length === 0) return null;
  if (typeof v.default_branch !== "string" || v.default_branch.length === 0) return null;
  const pushedAt =
    typeof v.pushed_at === "string" && v.pushed_at.length > 0
      ? (v.pushed_at as unknown as IsoDateTime)
      : null;
  return {
    fullName: v.full_name as typeof TrimmedNonEmptyString.Type,
    description: typeof v.description === "string" ? v.description : null,
    defaultBranch: v.default_branch as typeof TrimmedNonEmptyString.Type,
    private: v.private === true,
    pushedAt,
  };
};

const parseBranchSummary = (value: unknown): CloudGitHubBranchSummary | null => {
  if (!value || typeof value !== "object") return null;
  const v = value as GitHubBranchApiResponse;
  if (typeof v.name !== "string" || v.name.length === 0) return null;
  return {
    name: v.name as typeof TrimmedNonEmptyString.Type,
    protected: v.protected === true,
  };
};

const listReposFromGitHub = (token: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(
        "https://api.github.com/user/repos?per_page=100&sort=pushed&direction=desc",
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "v3-code/0.1",
          },
        },
      );
      if (!response.ok) {
        throw new Error(`GitHub /user/repos responded ${response.status}`);
      }
      const json: unknown = await response.json();
      if (!Array.isArray(json)) return [];
      const summaries: CloudGitHubRepoSummary[] = [];
      for (const entry of json) {
        const parsed = parseRepoSummary(entry);
        if (parsed !== null) summaries.push(parsed);
      }
      return summaries;
    },
    catch: (cause) =>
      new CloudEnvError({
        reason: "repo-access",
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
      }),
  });

const listBranchesFromGitHub = (token: string, repo: string) =>
  Effect.tryPromise({
    try: async () => {
      const url = `https://api.github.com/repos/${repo}/branches?per_page=100`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "v3-code/0.1",
        },
      });
      if (!response.ok) {
        throw new Error(`GitHub /repos/${repo}/branches responded ${response.status}`);
      }
      const json: unknown = await response.json();
      if (!Array.isArray(json)) return [];
      const summaries: CloudGitHubBranchSummary[] = [];
      for (const entry of json) {
        const parsed = parseBranchSummary(entry);
        if (parsed !== null) summaries.push(parsed);
      }
      return summaries;
    },
    catch: (cause) =>
      new CloudEnvError({
        reason: "repo-access",
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
      }),
  });

// Ensure a synthetic "Cloud" device row exists for this user. Safe to
// call every time we provision — the DeviceRepository.register path is
// UPSERT-by-id, so this is cheap.
const ensureCloudDevice = (devices: DeviceRepositoryShape, userId: UserId) =>
  Effect.gen(function* () {
    const now = yield* DateTime.now;
    const cloudDeviceId = makeCloudDeviceId(userId);
    const record = yield* devices
      .register({
        id: cloudDeviceId,
        userId,
        name: CLOUD_DEVICE_NAME as typeof TrimmedNonEmptyString.Type,
        platform: "linux",
        kind: "cloud",
        capabilities: CLOUD_DEVICE_CAPABILITIES,
        now,
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new CloudEnvError({
              reason: "unknown",
              message: "Failed to register the Cloud device row.",
              cause,
            }),
        ),
      );
    // Cloud devices are server-managed — auto-approve so the UI
    // doesn't show a pending device banner.
    if (!record.approved) {
      yield* devices.setApproved({ id: cloudDeviceId, userId, approved: true }).pipe(
        Effect.mapError(
          (cause) =>
            new CloudEnvError({
              reason: "unknown",
              message: "Failed to auto-approve the Cloud device.",
              cause,
            }),
        ),
      );
    }
    return cloudDeviceId;
  });

const makeCloudEnvService = Effect.gen(function* () {
  const config = yield* ServerConfig;
  const runtime = yield* DockerCloudRuntime;
  const repo = yield* CloudContainerRepository;
  const engine = yield* OrchestrationEngineService;
  const users = yield* UserRepository;
  const secretStore = yield* ServerSecretStore;
  const devices = yield* DeviceRepository;
  const tokenDeps: GitHubTokenDeps = { users, secretStore };

  // `requireEnabled` short-circuits every method with a consistent
  // error when the operator has not flipped cloud_env on.
  const requireEnabled = config.cloudEnvEnabled
    ? Effect.void
    : Effect.fail(
        new CloudEnvError({
          reason: "not-enabled",
          message: "Cloud env is not enabled on this server node.",
        }),
      );

  const requireDockerAvailable = Effect.gen(function* () {
    yield* requireEnabled;
    const available = yield* runtime.isAvailable;
    if (!available) {
      return yield* Effect.fail(
        new CloudEnvError({
          reason: "docker-unavailable",
          message:
            "The Docker daemon is not reachable from the server node. Check that the docker CLI is installed and the daemon is running.",
        }),
      );
    }
  });

  const getPublicConfig: CloudEnvServiceShape["getPublicConfig"] = (actor) =>
    Effect.gen(function* () {
      const dockerAvailable = config.cloudEnvEnabled ? yield* runtime.isAvailable : false;
      const githubTokenOpt = yield* resolveGitHubToken(tokenDeps, actor.userId);
      return {
        enabled: config.cloudEnvEnabled,
        dockerAvailable,
        githubConnected: Option.isSome(githubTokenOpt),
        baseImage: config.cloudEnvBaseImage,
        maxContainers: config.cloudEnvMaxContainers,
        containerCpuLimit: config.cloudEnvContainerCpuLimit,
        containerMemoryMb: config.cloudEnvContainerMemoryMb,
        containerDiskGb: config.cloudEnvContainerDiskGb,
        containerMaxRuntimeHours: config.cloudEnvContainerMaxRuntimeHours,
      } satisfies CloudPublicConfigView;
    });

  const listRepos: CloudEnvServiceShape["listRepos"] = (actor) =>
    Effect.gen(function* () {
      const tokenOpt = yield* resolveGitHubToken(tokenDeps, actor.userId);
      if (Option.isNone(tokenOpt)) {
        return yield* Effect.fail(
          new CloudEnvError({
            reason: "github-not-linked",
            message: "Connect GitHub in Settings before starting a Cloud chat.",
          }),
        );
      }
      return yield* listReposFromGitHub(tokenOpt.value);
    });

  const listBranches: CloudEnvServiceShape["listBranches"] = (actor, repoFullName) =>
    Effect.gen(function* () {
      const tokenOpt = yield* resolveGitHubToken(tokenDeps, actor.userId);
      if (Option.isNone(tokenOpt)) {
        return yield* Effect.fail(
          new CloudEnvError({
            reason: "github-not-linked",
            message: "Connect GitHub in Settings before browsing branches.",
          }),
        );
      }
      if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repoFullName)) {
        return yield* Effect.fail(
          new CloudEnvError({
            reason: "repo-access",
            message: `Invalid repo slug: ${repoFullName}`,
          }),
        );
      }
      return yield* listBranchesFromGitHub(tokenOpt.value, repoFullName);
    });

  const getContainerForChat: CloudEnvServiceShape["getContainerForChat"] = (chatId) =>
    Effect.gen(function* () {
      const opt = yield* repo.getByChat({ chatId }).pipe(
        Effect.mapError(
          (cause) =>
            new CloudEnvError({
              reason: "unknown",
              message: "Failed to load cloud container row.",
              cause,
            }),
        ),
      );
      return Option.match(opt, {
        onNone: () => null,
        onSome: (record) => toContainerInfo(record),
      });
    });

  const listContainersForUser: CloudEnvServiceShape["listContainersForUser"] = (userId, options) =>
    repo
      .listForUser({
        userId,
        ...(options?.includeEnded !== undefined ? { includeEnded: options.includeEnded } : {}),
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new CloudEnvError({
              reason: "unknown",
              message: "Failed to list cloud containers.",
              cause,
            }),
        ),
        Effect.map((rows) => rows.map(toContainerInfo)),
      );

  const listAllContainers: CloudEnvServiceShape["listAllContainers"] = repo.listActive.pipe(
    Effect.mapError(
      (cause) =>
        new CloudEnvError({
          reason: "unknown",
          message: "Failed to list active cloud containers.",
          cause,
        }),
    ),
    Effect.map((rows) => rows.map(toContainerInfo)),
  );

  const runClone = (
    containerId: typeof TrimmedNonEmptyString.Type,
    token: string,
    repoFullName: string,
    branch: string,
  ) =>
    runtime
      .runInContainer({
        containerId,
        args: buildCloneArgs(token, repoFullName, branch),
      })
      .pipe(
        Effect.flatMap((result) =>
          result.exitCode === 0
            ? Effect.void
            : Effect.fail(
                new CloudEnvError({
                  reason: "repo-access",
                  message: `git clone failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
                }),
              ),
        ),
      );

  const provision: CloudEnvServiceShape["provision"] = (input, actor) =>
    Effect.gen(function* () {
      yield* requireDockerAvailable;

      // Quota check — sidestep Docker if we're already at the cap.
      const active = yield* listAllContainers;
      const activeAlive = active.filter((c) => c.status !== "dead" && c.status !== "error");
      if (activeAlive.length >= config.cloudEnvMaxContainers) {
        return yield* Effect.fail(
          new CloudEnvError({
            reason: "limit-reached",
            message: `Cloud env is at the configured cap of ${config.cloudEnvMaxContainers} active containers.`,
          }),
        );
      }

      const tokenOpt = yield* resolveGitHubToken(tokenDeps, actor.userId);
      if (Option.isNone(tokenOpt)) {
        return yield* Effect.fail(
          new CloudEnvError({
            reason: "github-not-linked",
            message: "Connect GitHub in Settings before starting a Cloud chat.",
          }),
        );
      }
      const token = tokenOpt.value;

      const cloudDeviceId = yield* ensureCloudDevice(devices, actor.userId);

      const now = yield* DateTime.now;
      const startedAtIso = DateTime.formatIso(now) as IsoDateTime;

      // Insert "starting" row up front so the UI can show progress
      // while docker run is in flight. The row doesn't yet have a
      // container id — we write the sentinel 'pending' and update it
      // once docker returns.
      yield* repo
        .upsert({
          chatId: input.threadId,
          userId: actor.userId,
          containerId: "pending" as typeof TrimmedNonEmptyString.Type,
          image: config.cloudEnvBaseImage as typeof TrimmedNonEmptyString.Type,
          githubRepo: input.githubRepo,
          githubBranch: input.githubBranch,
          status: "starting",
          statusMessage: `Starting container from ${config.cloudEnvBaseImage}…`,
          cpuLimit: config.cloudEnvContainerCpuLimit,
          memoryMb: config.cloudEnvContainerMemoryMb,
          diskGb: config.cloudEnvContainerDiskGb,
          startedAt: now,
        })
        .pipe(
          Effect.mapError(
            (cause) =>
              new CloudEnvError({
                reason: "unknown",
                message: "Failed to record cloud container row.",
                cause,
              }),
          ),
        );

      // Create the orchestration thread (chat row) so the UI can
      // navigate + subscribe immediately. Host device is the synthetic
      // cloud device.
      const createThreadCommand: DispatchableClientOrchestrationCommand = {
        type: "thread.create",
        commandId: input.commandId,
        threadId: input.threadId,
        projectId: input.projectId,
        title: input.title,
        hostDeviceId: cloudDeviceId,
        modelSelection: input.modelSelection,
        runtimeMode: input.runtimeMode,
        interactionMode: input.interactionMode,
        branch: input.githubBranch,
        // Path inside the container. The real filesystem lives on the
        // server node, but the UI shows this so "worktreePath" in the
        // chat view is meaningful.
        worktreePath: `/workspace/repo` as typeof TrimmedNonEmptyString.Type,
        createdAt: startedAtIso,
      };
      yield* engine.dispatch(createThreadCommand).pipe(
        Effect.mapError(
          (cause) =>
            new CloudEnvError({
              reason: "unknown",
              message: "Failed to create the cloud chat thread.",
              cause,
            }),
        ),
      );

      const containerName = `${DOCKER_CONTAINER_NAME_PREFIX}${input.threadId}`;
      const startResult = yield* runtime
        .start({
          name: containerName as typeof TrimmedNonEmptyString.Type,
          image: config.cloudEnvBaseImage as typeof TrimmedNonEmptyString.Type,
          cpuLimit: config.cloudEnvContainerCpuLimit,
          memoryMb: config.cloudEnvContainerMemoryMb,
          diskGb: config.cloudEnvContainerDiskGb,
          env: {
            V3_CHAT_ID: input.threadId,
            V3_USER_ID: actor.userId,
            V3_GITHUB_REPO: input.githubRepo,
            V3_GITHUB_BRANCH: input.githubBranch,
          },
          labels: buildDefaultLabels({
            chatId: input.threadId,
            userId: actor.userId,
          }),
        })
        .pipe(
          Effect.tapError((err) =>
            repo
              .updateStatus({
                chatId: input.threadId,
                status: "error",
                statusMessage: err.message,
                endedAt: now,
                lastCheckedAt: now,
              })
              .pipe(Effect.orElseSucceed(() => void 0)),
          ),
        );

      // Move status forward: starting → cloning.
      yield* repo
        .updateStatus({
          chatId: input.threadId,
          status: "cloning",
          statusMessage: `Cloning ${input.githubRepo} @ ${input.githubBranch}…`,
          lastCheckedAt: now,
        })
        .pipe(
          Effect.mapError(
            (cause) =>
              new CloudEnvError({
                reason: "unknown",
                message: "Failed to persist container status.",
                cause,
              }),
          ),
        );
      // Persist the actual container id (overwriting 'pending').
      yield* repo
        .upsert({
          chatId: input.threadId,
          userId: actor.userId,
          containerId: startResult.containerId,
          image: config.cloudEnvBaseImage as typeof TrimmedNonEmptyString.Type,
          githubRepo: input.githubRepo,
          githubBranch: input.githubBranch,
          status: "cloning",
          statusMessage: `Cloning ${input.githubRepo} @ ${input.githubBranch}…`,
          cpuLimit: config.cloudEnvContainerCpuLimit,
          memoryMb: config.cloudEnvContainerMemoryMb,
          diskGb: config.cloudEnvContainerDiskGb,
          startedAt: now,
        })
        .pipe(Effect.orElseSucceed(() => void 0));

      yield* runClone(startResult.containerId, token, input.githubRepo, input.githubBranch).pipe(
        Effect.tapError((err) =>
          pipe(
            DateTime.now,
            Effect.flatMap((failedAt) =>
              repo.updateStatus({
                chatId: input.threadId,
                status: "error",
                statusMessage: err.message,
                endedAt: failedAt,
                lastCheckedAt: failedAt,
              }),
            ),
            Effect.orElseSucceed(() => void 0),
          ),
        ),
      );

      const readyAt = yield* DateTime.now;
      const readyRecord = yield* repo
        .updateStatus({
          chatId: input.threadId,
          status: "ready",
          statusMessage: "Cloud environment ready.",
          readyAt,
          lastCheckedAt: readyAt,
        })
        .pipe(
          Effect.mapError(
            (cause) =>
              new CloudEnvError({
                reason: "unknown",
                message: "Failed to mark container ready.",
                cause,
              }),
          ),
        );

      return {
        threadId: input.threadId,
        hostDeviceId: cloudDeviceId,
        container: toContainerInfo(readyRecord),
      } satisfies CloudProvisionResult;
    });

  const end: CloudEnvServiceShape["end"] = (input) =>
    Effect.gen(function* () {
      yield* requireEnabled;
      const opt = yield* repo.getByChat({ chatId: input.chatId }).pipe(
        Effect.mapError(
          (cause) =>
            new CloudEnvError({
              reason: "unknown",
              message: "Failed to load container row.",
              cause,
            }),
        ),
      );
      if (Option.isNone(opt)) {
        return {
          chatId: input.chatId,
          status: "dead" as const,
        } satisfies CloudEndChatResult;
      }
      const record = opt.value;
      if (record.status === "dead" || record.status === "error") {
        return {
          chatId: input.chatId,
          status: record.status,
        } satisfies CloudEndChatResult;
      }

      const now = yield* DateTime.now;
      yield* repo
        .updateStatus({
          chatId: input.chatId,
          status: "stopping",
          statusMessage: "Stopping container…",
          lastCheckedAt: now,
        })
        .pipe(Effect.orElseSucceed(() => void 0));

      // Only try to hit Docker if we actually recorded a real
      // container id — "pending" means `docker run` never returned.
      if (record.containerId !== "pending") {
        yield* runtime
          .stopAndRemove({
            containerId: record.containerId,
            timeoutSeconds: 10,
          })
          .pipe(
            Effect.tapError((err) =>
              Effect.logWarning(
                `docker stopAndRemove failed for chat ${input.chatId}: ${err.message}`,
              ),
            ),
            Effect.orElseSucceed(() => void 0),
          );
      }

      const endedAt = yield* DateTime.now;
      yield* repo
        .updateStatus({
          chatId: input.chatId,
          status: "dead",
          statusMessage: "Container stopped.",
          endedAt,
          lastCheckedAt: endedAt,
        })
        .pipe(Effect.orElseSucceed(() => void 0));

      return {
        chatId: input.chatId,
        status: "dead" as const,
      } satisfies CloudEndChatResult;
    });

  // Reconcile DB rows with live Docker state. Called on server boot +
  // on an interval so rows don't drift (eg. someone ran `docker stop`
  // by hand, or the server crashed mid-provisioning).
  const syncWithDocker: CloudEnvServiceShape["syncWithDocker"] = Effect.gen(function* () {
    const enabled = config.cloudEnvEnabled;
    if (!enabled) return;
    const available = yield* runtime.isAvailable;
    if (!available) return;
    const live = yield* runtime.listV3Containers.pipe(
      Effect.orElseSucceed(
        () =>
          [] as ReadonlyArray<{
            readonly containerId: string;
            readonly name: string;
            readonly image: string;
            readonly state: string;
            readonly createdAt: string | null;
          }>,
      ),
    );
    const liveById = new Map(live.map((entry) => [entry.containerId, entry]));
    const active = yield* repo.listActive.pipe(
      Effect.orElseSucceed(() => [] as ReadonlyArray<CloudContainerRecord>),
    );
    const now = yield* DateTime.now;
    const nowMillis = DateTime.toEpochMillis(now);
    for (const record of active) {
      const liveState = liveById.get(record.containerId);
      if (liveState === undefined && record.containerId !== "pending") {
        yield* repo
          .updateStatus({
            chatId: record.chatId,
            status: "dead",
            statusMessage: "Container disappeared from Docker.",
            endedAt: now,
            lastCheckedAt: now,
          })
          .pipe(Effect.orElseSucceed(() => void 0));
        continue;
      }
      if (liveState !== undefined) {
        const inferredStatus = statusFromDockerState(liveState.state);
        if (inferredStatus !== record.status) {
          yield* repo
            .updateStatus({
              chatId: record.chatId,
              status: inferredStatus,
              lastCheckedAt: now,
              ...(inferredStatus === "dead" ? { endedAt: now } : {}),
            })
            .pipe(Effect.orElseSucceed(() => void 0));
        }
      }
      // Max-runtime clamp.
      const maxMillis = config.cloudEnvContainerMaxRuntimeHours * 3_600_000;
      const startedMillis = DateTime.toEpochMillis(record.startedAt);
      if (nowMillis - startedMillis > maxMillis && liveState !== undefined) {
        yield* runtime
          .stopAndRemove({ containerId: record.containerId, timeoutSeconds: 5 })
          .pipe(Effect.orElseSucceed(() => void 0));
        yield* repo
          .updateStatus({
            chatId: record.chatId,
            status: "dead",
            statusMessage: "Container exceeded max runtime.",
            endedAt: now,
            lastCheckedAt: now,
          })
          .pipe(Effect.orElseSucceed(() => void 0));
      }
    }
  });

  return {
    provision,
    end,
    getContainerForChat,
    listContainersForUser,
    listAllContainers,
    listRepos,
    listBranches,
    getPublicConfig,
    syncWithDocker,
  } satisfies CloudEnvServiceShape;
});

export const CloudEnvServiceLive = Layer.effect(CloudEnvService, makeCloudEnvService);
