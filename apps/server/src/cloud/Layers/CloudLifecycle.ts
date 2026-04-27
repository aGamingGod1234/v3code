import { Duration, Effect, Layer, Schedule } from "effect";

import { ContainerManager } from "../Services/ContainerManager.ts";

// Spec §7.4 mandates the container-monitor service check resource usage
// every 60 s and kill containers that exceed their limits. `pruneExpired`
// also enforces the max-runtime bound from §7.2, so stretching this
// beyond a minute lets long-running containers outlive their window.
const PRUNE_INTERVAL = Duration.seconds(60);

// V3 Phase 8 — Scheduled cloud-env maintenance.
//
// Kicks off a background loop that calls ContainerManager.pruneExpired()
// every 60 seconds. When cloud env is disabled or docker is unavailable,
// `pruneExpired` is cheap: it short-circuits out of the metadata scan
// because `cloudEnvMaxContainers` is never reached. We keep the layer
// live regardless so operators who enable cloud env at runtime don't
// have to restart the process.
export const CloudLifecycleLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const containers = yield* ContainerManager;
    yield* Effect.forkScoped(
      Effect.repeat(
        containers.pruneExpired().pipe(
          Effect.catch((cause) =>
            Effect.logDebug("cloud env prune failed", {
              cause: cause instanceof Error ? cause.message : String(cause),
            }),
          ),
        ),
        Schedule.spaced(PRUNE_INTERVAL),
      ),
    );
  }),
);
