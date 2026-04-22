import { TrimmedNonEmptyString } from "@v3tools/contracts";
import { Context, Option, Schema } from "effect";
import type { Effect } from "effect";

import type { FcmPushConfigRepositoryError } from "../Errors.ts";

// V3 Phase 9 — single-row FCM service account configuration.
//
// The service account's `private_key` is stored encrypted at rest with
// AES-GCM via `tokenEncryption.ts` (same key material as GitHub token
// encryption, pulled from `ServerSecretStore`). `project_id` and
// `client_email` are plaintext because they're already visible in
// Firebase Console / Play Console.
//
// The repository exposes:
//   * `upsert` — replace the single `id = 'default'` row with a fresh
//                service account JSON.
//   * `clear` — delete the row (stops all FCM sends).
//   * `get` — load and decrypt the config for the push service.
//   * `touchDispatch` — called after every send to keep the admin
//                panel's "last dispatch" timestamp + error string fresh.

export const FcmServiceAccountConfig = Schema.Struct({
  projectId: TrimmedNonEmptyString,
  clientEmail: TrimmedNonEmptyString,
  privateKey: TrimmedNonEmptyString,
  uploadedAt: Schema.DateTimeUtcFromString,
  lastDispatchAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  lastError: Schema.NullOr(Schema.String),
});
export type FcmServiceAccountConfig = typeof FcmServiceAccountConfig.Type;

export const FcmConfigStatusRow = Schema.Struct({
  projectId: TrimmedNonEmptyString,
  clientEmail: TrimmedNonEmptyString,
  uploadedAt: Schema.DateTimeUtcFromString,
  lastDispatchAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  lastError: Schema.NullOr(Schema.String),
});
export type FcmConfigStatusRow = typeof FcmConfigStatusRow.Type;

export const UpsertFcmConfigInput = Schema.Struct({
  projectId: TrimmedNonEmptyString,
  clientEmail: TrimmedNonEmptyString,
  privateKey: TrimmedNonEmptyString,
  uploadedAt: Schema.DateTimeUtcFromString,
});
export type UpsertFcmConfigInput = typeof UpsertFcmConfigInput.Type;

export const TouchDispatchInput = Schema.Struct({
  dispatchedAt: Schema.DateTimeUtcFromString,
  error: Schema.NullOr(Schema.String),
});
export type TouchDispatchInput = typeof TouchDispatchInput.Type;

export interface FcmPushConfigRepositoryShape {
  readonly upsert: (
    input: UpsertFcmConfigInput,
  ) => Effect.Effect<FcmConfigStatusRow, FcmPushConfigRepositoryError>;
  readonly clear: () => Effect.Effect<boolean, FcmPushConfigRepositoryError>;
  readonly get: () => Effect.Effect<
    Option.Option<FcmServiceAccountConfig>,
    FcmPushConfigRepositoryError
  >;
  readonly getStatus: () => Effect.Effect<
    Option.Option<FcmConfigStatusRow>,
    FcmPushConfigRepositoryError
  >;
  readonly touchDispatch: (
    input: TouchDispatchInput,
  ) => Effect.Effect<void, FcmPushConfigRepositoryError>;
}

export class FcmPushConfigRepository extends Context.Service<
  FcmPushConfigRepository,
  FcmPushConfigRepositoryShape
>()("v3/identity/Services/FcmPushConfigRepository") {}
