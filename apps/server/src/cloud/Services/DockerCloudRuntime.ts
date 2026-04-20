import { Context, Schema } from "effect";
import type { Effect } from "effect";

import { TrimmedNonEmptyString } from "@v3tools/contracts";

import { CloudEnvError } from "../Errors.ts";

// V3 Phase 8 — Docker runtime abstraction.
//
// The Live layer shells out to the `docker` CLI (simplest, zero extra
// npm dependency, works with the default DOCKER_HOST detection). The
// shape keeps the surface small so a future `dockerode`-backed layer
// is drop-in compatible.
//
// Design note: we explicitly do NOT try to speak the Docker Engine
// API over its unix socket ourselves. The CLI already handles TLS,
// contexts, auth, and platform differences; reinventing that in-proc
// would be strictly worse.

export const DockerStartInput = Schema.Struct({
  // Human-stable container name. We use `v3-chat-<chatId>` per spec.
  name: TrimmedNonEmptyString,
  image: TrimmedNonEmptyString,
  // `--cpus`. Passed as a float via .toString().
  cpuLimit: Schema.Number,
  memoryMb: Schema.Int,
  // `--storage-opt size=<N>G`. Not all storage drivers support this;
  // the Live layer skips the flag when the runtime advertises the
  // "overlay2 without xfs quota" combo that rejects it.
  diskGb: Schema.Int,
  // Env vars passed via `-e KEY=VALUE`. Callers are responsible for
  // sanitising; we do no escaping beyond JSON.stringify.
  env: Schema.Record(Schema.String, Schema.String),
  // Optional entrypoint override. Empty = use the image default.
  entrypoint: Schema.optional(TrimmedNonEmptyString),
  // Optional command args (after `--`). Passed raw.
  command: Schema.optional(Schema.Array(Schema.String)),
  // Labels let `docker ps --filter label=<k>=<v>` find our containers.
  labels: Schema.Record(Schema.String, Schema.String),
});
export type DockerStartInput = typeof DockerStartInput.Type;

export const DockerStartResult = Schema.Struct({
  // Full 64-char docker id; callers usually display the first 12.
  containerId: TrimmedNonEmptyString,
});
export type DockerStartResult = typeof DockerStartResult.Type;

export const DockerStopInput = Schema.Struct({
  containerId: TrimmedNonEmptyString,
  // Forwarded to `docker stop --time <N>`. Default 10s.
  timeoutSeconds: Schema.optional(Schema.Int),
});
export type DockerStopInput = typeof DockerStopInput.Type;

export const DockerRunInContainerInput = Schema.Struct({
  containerId: TrimmedNonEmptyString,
  args: Schema.Array(Schema.String),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  workingDirectory: Schema.optional(TrimmedNonEmptyString),
});
export type DockerRunInContainerInput = typeof DockerRunInContainerInput.Type;

export const DockerRunInContainerResult = Schema.Struct({
  exitCode: Schema.Int,
  stdout: Schema.String,
  stderr: Schema.String,
});
export type DockerRunInContainerResult = typeof DockerRunInContainerResult.Type;

// Subset of `docker ps --format json` fields we care about.
export const DockerContainerSummary = Schema.Struct({
  containerId: TrimmedNonEmptyString,
  name: TrimmedNonEmptyString,
  image: TrimmedNonEmptyString,
  // Raw Docker state: "running", "exited", "created", etc.
  state: Schema.String,
  // ISO 8601 (from docker's CreatedAt). Stored as-is, callers decide
  // how to parse. Null is acceptable — docker ps is supposed to
  // always include it, but the JSON shape has shifted across
  // versions.
  createdAt: Schema.NullOr(Schema.String),
});
export type DockerContainerSummary = typeof DockerContainerSummary.Type;

export interface DockerCloudRuntimeShape {
  // Returns true iff the `docker` CLI is installed AND the daemon
  // currently responds to `docker info`. Cached for ~30s inside the
  // Live layer so callers can poll cheaply.
  readonly isAvailable: Effect.Effect<boolean>;

  // Pulls the image if missing, creates + starts the container. Fails
  // with `container-failure` on non-zero exit.
  readonly start: (input: DockerStartInput) => Effect.Effect<DockerStartResult, CloudEnvError>;

  // SIGTERM → wait timeout → SIGKILL, then `docker rm` to reap the
  // stopped container. Idempotent: stopping an already-stopped or
  // already-removed container is a no-op.
  readonly stopAndRemove: (input: DockerStopInput) => Effect.Effect<void, CloudEnvError>;

  // Runs a single command inside the container (docker exec wrapper).
  // Callers must keep it short-lived; long-running processes belong
  // in the image's entrypoint.
  readonly runInContainer: (
    input: DockerRunInContainerInput,
  ) => Effect.Effect<DockerRunInContainerResult, CloudEnvError>;

  // Lists all containers (running + stopped) that carry the
  // `v3-code.chat-id` label. Used by the admin containers endpoint
  // and by the reaper on startup.
  readonly listV3Containers: Effect.Effect<ReadonlyArray<DockerContainerSummary>, CloudEnvError>;
}

// V3_CODE_LABEL keys used across the runtime. Duplicated with the
// Docker daemon's authoritative label copy (`docker inspect`), so
// downstream consumers never parse the container name to recover
// which chat it belongs to.
export const DOCKER_LABEL_CHAT_ID = "v3-code.chat-id";
export const DOCKER_LABEL_USER_ID = "v3-code.user-id";
export const DOCKER_LABEL_IMAGE_VARIANT = "v3-code.image-variant";
export const DOCKER_LABEL_PRODUCT = "v3-code.product";

// Prefix used for container names. `v3-chat-<chatId>` per V3 spec §6.2.
export const DOCKER_CONTAINER_NAME_PREFIX = "v3-chat-";

export class DockerCloudRuntime extends Context.Service<
  DockerCloudRuntime,
  DockerCloudRuntimeShape
>()("v3/cloud/Services/DockerCloudRuntime") {}
