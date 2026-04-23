import { Schema } from "effect";

import type { PersistenceDecodeError, PersistenceSqlError } from "../persistence/Errors.ts";

// Identity-layer errors.
//
// - Repository errors reuse the persistence layer's SQL / decode errors so
//   higher-level code can handle them uniformly with other repositories.
// - Google identity verification gets a dedicated tagged error to carry
//   JWT-specific failure categories.

export type UserRepositoryError = PersistenceSqlError | PersistenceDecodeError;
export type DeviceRepositoryError = PersistenceSqlError | PersistenceDecodeError;
export type DevicePushTokenRepositoryError = PersistenceSqlError | PersistenceDecodeError;
export type FcmPushConfigRepositoryError = PersistenceSqlError | PersistenceDecodeError;

export class GoogleIdentityError extends Schema.TaggedErrorClass<GoogleIdentityError>()(
  "GoogleIdentityError",
  {
    reason: Schema.Literals([
      "not-configured",
      "invalid-token",
      "token-expired",
      "wrong-audience",
      "wrong-issuer",
      "email-not-verified",
      "unknown",
    ]),
    message: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

// V3 Phase 1e — GitHub identity errors.
//
// `not-configured` — operator hasn't set V3CODE_GITHUB_CLIENT_ID /
//                    V3CODE_GITHUB_CLIENT_SECRET.
// `invalid-state`  — the server-signed state envelope failed HMAC /
//                    expiration / schema checks. Usually means the user
//                    started the flow > 10 min ago.
// `token-exchange` — GitHub's POST /login/oauth/access_token rejected
//                    the code (expired / used twice / wrong client id).
// `profile-fetch`  — we could exchange but couldn't load /user.
// `user-cancelled` — the user hit "Cancel" on GitHub's consent page;
//                    GitHub redirects with `error=access_denied`.
// `unknown`        — catch-all for surprises.
export class GitHubIdentityError extends Schema.TaggedErrorClass<GitHubIdentityError>()(
  "GitHubIdentityError",
  {
    reason: Schema.Literals([
      "not-configured",
      "invalid-state",
      "token-exchange",
      "profile-fetch",
      "user-cancelled",
      "unknown",
    ]),
    message: Schema.String,
    cause: Schema.optional(Schema.Defect),
  },
) {}

// V3 Phase 9 — FCM push errors.
//
// `not-configured`   — operator never uploaded a service account JSON.
// `invalid-config`   — uploaded JSON didn't match the expected shape.
// `token-mint`       — FCM service account JWT → OAuth token exchange failed.
// `dispatch`         — FCM returned 4xx / 5xx on a send attempt.
// `token-invalid`    — FCM returned NotRegistered / InvalidRegistration for
//                      a recipient token; caller should remove it.
// `unknown`          — catch-all.
export class FcmPushError extends Schema.TaggedErrorClass<FcmPushError>()("FcmPushError", {
  reason: Schema.Literals([
    "not-configured",
    "invalid-config",
    "token-mint",
    "dispatch",
    "token-invalid",
    "unknown",
  ]),
  message: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}
