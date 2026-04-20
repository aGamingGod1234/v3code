import { Cache, Duration, Effect, Layer, Ref } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { collectStreamAsString } from "../../provider/providerSnapshot.ts";
import { isWindowsCommandNotFound } from "../../processRunner.ts";
import { ServerConfig, type ServerConfigShape } from "../../config.ts";
import { CloudEnvError } from "../Errors.ts";
import {
  DockerCloudRuntime,
  DOCKER_LABEL_CHAT_ID,
  DOCKER_LABEL_IMAGE_VARIANT,
  DOCKER_LABEL_PRODUCT,
  DOCKER_LABEL_USER_ID,
  type DockerCloudRuntimeShape,
  type DockerContainerSummary,
  type DockerRunInContainerInput,
  type DockerRunInContainerResult,
  type DockerStartInput,
  type DockerStopInput,
  type DockerStartResult,
} from "../Services/DockerCloudRuntime.ts";

// V3 Phase 8 — docker CLI-backed runtime.
//
// Everything here shells out to `docker` via ChildProcessSpawner. We
// intentionally do NOT reach for `dockerode` or speak the Engine API
// directly: the CLI handles daemon detection, TLS, Docker contexts,
// and Windows/WSL quirks in a way we don't want to reimplement.
//
// `isAvailable` is cached for 30s so callers (the `Cloud` host picker
// polling it on dialog open, the admin panel polling it for the
// dashboard card, etc.) can hit it cheaply.

const DOCKER_AVAILABILITY_TTL = Duration.seconds(30);

interface RawRunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface DockerRunDeps {
  readonly spawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly config: ServerConfigShape;
}

const runRawDocker = (
  deps: DockerRunDeps,
  args: ReadonlyArray<string>,
  options?: {
    readonly env?: Record<string, string>;
    readonly cwd?: string;
    readonly timeoutMs?: number;
  },
) =>
  Effect.gen(function* () {
    const dockerEnv: Record<string, string | undefined> = {
      ...process.env,
      ...options?.env,
    };
    // Honour the operator-specified socket so docker contexts the
    // user configured (rootless, remote over SSH) route correctly.
    if (deps.config.cloudEnvDockerSocket && !dockerEnv.DOCKER_HOST) {
      dockerEnv.DOCKER_HOST = `unix://${deps.config.cloudEnvDockerSocket}`;
    }
    const command = ChildProcess.make("docker", [...args], {
      ...(options?.cwd ? { cwd: options.cwd } : {}),
      // `shell: false` — we want argv-style spawning so args don't
      // need re-quoting. Defaults to false on non-Windows.
      env: dockerEnv,
    });
    const child = yield* deps.spawner.spawn(command);
    const [stdout, stderr, exitCode] = yield* Effect.all(
      [
        collectStreamAsString(child.stdout),
        collectStreamAsString(child.stderr),
        child.exitCode.pipe(Effect.map(Number)),
      ],
      { concurrency: "unbounded" },
    );
    if (isWindowsCommandNotFound(exitCode, stderr)) {
      return yield* Effect.fail(new Error("spawn docker ENOENT"));
    }
    return { exitCode, stdout, stderr } satisfies RawRunResult;
  }).pipe(Effect.scoped);

const toCloudEnvError = (reason: CloudEnvError["reason"], message: string) => (cause: unknown) =>
  new CloudEnvError({
    reason,
    message,
    ...(cause !== undefined ? { cause } : {}),
  });

// Build the `docker run -d` command line. Kept as a pure helper so the
// tests can assert on the exact args without spawning anything.
export const buildRunArgs = (input: DockerStartInput): ReadonlyArray<string> => {
  const args: string[] = ["run", "-d", "--name", input.name];
  args.push("--cpus", input.cpuLimit.toString());
  args.push("--memory", `${input.memoryMb}m`);
  if (input.diskGb > 0) {
    args.push("--storage-opt", `size=${input.diskGb}G`);
  }
  for (const [key, value] of Object.entries(input.env)) {
    args.push("-e", `${key}=${value}`);
  }
  for (const [key, value] of Object.entries(input.labels)) {
    args.push("--label", `${key}=${value}`);
  }
  if (input.entrypoint !== undefined) {
    args.push("--entrypoint", input.entrypoint);
  }
  args.push(input.image);
  if (input.command !== undefined) {
    for (const arg of input.command) {
      args.push(arg);
    }
  }
  return args;
};

// Parse `docker ps --format '{{json .}}'` newline-delimited output.
// Exported for tests.
export const parseDockerPsJson = (raw: string): ReadonlyArray<DockerContainerSummary> => {
  const out: DockerContainerSummary[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }
    const containerId = typeof parsed.ID === "string" ? parsed.ID : undefined;
    const name = typeof parsed.Names === "string" ? parsed.Names : undefined;
    const image = typeof parsed.Image === "string" ? parsed.Image : undefined;
    const state = typeof parsed.State === "string" ? parsed.State : undefined;
    const createdAt = typeof parsed.CreatedAt === "string" ? parsed.CreatedAt : null;
    if (!containerId || !name || !image || !state) continue;
    out.push({
      containerId: containerId as DockerContainerSummary["containerId"],
      name: name as DockerContainerSummary["name"],
      image: image as DockerContainerSummary["image"],
      state,
      createdAt,
    });
  }
  return out;
};

const makeDockerCloudRuntime = Effect.gen(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const config = yield* ServerConfig;
  const deps: DockerRunDeps = { spawner, config };

  // 30s cache on `docker info`. `Cache.make` requires a string key so
  // we always pass the constant "self"; we just want TTL caching.
  const availabilityCache = yield* Cache.make({
    capacity: 1,
    timeToLive: DOCKER_AVAILABILITY_TTL,
    lookup: (_: "self") =>
      runRawDocker(deps, ["info", "--format", "{{.ServerVersion}}"]).pipe(
        Effect.map((res) => res.exitCode === 0 && res.stdout.trim().length > 0),
        Effect.orElseSucceed(() => false),
      ),
  });

  const isAvailable = Cache.get(availabilityCache, "self");

  // Small ref we expose in tests to force `isAvailable` = false
  // without touching `docker info`.
  const forcedAvailabilityOverride = yield* Ref.make<boolean | undefined>(undefined);

  const resolvedAvailability = Effect.gen(function* () {
    const override = yield* Ref.get(forcedAvailabilityOverride);
    if (override !== undefined) return override;
    return yield* isAvailable;
  });

  const start: DockerCloudRuntimeShape["start"] = (input: DockerStartInput) =>
    Effect.gen(function* () {
      const args = buildRunArgs(input);
      const result = yield* runRawDocker(deps, args).pipe(
        Effect.mapError(toCloudEnvError("docker-unavailable", "Failed to invoke the docker CLI.")),
      );
      if (result.exitCode !== 0) {
        const lower = result.stderr.toLowerCase();
        if (lower.includes("cannot connect to the docker daemon")) {
          return yield* Effect.fail(
            new CloudEnvError({
              reason: "docker-unavailable",
              message: "Docker daemon is not reachable from the server node.",
            }),
          );
        }
        return yield* Effect.fail(
          new CloudEnvError({
            reason: "container-failure",
            message: `docker run failed (exit ${result.exitCode}): ${result.stderr.trim() || result.stdout.trim()}`,
          }),
        );
      }
      const containerId = result.stdout.trim();
      if (containerId.length === 0) {
        return yield* Effect.fail(
          new CloudEnvError({
            reason: "container-failure",
            message: "docker run returned no container id.",
          }),
        );
      }
      return { containerId } as DockerStartResult;
    });

  const stopAndRemove: DockerCloudRuntimeShape["stopAndRemove"] = (input: DockerStopInput) =>
    Effect.gen(function* () {
      const timeoutArg =
        input.timeoutSeconds !== undefined ? ["--time", input.timeoutSeconds.toString()] : [];
      const stopResult = yield* runRawDocker(deps, ["stop", ...timeoutArg, input.containerId]).pipe(
        Effect.mapError(toCloudEnvError("docker-unavailable", "Failed to invoke docker stop.")),
      );
      // Non-zero on already-stopped/already-removed is fine; docker
      // prints "No such container" and exits 1. We only bail on truly
      // novel failures.
      if (stopResult.exitCode !== 0) {
        const lower = stopResult.stderr.toLowerCase();
        if (!lower.includes("no such container") && !lower.includes("is not running")) {
          yield* Effect.logWarning(
            `docker stop ${input.containerId} exited ${stopResult.exitCode}: ${stopResult.stderr.trim()}`,
          );
        }
      }
      const rmResult = yield* runRawDocker(deps, ["rm", "-f", input.containerId]).pipe(
        Effect.mapError(toCloudEnvError("docker-unavailable", "Failed to invoke docker rm.")),
      );
      if (rmResult.exitCode !== 0) {
        const lower = rmResult.stderr.toLowerCase();
        if (!lower.includes("no such container")) {
          yield* Effect.logWarning(
            `docker rm -f ${input.containerId} exited ${rmResult.exitCode}: ${rmResult.stderr.trim()}`,
          );
        }
      }
    });

  const runInContainer: DockerCloudRuntimeShape["runInContainer"] = (
    input: DockerRunInContainerInput,
  ) =>
    Effect.gen(function* () {
      const args: string[] = ["exec"];
      if (input.workingDirectory !== undefined) {
        args.push("--workdir", input.workingDirectory);
      }
      for (const [key, value] of Object.entries(input.env ?? {})) {
        args.push("-e", `${key}=${value}`);
      }
      args.push(input.containerId, ...input.args);
      const result = yield* runRawDocker(deps, args).pipe(
        Effect.mapError(toCloudEnvError("docker-unavailable", "Failed to invoke docker exec.")),
      );
      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      } satisfies DockerRunInContainerResult;
    });

  const listV3Containers: DockerCloudRuntimeShape["listV3Containers"] = Effect.gen(function* () {
    const result = yield* runRawDocker(deps, [
      "ps",
      "--all",
      "--filter",
      `label=${DOCKER_LABEL_PRODUCT}=v3-code`,
      "--format",
      "{{json .}}",
    ]).pipe(Effect.mapError(toCloudEnvError("docker-unavailable", "Failed to invoke docker ps.")));
    if (result.exitCode !== 0) {
      return yield* Effect.fail(
        new CloudEnvError({
          reason: "container-failure",
          message: `docker ps failed (exit ${result.exitCode}): ${result.stderr.trim()}`,
        }),
      );
    }
    return parseDockerPsJson(result.stdout);
  });

  return {
    isAvailable: resolvedAvailability,
    start,
    stopAndRemove,
    runInContainer,
    listV3Containers,
  } satisfies DockerCloudRuntimeShape;
});

export const DockerCloudRuntimeLive = Layer.effect(DockerCloudRuntime, makeDockerCloudRuntime);

// Re-exported for tests / callers building label sets.
export const buildDefaultLabels = (input: {
  readonly chatId: string;
  readonly userId: string;
  readonly imageVariant?: string;
}): Record<string, string> => ({
  [DOCKER_LABEL_PRODUCT]: "v3-code",
  [DOCKER_LABEL_CHAT_ID]: input.chatId,
  [DOCKER_LABEL_USER_ID]: input.userId,
  [DOCKER_LABEL_IMAGE_VARIANT]: input.imageVariant ?? "cloud-env",
});
