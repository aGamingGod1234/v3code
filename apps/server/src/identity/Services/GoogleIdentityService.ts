import type { VerifiedGoogleIdentity } from "@v3tools/contracts";
import { Context } from "effect";
import type { Effect } from "effect";

import type { GoogleIdentityError } from "../Errors.ts";

// Google identity verification service.
//
// The live layer uses `jose.createRemoteJWKSet` against Google's public keys
// and `jose.jwtVerify` with issuer + audience checks. Tests build a service
// from `makeGoogleIdentityServiceWith` (in the Layer module) with a mock
// verifier that uses an in-memory keypair, so no network access is needed
// and JWT shape invariants can be exercised deterministically.

export interface GoogleIdentityServiceShape {
  readonly verifyIdToken: (
    idToken: string,
  ) => Effect.Effect<VerifiedGoogleIdentity, GoogleIdentityError>;
}

export class GoogleIdentityService extends Context.Service<
  GoogleIdentityService,
  GoogleIdentityServiceShape
>()("v3/identity/Services/GoogleIdentityService") {}
