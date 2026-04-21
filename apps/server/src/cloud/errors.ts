// V3 Phase 8 — tagged errors for cloud-env operations.
//
// Using a tagged error class keeps callers on the narrow,
// effect(globalErrorInEffectCatch)-clean side of the Effect.tryPromise
// contract. Callers can `Effect.catchTag("CloudError", ...)` and get a
// typed error with a message and optional cause.

import { Data } from "effect";

export class CloudError extends Data.TaggedError("CloudError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const toCloudError = (fallback: string) => (cause: unknown) =>
  new CloudError({
    message: cause instanceof Error ? cause.message : fallback,
    cause,
  });
