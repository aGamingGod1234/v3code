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
