import {
  AuthSessionId,
  DeviceInfo,
  GoogleBootstrapInput,
  GoogleBootstrapResult,
  GoogleClientPublicConfig,
  V3ApproveDeviceInput,
  V3ApproveDeviceResult,
  V3DeviceListResult,
  V3RemoveDeviceInput,
  V3RemoveDeviceResult,
  UserId,
  UserInfo,
  type VerifiedGoogleIdentity,
} from "@v3tools/contracts";
import * as Crypto from "node:crypto";

import { DateTime, Effect, Option, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { deriveAuthClientMetadata } from "../auth/utils.ts";
import { AuthError, ServerAuth } from "../auth/Services/ServerAuth.ts";
import { respondToAuthError } from "../auth/http.ts";
import { SessionCredentialService } from "../auth/Services/SessionCredentialService.ts";
import { ServerConfig } from "../config.ts";
import { DeviceApprovalService } from "./Services/DeviceApprovalService.ts";
import { DeviceRepository } from "./Services/DeviceRepository.ts";
import { DeviceSessionRepository } from "./Services/DeviceSessionRepository.ts";
import { GoogleIdentityError } from "./Errors.ts";
import { GoogleIdentityService } from "./Services/GoogleIdentityService.ts";
import { UserContextResolver } from "./Services/UserContextResolver.ts";
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

const toDeviceInfo = (device: {
  readonly id: DeviceInfo["id"];
  readonly userId: DeviceInfo["userId"];
  readonly name: DeviceInfo["name"];
  readonly platform: DeviceInfo["platform"];
  readonly kind: DeviceInfo["kind"];
  readonly capabilities: DeviceInfo["capabilities"];
  readonly approved: boolean;
  readonly firstSeenAt: DeviceInfo["firstSeenAt"];
  readonly lastSeenAt: DeviceInfo["lastSeenAt"];
  readonly online?: boolean;
}): DeviceInfo => ({
  id: device.id,
  userId: device.userId,
  name: device.name,
  platform: device.platform,
  kind: device.kind,
  capabilities: device.capabilities,
  approved: device.approved,
  online: device.online ?? false,
  firstSeenAt: device.firstSeenAt,
  lastSeenAt: device.lastSeenAt,
});

const toInternalAuthError =
  (message: string) =>
  (cause: unknown): AuthError =>
    new AuthError({
      message,
      status: 500,
      cause,
    });

const resolveV3RequestContext = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const serverAuth = yield* ServerAuth;
  const users = yield* UserContextResolver;
  const devices = yield* DeviceRepository;

  const session = yield* serverAuth.authenticateHttpRequest(request);
  const userContext = yield* users
    .resolve(session.sessionId)
    .pipe(
      Effect.mapError(
        toInternalAuthError("Failed to resolve the V3 device context for this session."),
      ),
    );

  if (Option.isNone(userContext)) {
    return yield* new AuthError({
      message: "This session is not linked to a V3 device.",
      status: 403,
    });
  }

  const currentDevice = yield* devices
    .get({
      id: userContext.value.deviceId,
      userId: userContext.value.userId,
    })
    .pipe(Effect.mapError(toInternalAuthError("Failed to load the current V3 device.")));

  if (Option.isNone(currentDevice)) {
    return yield* new AuthError({
      message: "This V3 device is no longer registered on the server node.",
      status: 403,
    });
  }

  return {
    currentDevice: currentDevice.value,
    session,
    userId: userContext.value.userId,
  } as const;
});

const requireApprovedDeviceContext = Effect.gen(function* () {
  const context = yield* resolveV3RequestContext;
  if (!context.currentDevice.approved) {
    return yield* new AuthError({
      message: "Approve this device from another signed-in device before managing devices.",
      status: 403,
    });
  }
  return context;
});

const resolveOnlineDeviceIds = Effect.fn(function* (currentDeviceId: DeviceInfo["id"]) {
  const sessions = yield* SessionCredentialService;
  const deviceSessions = yield* DeviceSessionRepository;

  const activeSessions = yield* sessions
    .listActive()
    .pipe(Effect.mapError(toInternalAuthError("Failed to load active V3 sessions.")));
  const connectedSessions = activeSessions.filter((session) => session.connected);
  const links = yield* Effect.forEach(
    connectedSessions,
    (session) =>
      deviceSessions
        .getBySessionId({ sessionId: AuthSessionId.make(session.sessionId) })
        .pipe(
          Effect.mapError(toInternalAuthError("Failed to resolve active sessions to V3 devices.")),
        ),
    { concurrency: "unbounded" },
  );

  const deviceIds = new Set<DeviceInfo["id"]>([currentDeviceId]);
  for (const link of links) {
    if (Option.isSome(link)) {
      deviceIds.add(link.value.deviceId);
    }
  }
  return deviceIds;
});

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

// GET /api/auth/google/config
//
// Public, unauthenticated. Returns the OAuth Client ID the operator has
// configured for V3, or `{ available: false, clientId: null }` if Google
// sign-in is not enabled on this server. Renderers call this on boot to
// decide whether to show the V3 sign-in affordance and to build the OAuth
// authorization URL. The Client ID is intentionally not a secret — installed
// apps authenticate to Google with PKCE rather than a client secret.
export const googleConfigRouteLayer = HttpRouter.add(
  "GET",
  "/api/auth/google/config",
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const available = typeof config.googleClientId === "string" && config.googleClientId.length > 0;
    const body: GoogleClientPublicConfig = {
      available,
      clientId: available ? (config.googleClientId as GoogleClientPublicConfig["clientId"]) : null,
    };
    const encoded = Schema.encodeSync(GoogleClientPublicConfig)(body);
    return HttpServerResponse.jsonUnsafe(encoded, { status: 200 });
  }),
);

export const listDevicesRouteLayer = HttpRouter.add(
  "GET",
  "/api/v3/devices",
  Effect.gen(function* () {
    const devices = yield* DeviceRepository;
    const { currentDevice, userId } = yield* resolveV3RequestContext;
    const records = yield* devices
      .listForUser({ userId })
      .pipe(Effect.mapError(toInternalAuthError("Failed to list V3 devices.")));
    const onlineDeviceIds = yield* resolveOnlineDeviceIds(currentDevice.id);

    const body: V3DeviceListResult = {
      currentDeviceId: currentDevice.id,
      devices: records.map((record) =>
        toDeviceInfo({
          id: record.id,
          userId: record.userId,
          name: record.name,
          platform: record.platform,
          kind: record.kind,
          capabilities: record.capabilities,
          approved: record.approved,
          firstSeenAt: record.firstSeenAt,
          lastSeenAt: record.lastSeenAt,
          online: onlineDeviceIds.has(record.id),
        }),
      ),
    };
    return HttpServerResponse.jsonUnsafe(Schema.encodeSync(V3DeviceListResult)(body), {
      status: 200,
    });
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);

export const approveDeviceRouteLayer = HttpRouter.add(
  "POST",
  "/api/v3/devices/approve",
  Effect.gen(function* () {
    const approvals = yield* DeviceApprovalService;
    const { userId } = yield* requireApprovedDeviceContext;
    const payload = yield* HttpServerRequest.schemaBodyJson(V3ApproveDeviceInput).pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Invalid approve-device payload.",
            status: 400,
            cause,
          }),
      ),
    );

    const approved = yield* approvals
      .approve({
        userId,
        deviceId: payload.deviceId,
      })
      .pipe(Effect.mapError(toInternalAuthError("Failed to approve the V3 device.")));

    const body: V3ApproveDeviceResult = { approved };
    return HttpServerResponse.jsonUnsafe(Schema.encodeSync(V3ApproveDeviceResult)(body), {
      status: 200,
    });
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);

export const removeDeviceRouteLayer = HttpRouter.add(
  "POST",
  "/api/v3/devices/remove",
  Effect.gen(function* () {
    const approvals = yield* DeviceApprovalService;
    const { currentDevice, userId } = yield* requireApprovedDeviceContext;
    const payload = yield* HttpServerRequest.schemaBodyJson(V3RemoveDeviceInput).pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Invalid remove-device payload.",
            status: 400,
            cause,
          }),
      ),
    );

    if (payload.deviceId === currentDevice.id) {
      return yield* new AuthError({
        message: "Use another approved device to remove this device.",
        status: 400,
      });
    }

    const removed = yield* DateTime.now.pipe(
      Effect.flatMap((now) =>
        approvals.remove({
          userId,
          deviceId: payload.deviceId,
          now,
        }),
      ),
      Effect.mapError(toInternalAuthError("Failed to remove the V3 device.")),
    );

    const body: V3RemoveDeviceResult = { removed };
    return HttpServerResponse.jsonUnsafe(Schema.encodeSync(V3RemoveDeviceResult)(body), {
      status: 200,
    });
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);
