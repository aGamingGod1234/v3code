// V3 identity contracts.
//
// Types for Google sign-in, users, and mesh-connected devices. Deliberately
// additive to the existing auth contracts — the pre-V3 pairing/session layer
// in ./auth.ts is unchanged.

import { Schema } from "effect";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

// ---------------------------------------------------------------------------
// Branded ids
// ---------------------------------------------------------------------------

export const GoogleSub = TrimmedNonEmptyString.pipe(Schema.brand("GoogleSub"));
export type GoogleSub = typeof GoogleSub.Type;

export const UserId = TrimmedNonEmptyString.pipe(Schema.brand("UserId"));
export type UserId = typeof UserId.Type;

export const DeviceId = TrimmedNonEmptyString.pipe(Schema.brand("DeviceId"));
export type DeviceId = typeof DeviceId.Type;

export const CLOUD_DEVICE_ID = "cloud";
export const CLOUD_DEVICE_NAME = "Cloud";

export const makeCloudDeviceId = (): DeviceId => DeviceId.make(CLOUD_DEVICE_ID);

// ---------------------------------------------------------------------------
// Platform / kind / capability enums (spec §15)
// ---------------------------------------------------------------------------

export const DevicePlatform = Schema.Literals([
  "windows",
  "macos",
  "linux",
  "android",
  "ios",
  "web",
]);
export type DevicePlatform = typeof DevicePlatform.Type;

export const DeviceKind = Schema.Literals([
  "desktop",
  "laptop",
  "server",
  "phone",
  "tablet",
  "browser",
  "cloud",
]);
export type DeviceKind = typeof DeviceKind.Type;

export const DeviceCapability = Schema.Literals([
  "execute",
  "claude_code",
  "codex",
  "browser_use",
  "terminal",
  "view_only",
]);
export type DeviceCapability = typeof DeviceCapability.Type;

// ---------------------------------------------------------------------------
// User info
// ---------------------------------------------------------------------------

export const UserInfo = Schema.Struct({
  id: UserId,
  googleSub: GoogleSub,
  email: TrimmedNonEmptyString,
  displayName: Schema.NullOr(Schema.String),
  avatarUrl: Schema.NullOr(Schema.String),
  githubUsername: Schema.NullOr(Schema.String),
  createdAt: Schema.DateTimeUtc,
});
export type UserInfo = typeof UserInfo.Type;

// ---------------------------------------------------------------------------
// Device info (spec §15 DeviceInfo)
// ---------------------------------------------------------------------------

export const DeviceInfo = Schema.Struct({
  id: DeviceId,
  userId: UserId,
  name: TrimmedNonEmptyString,
  platform: DevicePlatform,
  kind: DeviceKind,
  capabilities: Schema.Array(DeviceCapability),
  approved: Schema.Boolean,
  online: Schema.Boolean,
  firstSeenAt: Schema.DateTimeUtc,
  lastSeenAt: Schema.NullOr(Schema.DateTimeUtc),
});
export type DeviceInfo = typeof DeviceInfo.Type;

// ---------------------------------------------------------------------------
// Google ID-token verification
// ---------------------------------------------------------------------------

export const VerifiedGoogleIdentity = Schema.Struct({
  googleSub: GoogleSub,
  email: TrimmedNonEmptyString,
  emailVerified: Schema.Boolean,
  displayName: Schema.NullOr(Schema.String),
  avatarUrl: Schema.NullOr(Schema.String),
});
export type VerifiedGoogleIdentity = typeof VerifiedGoogleIdentity.Type;

// ---------------------------------------------------------------------------
// Google bootstrap exchange (P1b wire shape; committed now for downstream use)
// ---------------------------------------------------------------------------

export const GoogleBootstrapInput = Schema.Struct({
  idToken: TrimmedNonEmptyString,
  deviceId: DeviceId,
  deviceName: TrimmedNonEmptyString,
  platform: DevicePlatform,
  kind: DeviceKind,
  capabilities: Schema.Array(DeviceCapability),
  appVersion: TrimmedNonEmptyString,
});
export type GoogleBootstrapInput = typeof GoogleBootstrapInput.Type;

export const GoogleBootstrapResult = Schema.Struct({
  user: UserInfo,
  device: DeviceInfo,
  needsApproval: Schema.Boolean,
});
export type GoogleBootstrapResult = typeof GoogleBootstrapResult.Type;

export const GoogleTokenBundle = Schema.Struct({
  accessToken: TrimmedNonEmptyString,
  idToken: TrimmedNonEmptyString,
  refreshToken: Schema.NullOr(TrimmedNonEmptyString),
  expiresAt: TrimmedNonEmptyString,
  scope: Schema.NullOr(Schema.String),
  tokenType: Schema.NullOr(Schema.String),
});
export type GoogleTokenBundle = typeof GoogleTokenBundle.Type;

export const GoogleTokenRefreshInput = Schema.Struct({
  refreshToken: TrimmedNonEmptyString,
  idToken: Schema.optionalKey(TrimmedNonEmptyString),
});
export type GoogleTokenRefreshInput = typeof GoogleTokenRefreshInput.Type;

export const GoogleTokenHandoffSnapshot = Schema.Struct({
  email: TrimmedNonEmptyString,
  displayName: Schema.NullOr(Schema.String),
  avatarUrl: Schema.NullOr(Schema.String),
  pendingApproval: Schema.Boolean,
  deviceId: DeviceId,
});
export type GoogleTokenHandoffSnapshot = typeof GoogleTokenHandoffSnapshot.Type;

export const GoogleTokenHandoffConsumeResult = Schema.Struct({
  snapshot: GoogleTokenHandoffSnapshot,
  tokens: GoogleTokenBundle,
});
export type GoogleTokenHandoffConsumeResult = typeof GoogleTokenHandoffConsumeResult.Type;

// ---------------------------------------------------------------------------
// Public client config for Google sign-in (P1d wire shape)
// ---------------------------------------------------------------------------

// Read by client devices on boot to decide whether to surface the V3 sign-in
// affordance and which OAuth client to authenticate against. The client_id is
// the OAuth Client ID registered in the operator's Google Cloud Console
// project. It is intentionally not a secret — public installed-app clients
// authenticate with PKCE rather than a client secret. When `available` is
// false, `clientId` is null and the sign-in UI surfaces a "not configured"
// state instead of attempting the OAuth dance.
export const GoogleClientPublicConfig = Schema.Struct({
  available: Schema.Boolean,
  clientId: Schema.NullOr(TrimmedNonEmptyString),
});
export type GoogleClientPublicConfig = typeof GoogleClientPublicConfig.Type;

// ---------------------------------------------------------------------------
// Device management API (P3)
// ---------------------------------------------------------------------------

export const V3DeviceListResult = Schema.Struct({
  currentDeviceId: DeviceId,
  devices: Schema.Array(DeviceInfo),
});
export type V3DeviceListResult = typeof V3DeviceListResult.Type;

export const V3ApproveDeviceInput = Schema.Struct({
  deviceId: DeviceId,
});
export type V3ApproveDeviceInput = typeof V3ApproveDeviceInput.Type;

export const V3ApproveDeviceResult = Schema.Struct({
  approved: Schema.Boolean,
});
export type V3ApproveDeviceResult = typeof V3ApproveDeviceResult.Type;

export const V3RemoveDeviceInput = Schema.Struct({
  deviceId: DeviceId,
});
export type V3RemoveDeviceInput = typeof V3RemoveDeviceInput.Type;

export const V3RemoveDeviceResult = Schema.Struct({
  removed: Schema.Boolean,
});
export type V3RemoveDeviceResult = typeof V3RemoveDeviceResult.Type;

export const DeviceApprovalStreamEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("device-registered"),
    userId: UserId,
    device: DeviceInfo,
    needsApproval: Schema.Boolean,
  }),
  Schema.Struct({
    type: Schema.Literal("device-approved"),
    userId: UserId,
    device: DeviceInfo,
  }),
  Schema.Struct({
    type: Schema.Literal("device-removed"),
    userId: UserId,
    deviceId: DeviceId,
  }),
]);
export type DeviceApprovalStreamEvent = typeof DeviceApprovalStreamEvent.Type;

// ---------------------------------------------------------------------------
// GitHub identity (P1e)
//
// Phase 1e wires a user-scoped GitHub OAuth flow onto the server node so the
// V3 server can store a per-user installation / user-access token at rest
// (AES-256-GCM encrypted via tokenEncryption.ts). The flow mirrors P7's
// browser Google sign-in but lives on top of an authenticated V3 session —
// users must sign in with Google first, then "Connect GitHub" as a second
// consent step.
//
// The flow is redirect-based:
//   1. Browser hits  GET /api/auth/github/authorize    (requires V3 session)
//   2. Server generates flow envelope + redirects to github.com
//   3. GitHub → GET /api/auth/github/callback?code=…&state=…
//   4. Server exchanges code for access_token, fetches /user, stores
//      encrypted token on v3_users, redirects back to /app/.
//
// Desktop (Electron) shells use the same server-hosted endpoint; the
// difference is purely which origin the user ends up on after the
// redirect.
// ---------------------------------------------------------------------------

export const GitHubOAuthScope = TrimmedNonEmptyString.pipe(Schema.brand("GitHubOAuthScope"));
export type GitHubOAuthScope = typeof GitHubOAuthScope.Type;

export const GitHubUserSummary = Schema.Struct({
  login: TrimmedNonEmptyString,
  id: Schema.Int,
  name: Schema.NullOr(Schema.String),
  email: Schema.NullOr(Schema.String),
  avatarUrl: Schema.NullOr(Schema.String),
});
export type GitHubUserSummary = typeof GitHubUserSummary.Type;

export const GitHubClientPublicConfig = Schema.Struct({
  available: Schema.Boolean,
  // Exposed so the client can display "Connect <org>" labels if the operator
  // uses a GitHub App; null when GitHub sign-in is not configured.
  clientId: Schema.NullOr(TrimmedNonEmptyString),
  // Space-separated string — render as comma list in the UI. Empty string
  // when the operator has not configured GitHub.
  scopes: Schema.String,
});
export type GitHubClientPublicConfig = typeof GitHubClientPublicConfig.Type;

// The server returns this shape on `/api/auth/github/status` so the UI can
// reflect whether the currently-signed-in V3 user has linked GitHub and
// what account they linked.
export const GitHubConnectionStatus = Schema.Struct({
  connected: Schema.Boolean,
  username: Schema.NullOr(TrimmedNonEmptyString),
  scopes: Schema.Array(GitHubOAuthScope),
  connectedAt: Schema.NullOr(Schema.DateTimeUtc),
  needsReconnect: Schema.Boolean,
  reconnectReason: Schema.NullOr(Schema.String),
});
export type GitHubConnectionStatus = typeof GitHubConnectionStatus.Type;

export const GitHubDisconnectResult = Schema.Struct({
  disconnected: Schema.Boolean,
});
export type GitHubDisconnectResult = typeof GitHubDisconnectResult.Type;
