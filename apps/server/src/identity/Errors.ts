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
