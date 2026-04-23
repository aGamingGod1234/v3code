// V3 Phase 2g — Admin panel contracts.
//
// These types back the `/admin/*` routes on the V3 web app and the
// `/api/v3/admin/*` HTTP endpoints on the server. Everything is
// read-only in P2g; the server mutations (kill container, rotate
// secrets, backup) land in later sub-phases as P2g+.

import { Schema } from "effect";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

// Server info surface — mode, runtime version, Postgres connection
// status, feature availability. Consumed by the `/admin` dashboard
// card at the top of every sub-route.
export const AdminServerInfo = Schema.Struct({
  version: TrimmedNonEmptyString,
  mode: Schema.Literals(["web", "desktop", "server-node"]),
  postgresConnected: Schema.Boolean,
  dockerAvailable: Schema.Boolean,
  googleConfigured: Schema.Boolean,
  githubConfigured: Schema.Boolean,
  publicUrl: Schema.NullOr(Schema.String),
  uptimeSeconds: Schema.Int,
  startedAt: Schema.DateTimeUtcFromString,
});
export type AdminServerInfo = typeof AdminServerInfo.Type;

// One row per active WebSocket session. Populated from
// SessionCredentialService.listActive() + joined to v3_devices.
export const AdminActiveSession = Schema.Struct({
  sessionId: TrimmedNonEmptyString,
  deviceId: Schema.NullOr(TrimmedNonEmptyString),
  deviceName: Schema.NullOr(Schema.String),
  devicePlatform: Schema.NullOr(Schema.String),
  deviceKind: Schema.NullOr(Schema.String),
  userEmail: Schema.NullOr(Schema.String),
  connected: Schema.Boolean,
  lastHeartbeatAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  connectedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
});
export type AdminActiveSession = typeof AdminActiveSession.Type;

export const AdminActiveSessionsResponse = Schema.Struct({
  sessions: Schema.Array(AdminActiveSession),
});
export type AdminActiveSessionsResponse = typeof AdminActiveSessionsResponse.Type;

// One row per chat. `eventCount` is orchestration_events rows for that
// stream; `sizeBytes` is an estimate (SUM(length(payload)) in SQLite,
// pg_column_size in Postgres).
export const AdminEventLogRow = Schema.Struct({
  chatId: TrimmedNonEmptyString,
  title: Schema.NullOr(Schema.String),
  projectId: Schema.NullOr(TrimmedNonEmptyString),
  hostDeviceId: Schema.NullOr(TrimmedNonEmptyString),
  eventCount: Schema.Int,
  sizeBytes: Schema.Int,
  lastEventAt: Schema.NullOr(Schema.DateTimeUtcFromString),
});
export type AdminEventLogRow = typeof AdminEventLogRow.Type;

export const AdminEventLogResponse = Schema.Struct({
  chats: Schema.Array(AdminEventLogRow),
  totalEventCount: Schema.Int,
  totalSizeBytes: Schema.Int,
});
export type AdminEventLogResponse = typeof AdminEventLogResponse.Type;

// Server logs tail. `lines` are the most recent N lines of the
// server log file, oldest-first.
export const AdminLogsResponse = Schema.Struct({
  lines: Schema.Array(Schema.String),
  filePath: TrimmedNonEmptyString,
  tailLines: Schema.Int,
});
export type AdminLogsResponse = typeof AdminLogsResponse.Type;

// Placeholder for P8 Cloud env containers. Ships as an empty array in
// P2g so the /admin/containers route renders cleanly before P8 lands.
export const AdminContainerInfo = Schema.Struct({
  chatId: TrimmedNonEmptyString,
  containerId: TrimmedNonEmptyString,
  status: Schema.Literals(["starting", "running", "stopping", "dead"]),
  cpuCount: Schema.Int,
  memoryMb: Schema.Int,
  startedAt: Schema.DateTimeUtcFromString,
  uptimeSeconds: Schema.Int,
});
export type AdminContainerInfo = typeof AdminContainerInfo.Type;

export const AdminContainersResponse = Schema.Struct({
  containers: Schema.Array(AdminContainerInfo),
  dockerAvailable: Schema.Boolean,
});
export type AdminContainersResponse = typeof AdminContainersResponse.Type;

// Top-level admin summary response used by /admin/index.
export const AdminSummaryResponse = Schema.Struct({
  server: AdminServerInfo,
  activeSessionCount: Schema.Int,
  chatCount: Schema.Int,
  totalEventCount: Schema.Int,
  totalEventBytes: Schema.Int,
  activeContainerCount: Schema.Int,
});
export type AdminSummaryResponse = typeof AdminSummaryResponse.Type;

// V3 Phase 9 — mobile push (FCM) admin config surface.
//
// The FCM service account JSON is never returned to the admin UI —
// we only surface the *status* (configured or not, project id,
// upload timestamp) so the operator can see at a glance whether
// mobile pushes will fire.
//
// `projectId` and `clientEmail` are echoed back because they're
// already embedded in the Play Console / Firebase Console view; the
// private_key is the actual secret and stays server-side.
export const AdminFcmConfigStatus = Schema.Struct({
  configured: Schema.Boolean,
  projectId: Schema.NullOr(TrimmedNonEmptyString),
  clientEmail: Schema.NullOr(TrimmedNonEmptyString),
  uploadedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  tokenCount: Schema.Int,
  lastDispatchAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  lastError: Schema.NullOr(Schema.String),
});
export type AdminFcmConfigStatus = typeof AdminFcmConfigStatus.Type;

export const AdminFcmConfigUploadRequest = Schema.Struct({
  // Full JSON blob exactly as Firebase generates it; the server
  // validates shape before storing.
  serviceAccountJson: TrimmedNonEmptyString,
});
export type AdminFcmConfigUploadRequest = typeof AdminFcmConfigUploadRequest.Type;

export const AdminFcmConfigUploadResult = Schema.Struct({
  status: AdminFcmConfigStatus,
});
export type AdminFcmConfigUploadResult = typeof AdminFcmConfigUploadResult.Type;
