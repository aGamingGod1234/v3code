import {
  AuthSessionId,
  DeviceInfo,
  GoogleBootstrapInput,
  GoogleBootstrapResult,
  UserId,
  UserInfo,
  type VerifiedGoogleIdentity,
} from "@v3tools/contracts";
import * as Crypto from "node:crypto";

import { DateTime, Effect, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { deriveAuthClientMetadata } from "../auth/utils.ts";
import { AuthError } from "../auth/Services/ServerAuth.ts";
import { SessionCredentialService } from "../auth/Services/SessionCredentialService.ts";
import { ServerConfig } from "../config.ts";
import { DeviceApprovalService } from "./Services/DeviceApprovalService.ts";
import { DeviceSessionRepository } from "./Services/DeviceSessionRepository.ts";
import { GoogleIdentityError } from "./Errors.ts";
import { GoogleIdentityService } from "./Services/GoogleIdentityService.ts";
import { UserRepository } from "./Services/UserRepository.ts";

// --- helpers ---------------------------------------------------------------

const googleErrorToAuthError = (error: GoogleIdentityError): AuthError => {
  const status: 400 | 401 | 403 | 500 =
    error.reason === "not-configured" ? 500 : error.reason === "email-not-verified" ? 403 : 401;
  return new AuthError({
    message: error.message,
    status,
    cause: error,
  });
};

const isEmailAuthorized = (verified: VerifiedGoogleIdentity, allowlist: ReadonlyArray<string>) => {
  if (allowlist.length === 0) return false;
  const normalized = verified.email.trim().toLowerCase();
  return allowlist.includes(normalized);
};

const toUserInfo = (user: {
  readonly id: UserId;
  readonly googleSub: string & { readonly [Symbol.species]?: never };
  readonly email: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly githubUsername: string | null;
  readonly createdAt: DateTime.DateTime;
}): UserInfo => ({
  id: user.id,
  // googleSub is branded GoogleSub but we already read it typed from the repo
  // so we just cast it back through the Schema.make for cleanliness.
  googleSub: user.googleSub as UserInfo["googleSub"],
  email: user.email as UserInfo["email"],
  displayName: user.displayName,
  avatarUrl: user.avatarUrl,
  githubUsername: user.githubUsername,
  createdAt: DateTime.toUtc(user.createdAt),
});

const toDeviceInfoForResult = (device: DeviceInfo): DeviceInfo => device;

// --- route -----------------------------------------------------------------

// POST /api/auth/google/bootstrap
//
// Body: GoogleBootstrapInput (id_token, device_id, name, platform, kind,
//       capabilities, app_version)
//
// 1. Verify ID token → VerifiedGoogleIdentity
// 2. Enforce `authorizedEmails` allowlist
// 3. Upsert user
// 4. Register + approve/queue device
// 5. Issue V3 session (browser-session-cookie) via SessionCredentialService
// 6. Link session→device in v3_device_sessions
// 7. Return { user, device, needsApproval } + Set-Cookie

export const googleBootstrapRouteLayer = HttpRouter.add(
  "POST",
  "/api/auth/google/bootstrap",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const config = yield* ServerConfig;
    const google = yield* GoogleIdentityService;
    const users = yield* UserRepository;
    const approvals = yield* DeviceApprovalService;
    const deviceSessions = yield* DeviceSessionRepository;
    const sessions = yield* SessionCredentialService;

    const payload = yield* HttpServerRequest.schemaBodyJson(GoogleBootstrapInput).pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Invalid Google bootstrap payload.",
            status: 400,
            cause,
          }),
      ),
    );

    // 1. Verify ID token
    const verified = yield* google
      .verifyIdToken(payload.idToken)
      .pipe(Effect.mapError(googleErrorToAuthError));

    // 2. Email allowlist
    if (!isEmailAuthorized(verified, config.authorizedEmails)) {
      return yield* new AuthError({
        message: `This server node is not configured to accept sign-in from ${verified.email}.`,
        status: 403,
      });
    }

    const now = yield* DateTime.now;

    // 3. Upsert user (Google sub is the stable key; deterministic UserId per sub)
    const userId = UserId.make(
      Crypto.createHash("sha256")
        .update(`v3-user:${verified.googleSub}`)
        .digest("hex")
        .slice(0, 32),
    );
    const userRecord = yield* users
      .upsertFromGoogle({
        id: userId,
        googleSub: verified.googleSub,
        email: verified.email,
        displayName: verified.displayName,
        avatarUrl: verified.avatarUrl,
        now,
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new AuthError({
              message: "Failed to persist Google-authenticated user.",
              status: 500,
              cause,
            }),
        ),
      );

    // 4. Register + approval decision
    const approvalResult = yield* approvals
      .registerOrResume({
        userId,
        deviceId: payload.deviceId,
        deviceName: payload.deviceName,
        platform: payload.platform,
        kind: payload.kind,
        capabilities: payload.capabilities,
        now,
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new AuthError({
              message: "Failed to register device.",
              status: 500,
              cause,
            }),
        ),
      );

    // 5. Issue session credential
    const clientMetadata = deriveAuthClientMetadata({ request, label: payload.deviceName });
    const issued = yield* sessions
      .issue({
        method: "browser-session-cookie",
        subject: verified.googleSub,
        role: "owner",
        client: clientMetadata,
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new AuthError({
              message: "Failed to issue session.",
              status: 500,
              cause,
            }),
        ),
      );

    // 6. Link session ↔ device
    yield* deviceSessions
      .link({
        sessionId: AuthSessionId.make(issued.sessionId),
        deviceId: payload.deviceId,
        now,
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new AuthError({
              message: "Failed to link session to device.",
              status: 500,
              cause,
            }),
        ),
      );

    // 7. Response
    const body: GoogleBootstrapResult = {
      user: toUserInfo(userRecord),
      device: toDeviceInfoForResult(approvalResult.device),
      needsApproval: approvalResult.needsApproval,
    };
    const encoded = Schema.encodeSync(GoogleBootstrapResult)(body);
    return yield* HttpServerResponse.jsonUnsafe(encoded, { status: 200 }).pipe(
      HttpServerResponse.setCookie(sessions.cookieName, issued.token, {
        expires: DateTime.toDate(issued.expiresAt),
        httpOnly: true,
        path: "/",
        sameSite: "lax",
      }),
    );
  }).pipe(
    Effect.catchTag("AuthError", (error) =>
      Effect.gen(function* () {
        if ((error.status ?? 500) >= 500) {
          yield* Effect.logError("google bootstrap route failed", {
            message: error.message,
            cause: error.cause,
          });
        }
        return HttpServerResponse.jsonUnsafe(
          { error: error.message },
          { status: error.status ?? 500 },
        );
      }),
    ),
  ),
);
