// V3 Phase 2g — Admin panel HTTP routes.
//
// Five read-only endpoints that back `/admin/*` in the web UI. Every
// route requires:
//
//   1. An authenticated V3 session (via `resolveV3RequestContext`
//      in identity/http.ts — reused through the UserContextResolver
//      service).
//   2. `mode === "server-node"`. In desktop / web modes the routes
//      respond with 404 so the admin UI can detect "no admin here"
//      without changing its fetch code per-environment.
//   3. The calling device is **approved**. A pending device can still
//      hit `/api/v3/devices/approve` but must not see global runtime
//      state.

import type {
  AdminActiveSession,
  AdminActiveSessionsResponse,
  AdminContainersResponse,
  AdminEventLogResponse,
  AdminEventLogRow,
  AdminLogsResponse,
  AdminServerInfo,
  AdminSummaryResponse,
} from "@v3tools/contracts";
import {
  AdminActiveSessionsResponse as AdminActiveSessionsResponseSchema,
  AdminContainersResponse as AdminContainersResponseSchema,
  AdminEventLogResponse as AdminEventLogResponseSchema,
  AdminLogsResponse as AdminLogsResponseSchema,
  AdminSummaryResponse as AdminSummaryResponseSchema,
} from "@v3tools/contracts";
import { AuthSessionId } from "@v3tools/contracts";

import { DateTime, Effect, Option, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import * as FileSystem from "effect/FileSystem";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";

import packageJson from "../../package.json" with { type: "json" };
import { AuthError } from "../auth/Services/ServerAuth.ts";
import { respondToAuthError } from "../auth/http.ts";
import { SessionCredentialService } from "../auth/Services/SessionCredentialService.ts";
import { ServerConfig } from "../config.ts";
import { DeviceRepository } from "../identity/Services/DeviceRepository.ts";
import { DeviceSessionRepository } from "../identity/Services/DeviceSessionRepository.ts";
import { UserContextResolver } from "../identity/Services/UserContextResolver.ts";
import { UserRepository } from "../identity/Services/UserRepository.ts";
import { ServerAuth } from "../auth/Services/ServerAuth.ts";
import { HttpServerRequest } from "effect/unstable/http";

const SERVER_START_MILLIS = Date.now();

const ensureServerNodeAdminAccess = Effect.gen(function* () {
  const config = yield* ServerConfig;
  if (config.mode !== "server-node") {
    return yield* new AuthError({
      message: "Admin routes are only available in server-node mode.",
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
      message: "Admin routes require an approved V3 device.",
      status: 403,
    });
  }
  return {
    userId: userContext.value.userId,
    deviceId: userContext.value.deviceId,
    config,
  } as const;
});

const toDateTimeOrNull = (input: string | null): DateTime.DateTime | null => {
  if (input === null || input.length === 0) return null;
  try {
    return DateTime.makeUnsafe(input);
  } catch {
    return null;
  }
};

const toDateTimeUtcOrNull = (input: string | null): DateTime.Utc | null => {
  const parsed = toDateTimeOrNull(input);
  return parsed === null ? null : DateTime.toUtc(parsed);
};

// Narrower version of `ensureServerNodeAdminAccess` used by the sessions
// route to look up device rows (which key on userId + deviceId). Skips
// the mode + approval guards because the caller already passed them.
const resolveAdminCurrentUser = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const serverAuth = yield* ServerAuth;
  const users = yield* UserContextResolver;
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
  return userContext.value;
});

const buildServerInfo: Effect.Effect<AdminServerInfo, never, ServerConfig> = Effect.gen(
  function* () {
    const config = yield* ServerConfig;
    const nowMs = yield* DateTime.now.pipe(Effect.map((value) => DateTime.toEpochMillis(value)));
    const startedAt = DateTime.makeUnsafe(new Date(SERVER_START_MILLIS).toISOString());
    return {
      version: packageJson.version as AdminServerInfo["version"],
      mode: config.mode,
      postgresConnected: typeof config.postgresUrl === "string" && config.postgresUrl.length > 0,
      dockerAvailable: false, // P8 flips this once ContainerManager lands.
      googleConfigured:
        typeof config.googleClientId === "string" && config.googleClientId.length > 0,
      githubConfigured:
        typeof config.githubClientId === "string" &&
        config.githubClientId.length > 0 &&
        typeof config.githubClientSecret === "string" &&
        config.githubClientSecret.length > 0,
      publicUrl: config.serverPublicUrl ?? null,
      uptimeSeconds: Math.floor((nowMs - SERVER_START_MILLIS) / 1000),
      startedAt: DateTime.toUtc(startedAt),
    } satisfies AdminServerInfo;
  },
);

const collectEventLogStats = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rowsExecutor = SqlSchema.findAll({
    Request: Schema.Void,
    Result: Schema.Struct({
      chatId: Schema.NullOr(Schema.String),
      title: Schema.NullOr(Schema.String),
      projectId: Schema.NullOr(Schema.String),
      hostDeviceId: Schema.NullOr(Schema.String),
      eventCount: Schema.Int,
      sizeBytes: Schema.Int,
      lastEventAt: Schema.NullOr(Schema.String),
    }),
    execute: () => sql`
      SELECT
        oe.stream_id AS "chatId",
        pt.title AS "title",
        pt.project_id AS "projectId",
        pt.host_device_id AS "hostDeviceId",
        COUNT(*) AS "eventCount",
        COALESCE(SUM(LENGTH(oe.payload)), 0) AS "sizeBytes",
        MAX(oe.recorded_at) AS "lastEventAt"
      FROM orchestration_events oe
      LEFT JOIN projection_threads pt ON pt.thread_id = oe.stream_id
      WHERE oe.aggregate_kind = 'thread'
      GROUP BY oe.stream_id, pt.title, pt.project_id, pt.host_device_id
      ORDER BY "eventCount" DESC
      LIMIT 500
    `,
  });
  const rowsRaw = yield* rowsExecutor(undefined);
  const rows = rowsRaw
    .filter((row): row is typeof row & { readonly chatId: string } => row.chatId !== null)
    .map(
      (row): AdminEventLogRow => ({
        chatId: row.chatId as AdminEventLogRow["chatId"],
        title: row.title,
        projectId: row.projectId === null ? null : (row.projectId as AdminEventLogRow["projectId"]),
        hostDeviceId:
          row.hostDeviceId === null ? null : (row.hostDeviceId as AdminEventLogRow["hostDeviceId"]),
        eventCount: row.eventCount,
        sizeBytes: row.sizeBytes,
        lastEventAt: row.lastEventAt === null ? null : toDateTimeUtcOrNull(row.lastEventAt),
      }),
    );
  const totalEventCount = rows.reduce((acc, entry) => acc + entry.eventCount, 0);
  const totalSizeBytes = rows.reduce((acc, entry) => acc + entry.sizeBytes, 0);
  return { rows, totalEventCount, totalSizeBytes };
});

export const adminSummaryRouteLayer = HttpRouter.add(
  "GET",
  "/api/v3/admin/summary",
  Effect.gen(function* () {
    yield* ensureServerNodeAdminAccess;
    const server = yield* buildServerInfo;
    const sessions = yield* SessionCredentialService;
    const active = yield* sessions.listActive().pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Failed to list active sessions.",
            status: 500,
            cause,
          }),
      ),
    );
    const eventStats = yield* collectEventLogStats.pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Failed to collect event-log stats.",
            status: 500,
            cause,
          }),
      ),
    );
    const body: AdminSummaryResponse = {
      server,
      activeSessionCount: active.filter((session) => session.connected).length,
      chatCount: eventStats.rows.length,
      totalEventCount: eventStats.totalEventCount,
      totalEventBytes: eventStats.totalSizeBytes,
      activeContainerCount: 0,
    };
    return HttpServerResponse.jsonUnsafe(Schema.encodeSync(AdminSummaryResponseSchema)(body), {
      status: 200,
    });
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);

export const adminSessionsRouteLayer = HttpRouter.add(
  "GET",
  "/api/v3/admin/sessions",
  Effect.gen(function* () {
    yield* ensureServerNodeAdminAccess;
    const sessions = yield* SessionCredentialService;
    const deviceSessions = yield* DeviceSessionRepository;
    const devices = yield* DeviceRepository;
    const users = yield* UserRepository;

    const active = yield* sessions.listActive().pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Failed to list active sessions.",
            status: 500,
            cause,
          }),
      ),
    );

    const rows: AdminActiveSession[] = [];
    for (const session of active) {
      const linkOpt = yield* deviceSessions
        .getBySessionId({ sessionId: AuthSessionId.make(session.sessionId) })
        .pipe(
          Effect.mapError(
            (cause) =>
              new AuthError({
                message: "Failed to resolve session link.",
                status: 500,
                cause,
              }),
          ),
        );
      let deviceId: AdminActiveSession["deviceId"] = null;
      let deviceName: AdminActiveSession["deviceName"] = null;
      let devicePlatform: AdminActiveSession["devicePlatform"] = null;
      let deviceKind: AdminActiveSession["deviceKind"] = null;
      let userEmail: AdminActiveSession["userEmail"] = null;
      if (Option.isSome(linkOpt)) {
        deviceId = linkOpt.value.deviceId;
        // `DeviceRepository.get` keys by `{ id, userId }`. When looking
        // up a session, we don't know the userId yet, so iterate the
        // user's devices via `listForUser` would be overkill for a
        // single-row read. Instead, walk through the currently-
        // authenticated user's devices as a hint; the first row that
        // matches wins. Good enough for V1 where each server node
        // hosts one user.
        const context = yield* resolveAdminCurrentUser;
        const deviceOpt = yield* devices
          .get({ id: linkOpt.value.deviceId, userId: context.userId })
          .pipe(
            Effect.mapError(
              (cause) =>
                new AuthError({
                  message: "Failed to load device for session.",
                  status: 500,
                  cause,
                }),
            ),
          );
        if (Option.isSome(deviceOpt)) {
          deviceName = deviceOpt.value.name;
          devicePlatform = deviceOpt.value.platform;
          deviceKind = deviceOpt.value.kind;
          const userOpt = yield* users.getById({ id: deviceOpt.value.userId }).pipe(
            Effect.mapError(
              (cause) =>
                new AuthError({
                  message: "Failed to load user for session.",
                  status: 500,
                  cause,
                }),
            ),
          );
          if (Option.isSome(userOpt)) {
            userEmail = userOpt.value.email;
          }
        }
      }
      const lastConnectedIso = DateTime.isDateTime(session.lastConnectedAt)
        ? DateTime.formatIso(session.lastConnectedAt)
        : null;
      rows.push({
        sessionId: session.sessionId as AdminActiveSession["sessionId"],
        deviceId,
        deviceName,
        devicePlatform,
        deviceKind,
        userEmail,
        connected: session.connected,
        lastHeartbeatAt: toDateTimeUtcOrNull(lastConnectedIso),
        connectedAt: toDateTimeUtcOrNull(lastConnectedIso),
      });
    }

    const body: AdminActiveSessionsResponse = { sessions: rows };
    return HttpServerResponse.jsonUnsafe(
      Schema.encodeSync(AdminActiveSessionsResponseSchema)(body),
      { status: 200 },
    );
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);

export const adminEventLogRouteLayer = HttpRouter.add(
  "GET",
  "/api/v3/admin/event-log",
  Effect.gen(function* () {
    yield* ensureServerNodeAdminAccess;
    const stats = yield* collectEventLogStats.pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Failed to collect event-log stats.",
            status: 500,
            cause,
          }),
      ),
    );
    const body: AdminEventLogResponse = {
      chats: stats.rows,
      totalEventCount: stats.totalEventCount,
      totalSizeBytes: stats.totalSizeBytes,
    };
    return HttpServerResponse.jsonUnsafe(Schema.encodeSync(AdminEventLogResponseSchema)(body), {
      status: 200,
    });
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);

const DEFAULT_LOG_TAIL_LINES = 200;
const MAX_LOG_TAIL_LINES = 2000;

export const adminLogsRouteLayer = HttpRouter.add(
  "GET",
  "/api/v3/admin/logs",
  Effect.gen(function* () {
    const { config } = yield* ensureServerNodeAdminAccess;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const urlOpt = HttpServerRequest.toURL(request);
    const rawTail = Option.isSome(urlOpt) ? urlOpt.value.searchParams.get("tail") : null;
    const parsed = rawTail !== null ? Number.parseInt(rawTail, 10) : DEFAULT_LOG_TAIL_LINES;
    const tailLines = Number.isFinite(parsed)
      ? Math.min(Math.max(1, parsed), MAX_LOG_TAIL_LINES)
      : DEFAULT_LOG_TAIL_LINES;
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(config.serverLogPath).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      const body: AdminLogsResponse = {
        lines: [],
        filePath: config.serverLogPath as AdminLogsResponse["filePath"],
        tailLines,
      };
      return HttpServerResponse.jsonUnsafe(Schema.encodeSync(AdminLogsResponseSchema)(body), {
        status: 200,
      });
    }
    const raw = yield* fs.readFileString(config.serverLogPath).pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Failed to read server log file.",
            status: 500,
            cause,
          }),
      ),
    );
    const allLines = raw.split(/\r?\n/);
    const lines = allLines.slice(Math.max(0, allLines.length - tailLines));
    const body: AdminLogsResponse = {
      lines,
      filePath: config.serverLogPath as AdminLogsResponse["filePath"],
      tailLines,
    };
    return HttpServerResponse.jsonUnsafe(Schema.encodeSync(AdminLogsResponseSchema)(body), {
      status: 200,
    });
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);

export const adminContainersRouteLayer = HttpRouter.add(
  "GET",
  "/api/v3/admin/containers",
  Effect.gen(function* () {
    yield* ensureServerNodeAdminAccess;
    // P8 Cloud env hasn't shipped — always reply with an empty list so
    // the admin UI can render a "no containers yet" state without
    // additional client branching.
    const body: AdminContainersResponse = {
      containers: [],
      dockerAvailable: false,
    };
    return HttpServerResponse.jsonUnsafe(Schema.encodeSync(AdminContainersResponseSchema)(body), {
      status: 200,
    });
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);
