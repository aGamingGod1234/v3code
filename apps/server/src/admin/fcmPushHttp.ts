// V3 Phase 9 — admin routes for FCM service account management.
//
// Three endpoints backing the "Mobile Push" tab in the admin panel:
//
//   GET    /api/v3/admin/fcm-config        — status (configured? project_id?)
//   POST   /api/v3/admin/fcm-config        — upload service account JSON
//   DELETE /api/v3/admin/fcm-config        — clear config (disables FCM)
//
// Kept in a separate file from `admin/http.ts` to isolate the new
// write surface — `admin/http.ts` is an upstream-adjacent module with
// its own MESH_CHANGES entry, whereas this file is V3-owned additive
// code and has zero rebase risk.

import {
  type AdminFcmConfigStatus,
  AdminFcmConfigStatus as AdminFcmConfigStatusSchema,
  AdminFcmConfigUploadRequest,
  AdminFcmConfigUploadResult as AdminFcmConfigUploadResultSchema,
} from "@v3tools/contracts";
import { DateTime, Effect, Option, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { AuthError } from "../auth/Services/ServerAuth.ts";
import { ServerAuth } from "../auth/Services/ServerAuth.ts";
import { respondToAuthError } from "../auth/http.ts";
import { ServerConfig } from "../config.ts";
import { DeviceRepository } from "../identity/Services/DeviceRepository.ts";
import { UserContextResolver } from "../identity/Services/UserContextResolver.ts";
import {
  FcmPushConfigRepository,
  type FcmConfigStatusRow,
} from "../identity/Services/FcmPushConfigRepository.ts";
import { DevicePushTokenRepository } from "../identity/Services/DevicePushTokenRepository.ts";
import { parseServiceAccountJson } from "../identity/Layers/FcmPushConfigRepository.ts";

const ensureApprovedAdminAccess = Effect.gen(function* () {
  const config = yield* ServerConfig;
  if (config.mode !== "server-node") {
    return yield* new AuthError({
      message: "FCM config is only available in server-node mode.",
      status: 403,
    });
  }
  const request = yield* HttpServerRequest.HttpServerRequest;
  const serverAuth = yield* ServerAuth;
  const users = yield* UserContextResolver;
  const devices = yield* DeviceRepository;
  const session = yield* serverAuth.authenticateHttpRequest(request);
  const userContext = yield* users.resolve(session.sessionId).pipe(
    Effect.mapError(
      (cause) =>
        new AuthError({
          message: "Failed to resolve device context.",
          status: 500,
          cause,
        }),
    ),
  );
  if (Option.isNone(userContext)) {
    return yield* new AuthError({
      message: "This session is not linked to a V3 device.",
      status: 403,
    });
  }
  const currentDevice = yield* devices
    .get({ id: userContext.value.deviceId, userId: userContext.value.userId })
    .pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Failed to load current device.",
            status: 500,
            cause,
          }),
      ),
    );
  if (Option.isNone(currentDevice) || !currentDevice.value.approved) {
    return yield* new AuthError({
      message: "FCM config requires an approved V3 device.",
      status: 403,
    });
  }
  return userContext.value;
});

const toStatus = (row: FcmConfigStatusRow | null, tokenCount: number): AdminFcmConfigStatus => ({
  configured: row !== null,
  projectId: row?.projectId ?? null,
  clientEmail: row?.clientEmail ?? null,
  uploadedAt: row?.uploadedAt ?? null,
  tokenCount,
  lastDispatchAt: row?.lastDispatchAt ?? null,
  lastError: row?.lastError ?? null,
});

export const adminFcmConfigGetRouteLayer = HttpRouter.add(
  "GET",
  "/api/v3/admin/fcm-config",
  Effect.gen(function* () {
    const context = yield* ensureApprovedAdminAccess;
    const configRepo = yield* FcmPushConfigRepository;
    const pushTokens = yield* DevicePushTokenRepository;
    const statusOpt = yield* configRepo.getStatus().pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Failed to load FCM config status.",
            status: 500,
            cause,
          }),
      ),
    );
    const tokenCount = yield* pushTokens.countActiveForUser({ userId: context.userId }).pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Failed to count active push tokens.",
            status: 500,
            cause,
          }),
      ),
    );
    const status = toStatus(Option.getOrNull(statusOpt), tokenCount);
    return HttpServerResponse.jsonUnsafe(Schema.encodeSync(AdminFcmConfigStatusSchema)(status), {
      status: 200,
    });
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);

export const adminFcmConfigUploadRouteLayer = HttpRouter.add(
  "POST",
  "/api/v3/admin/fcm-config",
  Effect.gen(function* () {
    const context = yield* ensureApprovedAdminAccess;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const body = yield* request.json.pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "FCM config upload requires a JSON body.",
            status: 400,
            cause,
          }),
      ),
    );
    const decoded = yield* Schema.decodeUnknownEffect(AdminFcmConfigUploadRequest)(body).pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "FCM config upload body did not match the expected shape.",
            status: 400,
            cause,
          }),
      ),
    );
    const now = yield* DateTime.now;
    const parsed = parseServiceAccountJson(decoded.serviceAccountJson, now);
    if (parsed === null) {
      return yield* new AuthError({
        message:
          "Could not parse service account JSON. Expected a Firebase-generated key with `type`, `project_id`, `client_email`, and `private_key` fields.",
        status: 400,
      });
    }
    const configRepo = yield* FcmPushConfigRepository;
    const pushTokens = yield* DevicePushTokenRepository;
    const statusRow = yield* configRepo.upsert(parsed).pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Failed to persist FCM service account.",
            status: 500,
            cause,
          }),
      ),
    );
    const tokenCount = yield* pushTokens.countActiveForUser({ userId: context.userId }).pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Failed to count active push tokens after upload.",
            status: 500,
            cause,
          }),
      ),
    );
    return HttpServerResponse.jsonUnsafe(
      Schema.encodeSync(AdminFcmConfigUploadResultSchema)({
        status: toStatus(statusRow, tokenCount),
      }),
      { status: 200 },
    );
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);

export const adminFcmConfigDeleteRouteLayer = HttpRouter.add(
  "DELETE",
  "/api/v3/admin/fcm-config",
  Effect.gen(function* () {
    yield* ensureApprovedAdminAccess;
    const configRepo = yield* FcmPushConfigRepository;
    const removed = yield* configRepo.clear().pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Failed to clear FCM service account.",
            status: 500,
            cause,
          }),
      ),
    );
    return HttpServerResponse.jsonUnsafe(
      {
        cleared: removed,
      },
      { status: 200 },
    );
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);
