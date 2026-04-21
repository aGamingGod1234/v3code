import { Duration, Effect, Layer, Schedule } from "effect";

import { ContainerManager } from "../Services/ContainerManager.ts";

const PRUNE_INTERVAL = Duration.minutes(5);

// V3 Phase 8 — Scheduled cloud-env maintenance.
//
// Kicks off a background loop that calls ContainerManager.pruneExpired()
// every 5 minutes. When cloud env is disabled or docker is unavailable,
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
