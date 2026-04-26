import { GoogleSub, TrimmedNonEmptyString, type VerifiedGoogleIdentity } from "@v3tools/contracts";
import { Effect, Layer, Schema } from "effect";
import * as jose from "jose";

import { GoogleIdentityError } from "../Errors.ts";

const isGoogleIdentityError = Schema.is(GoogleIdentityError);
import {
  GoogleIdentityService,
  type GoogleIdentityServiceShape,
} from "../Services/GoogleIdentityService.ts";

const GOOGLE_JWKS_URL = new URL("https://www.googleapis.com/oauth2/v3/certs");
const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"] as const;

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

// Extracted so both the Live implementation and test helpers can build a
// service by injecting a `jwks` function matching jose.JWTVerifyGetKey.
export const makeGoogleIdentityServiceWith = (opts: {
  readonly jwks: jose.JWTVerifyGetKey;
  readonly clientId: string;
  readonly issuers?: ReadonlyArray<string>;
}): GoogleIdentityServiceShape => {
  const issuerList = opts.issuers ?? GOOGLE_ISSUERS;

  const verifyIdToken: GoogleIdentityServiceShape["verifyIdToken"] = (idToken) =>
    Effect.tryPromise({
      try: async () => {
        const { payload } = await jose.jwtVerify(idToken, opts.jwks, {
          issuer: [...issuerList],
          audience: opts.clientId,
        });
        const sub = asString(payload.sub);
        const email = asString(payload.email);
        if (sub === null) {
          throw new GoogleIdentityError({
            reason: "invalid-token",
            message: "ID token is missing the `sub` claim.",
          });
        }
        if (email === null) {
          throw new GoogleIdentityError({
            reason: "invalid-token",
            message: "ID token is missing the `email` claim.",
          });
        }
        const emailVerified = payload.email_verified === true;
        if (!emailVerified) {
          throw new GoogleIdentityError({
            reason: "email-not-verified",
            message: `Google has not verified email ${email}.`,
          });
        }
        return {
          googleSub: GoogleSub.make(sub),
          email: TrimmedNonEmptyString.make(email),
          emailVerified,
          displayName: asString(payload.name),
          avatarUrl: asString(payload.picture),
        } satisfies VerifiedGoogleIdentity;
      },
      catch: (cause) => {
        if (isGoogleIdentityError(cause)) return cause;
        if (cause instanceof jose.errors.JWTExpired) {
          return new GoogleIdentityError({
            reason: "token-expired",
            message: "ID token has expired.",
            cause,
          });
        }
        if (cause instanceof jose.errors.JWTClaimValidationFailed) {
          const reason =
            cause.claim === "iss"
              ? "wrong-issuer"
              : cause.claim === "aud"
                ? "wrong-audience"
                : "invalid-token";
          return new GoogleIdentityError({
            reason,
            message: `ID token claim ${cause.claim} failed validation.`,
            cause,
          });
        }
        if (cause instanceof jose.errors.JOSEError) {
          return new GoogleIdentityError({
            reason: "invalid-token",
            message: cause.message,
            cause,
          });
        }
        return new GoogleIdentityError({
          reason: "unknown",
          message: "Google ID token verification failed.",
          cause,
        });
      },
    });

  return { verifyIdToken };
};

// Live layer. Reads `V3CODE_GOOGLE_CLIENT_ID` from the process environment.
// When unset, the service exists but every verify call fails fast with a
// "not-configured" error — this keeps the layer composable in
// environments that haven't enabled Google sign-in yet (Phase 1 bootstrap).
export const makeGoogleIdentityService = Effect.sync(() => {
  const clientId = process.env.V3CODE_GOOGLE_CLIENT_ID;
  if (clientId === undefined || clientId.length === 0) {
    const notConfigured: GoogleIdentityServiceShape = {
      verifyIdToken: () =>
        Effect.fail(
          new GoogleIdentityError({
            reason: "not-configured",
            message: "V3CODE_GOOGLE_CLIENT_ID is not set; Google sign-in is disabled.",
          }),
        ),
    };
    return notConfigured;
  }
  const jwks = jose.createRemoteJWKSet(GOOGLE_JWKS_URL);
  return makeGoogleIdentityServiceWith({ jwks, clientId });
});

export const GoogleIdentityServiceLive = Layer.effect(
  GoogleIdentityService,
  makeGoogleIdentityService,
);
