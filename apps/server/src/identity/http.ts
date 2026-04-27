import {
  AuthSessionId,
  CLOUD_DEVICE_NAME,
  DeviceCapability,
  DeviceId,
  DeviceInfo,
  DeviceKind,
  DevicePlatform,
  GitHubBootstrapInput,
  GitHubBootstrapResult,
  GitHubClientPublicConfig,
  GitHubConnectionStatus,
  GitHubDisconnectResult,
  GoogleBootstrapInput,
  GoogleBootstrapResult,
  GoogleClientPublicConfig,
  GoogleTokenBundle,
  GoogleTokenHandoffConsumeResult,
  GoogleTokenHandoffSnapshot,
  GoogleTokenRefreshInput,
  makeCloudDeviceId,
  V3ApproveDeviceInput,
  V3ApproveDeviceResult,
  V3DeviceListResult,
  V3RemoveDeviceInput,
  V3RemoveDeviceResult,
  UserId,
  UserInfo,
  type GitHubOAuthScope,
  type VerifiedGoogleIdentity,
} from "@v3tools/contracts";
import { withGoogleTokenExpiry } from "@v3tools/shared/googleTokens";
import * as Crypto from "node:crypto";

import { Cause, DateTime, Effect, Exit, Option, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { deriveAuthClientMetadata } from "../auth/utils.ts";
import { AuthError, ServerAuth } from "../auth/Services/ServerAuth.ts";
import { respondToAuthError } from "../auth/http.ts";
import { SessionCredentialService } from "../auth/Services/SessionCredentialService.ts";
import { ServerSecretStore } from "../auth/Services/ServerSecretStore.ts";
import { ServerConfig } from "../config.ts";
import {
  buildGoogleAuthorizeUrl,
  exchangeAuthorizationCode,
  flowExpiresAt,
  generateNonce,
  generatePkcePair,
  GOOGLE_TOKEN_URL,
  GoogleTokenExchangeError,
  OAUTH_FLOW_COOKIE_NAME,
  OAuthFlowVerificationError,
  resolveRedirectUri,
  sanitizeReturnTo,
  signFlowEnvelope,
  verifyFlowEnvelope,
  type OAuthFlowEnvelope,
} from "./browserGoogleOAuth.ts";
import {
  buildGitHubAuthorizeUrl,
  flowExpiresAt as githubFlowExpiresAt,
  generateGitHubFlowNonce,
  GITHUB_FLOW_COOKIE_NAME,
  GitHubFlowVerificationError,
  resolveGitHubRedirectUri,
  sanitizeGitHubReturnTo,
  signGitHubFlowEnvelope,
  verifyGitHubFlowEnvelope,
  type GitHubFlowEnvelope,
} from "./browserGitHubOAuth.ts";
import { decrypt as decryptToken, encrypt as encryptToken } from "../identity/tokenEncryption.ts";
import {
  DeviceApprovalService,
  DeviceLimitReachedError,
} from "./Services/DeviceApprovalService.ts";
import { DeviceRepository } from "./Services/DeviceRepository.ts";
import { DeviceSessionRepository } from "./Services/DeviceSessionRepository.ts";
import { GoogleIdentityError, GitHubIdentityError } from "./Errors.ts";
import { GitHubIdentityService } from "./Services/GitHubIdentityService.ts";
import { GoogleIdentityService } from "./Services/GoogleIdentityService.ts";
import { GoogleTokenHandoffStore } from "./Services/GoogleTokenHandoffStore.ts";
import { UserContextResolver } from "./Services/UserContextResolver.ts";
import { UserRepository, type UserRepositoryShape } from "./Services/UserRepository.ts";

const OAUTH_FLOW_SECRET_NAME = "v3-google-oauth-flow-key";
const OAUTH_FLOW_SECRET_BYTES = 32;
const MAX_DEVICE_NAME_LENGTH = 120;
const MAX_RETURN_TO_LENGTH = 512;
const MAX_APP_VERSION_LENGTH = 32;
const GITHUB_FLOW_SECRET_NAME = "v3-github-oauth-flow-key";
const GITHUB_TOKEN_ENCRYPTION_KEY_NAME = "v3-token-enc-key";
const GITHUB_TOKEN_ENCRYPTION_KEY_BYTES = 32;
const GOOGLE_TOKEN_HANDOFF_COOKIE_NAME = "v3_google_token_handoff";

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

const isEmailAuthorized = (
  verified: VerifiedGoogleIdentity,
  allowlist: ReadonlyArray<string>,
  mode: string,
) => {
  // Desktop mode runs the embedded V3 server on 127.0.0.1 only and is
  // single-user by definition — whoever's running the Electron app is
  // the authorized user. Skipping the allowlist here avoids forcing
  // desktop users to pre-configure their own email before first
  // sign-in. Server-node and web modes still enforce the allowlist.
  if (mode === "desktop") return true;
  if (allowlist.length === 0) return false;
  const normalized = verified.email.trim().toLowerCase();
  return allowlist.includes(normalized);
};

const enforceSingleServerNodeUser = (input: {
  readonly mode: string;
  readonly verified: VerifiedGoogleIdentity;
  readonly users: UserRepositoryShape;
}) =>
  Effect.gen(function* () {
    if (input.mode !== "server-node") {
      return;
    }

    const existingUsers = yield* input.users
      .listAll()
      .pipe(Effect.mapError(toInternalAuthError("Failed to verify the configured V3 owner.")));
    const conflictingUser = existingUsers.find(
      (user) => user.googleSub !== input.verified.googleSub,
    );
    if (conflictingUser) {
      return yield* new AuthError({
        message: `This server node is already bound to ${conflictingUser.email}.`,
        status: 403,
      });
    }
  });

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

const parseGitHubScopes = (value: string): ReadonlyArray<GitHubOAuthScope> =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => entry as GitHubOAuthScope);

const packGitHubEncryptedToken = (accessToken: string, key: Uint8Array) => {
  const encrypted = encryptToken(accessToken, key);
  const packedCiphertext = new Uint8Array(encrypted.ciphertext.length + encrypted.authTag.length);
  packedCiphertext.set(encrypted.ciphertext, 0);
  packedCiphertext.set(encrypted.authTag, encrypted.ciphertext.length);
  return {
    ciphertext: packedCiphertext,
    iv: encrypted.iv,
  };
};

const unpackGitHubEncryptedToken = (input: {
  readonly ciphertext: Uint8Array;
  readonly iv: Uint8Array;
}): { readonly ciphertext: Uint8Array; readonly iv: Uint8Array; readonly authTag: Uint8Array } => {
  if (input.ciphertext.length <= 16) {
    throw new Error("Stored GitHub token is corrupted.");
  }
  return {
    ciphertext: input.ciphertext.slice(0, input.ciphertext.length - 16),
    iv: input.iv,
    authTag: input.ciphertext.slice(input.ciphertext.length - 16),
  };
};

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

    // 2. Email allowlist (bypassed in desktop mode — see isEmailAuthorized)
    if (!isEmailAuthorized(verified, config.authorizedEmails, config.mode)) {
      return yield* new AuthError({
        message: `This server node is not configured to accept sign-in from ${verified.email}.`,
        status: 403,
      });
    }
    yield* enforceSingleServerNodeUser({ mode: config.mode, verified, users });

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

    // 4. Register + approval decision. `maxDevices` comes from
    // spec §10.4 `[limits].max_devices_per_user`; the approval service
    // rejects with `DeviceLimitReachedError` when a new insert would
    // push the user past the cap.
    const approvalResult = yield* approvals
      .registerOrResume({
        userId,
        deviceId: payload.deviceId,
        deviceName: payload.deviceName,
        platform: payload.platform,
        kind: payload.kind,
        capabilities: payload.capabilities,
        maxDevices: config.maxDevicesPerUser,
        now,
      })
      .pipe(
        Effect.mapError((cause) => {
          if (Schema.is(DeviceLimitReachedError)(cause)) {
            return new AuthError({
              message: `You have already registered ${cause.currentCount} devices (cap: ${cause.limit}). Remove an existing device from Settings → Devices before adding another.`,
              status: 409,
              cause,
            });
          }
          return new AuthError({
            message: "Failed to register device.",
            status: 500,
            cause,
          });
        }),
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

export const googleTokenConsumeRouteLayer = HttpRouter.add(
  "POST",
  "/api/auth/google/tokens/consume",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const handoffStore = yield* GoogleTokenHandoffStore;
    const handoffId = request.cookies[GOOGLE_TOKEN_HANDOFF_COOKIE_NAME];
    const now = yield* DateTime.now;
    const consumed =
      typeof handoffId === "string" && handoffId.length > 0
        ? yield* handoffStore.consume({ id: handoffId, now })
        : Option.none();

    const response = Option.match(consumed, {
      onNone: () => HttpServerResponse.empty({ status: 204 }),
      onSome: (result) =>
        HttpServerResponse.jsonUnsafe(Schema.encodeSync(GoogleTokenHandoffConsumeResult)(result), {
          status: 200,
        }),
    });

    return yield* HttpServerResponse.setCookie(GOOGLE_TOKEN_HANDOFF_COOKIE_NAME, "", {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      maxAge: 0,
    })(response).pipe(Effect.mapError(() => cookieWriteError));
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);

export const googleTokenRefreshRouteLayer = HttpRouter.add(
  "POST",
  "/api/auth/google/tokens/refresh",
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    if (!config.googleClientId || !config.googleClientSecret) {
      return HttpServerResponse.text("Google sign-in is not fully configured on this server.", {
        status: 500,
      });
    }
    const googleClientId = config.googleClientId;
    const googleClientSecret = config.googleClientSecret;

    yield* resolveV3RequestContext;
    const payload = yield* HttpServerRequest.schemaBodyJson(GoogleTokenRefreshInput).pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Invalid Google token refresh payload.",
            status: 400,
            cause,
          }),
      ),
    );

    const refreshed = yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(GOOGLE_TOKEN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: googleClientId,
            client_secret: googleClientSecret,
            refresh_token: payload.refreshToken,
          }).toString(),
        });

        const text = await response.text();
        if (!response.ok) {
          throw new AuthError({
            message: `Google token refresh failed with ${response.status}.`,
            status: response.status === 400 || response.status === 401 ? 401 : 500,
            cause: text,
          });
        }

        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(text) as Record<string, unknown>;
        } catch (cause) {
          throw new AuthError({
            message: "Google token refresh returned invalid JSON.",
            status: 500,
            cause,
          });
        }

        const accessToken =
          typeof parsed.access_token === "string" && parsed.access_token.length > 0
            ? parsed.access_token
            : null;
        const idToken =
          typeof parsed.id_token === "string" && parsed.id_token.length > 0
            ? parsed.id_token
            : (payload.idToken ?? null);

        if (!accessToken || !idToken) {
          throw new AuthError({
            message: "Google token refresh response was missing required tokens.",
            status: 401,
            cause: parsed,
          });
        }

        return Schema.decodeUnknownSync(GoogleTokenBundle)(
          withGoogleTokenExpiry(
            {
              accessToken,
              idToken,
              refreshToken:
                typeof parsed.refresh_token === "string" && parsed.refresh_token.length > 0
                  ? parsed.refresh_token
                  : payload.refreshToken,
              scope: typeof parsed.scope === "string" ? parsed.scope : null,
              tokenType: typeof parsed.token_type === "string" ? parsed.token_type : null,
            },
            typeof parsed.expires_in === "number" ? parsed.expires_in : 3600,
          ),
        );
      },
      catch: (cause) =>
        cause instanceof AuthError
          ? cause
          : new AuthError({
              message: "Google token refresh failed.",
              status: 500,
              cause,
            }),
    });

    return HttpServerResponse.jsonUnsafe(Schema.encodeSync(GoogleTokenBundle)(refreshed), {
      status: 200,
    });
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);

export const listDevicesRouteLayer = HttpRouter.add(
  "GET",
  "/api/v3/devices",
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const devices = yield* DeviceRepository;
    const { currentDevice, userId } = yield* resolveV3RequestContext;
    const records = yield* devices
      .listForUser({ userId })
      .pipe(Effect.mapError(toInternalAuthError("Failed to list V3 devices.")));
    const onlineDeviceIds = yield* resolveOnlineDeviceIds(currentDevice.id);

    const deviceInfos = records.map((record) =>
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
    );

    if (config.mode === "server-node") {
      deviceInfos.push(
        toDeviceInfo({
          id: makeCloudDeviceId(),
          userId,
          name: CLOUD_DEVICE_NAME as DeviceInfo["name"],
          platform: "web",
          kind: "cloud",
          capabilities: ["view_only"],
          approved: true,
          firstSeenAt: currentDevice.firstSeenAt,
          lastSeenAt: currentDevice.lastSeenAt,
          online: true,
        }),
      );
    }

    const body: V3DeviceListResult = {
      currentDeviceId: currentDevice.id,
      devices: deviceInfos,
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

// ---------------------------------------------------------------------------
// V3 Phase 7 — browser Google sign-in (cloud-mode web app).
//
// The desktop flow (P1d) uses Electron's PKCE-over-system-browser dance and
// calls `POST /api/auth/google/bootstrap` directly with the id_token it
// receives on its custom-scheme callback. Browsers cannot hold a Google OAuth
// client secret and cannot register a custom URI scheme, so the cloud-mode
// bundle delegates to a server-hosted redirect-based flow:
//
//     GET /api/auth/google/authorize   → redirect to Google consent
//     GET /api/auth/google/callback    → code exchange + bootstrap + redirect back
//
// Both routes reuse the existing device-approval + session-credential
// machinery, so `mesh.*` RPCs and device listings pick up the browser
// session without any additional wiring.

const pickRequestOrigin = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const urlOpt = HttpServerRequest.toURL(request);
  if (Option.isNone(urlOpt)) {
    return "http://localhost";
  }
  return urlOpt.value.origin;
});

const extractQueryParam = (
  request: HttpServerRequest.HttpServerRequest,
  name: string,
): string | null => {
  const urlOpt = HttpServerRequest.toURL(request);
  if (Option.isNone(urlOpt)) return null;
  return urlOpt.value.searchParams.get(name);
};

const truncate = (input: string | null, limit: number): string =>
  input === null ? "" : input.slice(0, limit);

const decodeList = (input: string | null): ReadonlyArray<string> => {
  if (!input) return [];
  return input
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

export const googleAuthorizeRouteLayer = HttpRouter.add(
  "GET",
  "/api/auth/google/authorize",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const config = yield* ServerConfig;
    if (!config.googleClientId || config.googleClientId.length === 0) {
      return HttpServerResponse.text(
        "Google sign-in is not configured on this server (V3CODE_GOOGLE_CLIENT_ID unset).",
        { status: 500 },
      );
    }
    if (!config.googleClientSecret || config.googleClientSecret.length === 0) {
      return HttpServerResponse.text(
        "Browser Google sign-in requires V3CODE_GOOGLE_CLIENT_SECRET (or [auth].google_client_secret in config.toml).",
        { status: 500 },
      );
    }

    const rawDeviceId = extractQueryParam(request, "device_id");
    if (!rawDeviceId) {
      return HttpServerResponse.text("Missing device_id query parameter.", { status: 400 });
    }
    const rawPlatform = extractQueryParam(request, "platform") ?? "web";
    const rawKind = extractQueryParam(request, "kind") ?? "browser";
    const rawCapabilities = decodeList(extractQueryParam(request, "capabilities"));
    const rawDeviceName = truncate(
      extractQueryParam(request, "device_name"),
      MAX_DEVICE_NAME_LENGTH,
    );
    const rawReturnTo = truncate(extractQueryParam(request, "return_to"), MAX_RETURN_TO_LENGTH);
    const rawAppVersion = truncate(
      extractQueryParam(request, "app_version") ?? "0.0.0-browser",
      MAX_APP_VERSION_LENGTH,
    );
    const loginHint = extractQueryParam(request, "login_hint") ?? undefined;

    const deviceIdOption = Schema.decodeUnknownOption(DeviceId)(rawDeviceId);
    if (Option.isNone(deviceIdOption)) {
      return HttpServerResponse.text("Invalid device_id.", { status: 400 });
    }
    const platformOption = Schema.decodeUnknownOption(DevicePlatform)(rawPlatform);
    if (Option.isNone(platformOption)) {
      return HttpServerResponse.text(`Unsupported platform '${rawPlatform}'.`, { status: 400 });
    }
    const kindOption = Schema.decodeUnknownOption(DeviceKind)(rawKind);
    if (Option.isNone(kindOption)) {
      return HttpServerResponse.text(`Unsupported device kind '${rawKind}'.`, { status: 400 });
    }
    const capabilityOptions = rawCapabilities.map((entry) =>
      Schema.decodeUnknownOption(DeviceCapability)(entry),
    );
    if (capabilityOptions.some((entry) => Option.isNone(entry))) {
      return HttpServerResponse.text("Unsupported capability in capabilities list.", {
        status: 400,
      });
    }
    const validCapabilities = capabilityOptions
      .flatMap((opt) => (Option.isSome(opt) ? [opt.value] : []))
      .filter((cap, index, self) => self.indexOf(cap) === index);

    const origin = yield* pickRequestOrigin;
    const redirectUri = resolveRedirectUri({
      publicUrl: config.serverPublicUrl,
      requestOrigin: origin,
    });
    const resolvedReturnTo = sanitizeReturnTo(rawReturnTo, origin);
    const deviceName =
      rawDeviceName.trim().length > 0 ? rawDeviceName.trim() : `V3 Browser (${rawPlatform})`;

    const secretStore = yield* ServerSecretStore;
    const flowKey = yield* secretStore
      .getOrCreateRandom(OAUTH_FLOW_SECRET_NAME, OAUTH_FLOW_SECRET_BYTES)
      .pipe(
        Effect.mapError(
          (cause) =>
            new AuthError({
              message: "Failed to access OAuth flow secret.",
              status: 500,
              cause,
            }),
        ),
      );

    const { verifier, challenge } = generatePkcePair();
    const nonce = generateNonce();
    const nowMs = yield* DateTime.now.pipe(Effect.map((value) => DateTime.toEpochMillis(value)));
    const nowSeconds = Math.floor(nowMs / 1000);
    const envelope: OAuthFlowEnvelope = {
      v: 1,
      verifier,
      nonce,
      deviceId: deviceIdOption.value,
      deviceName,
      platform: platformOption.value,
      kind: kindOption.value,
      capabilities: validCapabilities.length > 0 ? validCapabilities : ["view_only"],
      appVersion: rawAppVersion,
      returnTo: resolvedReturnTo,
      exp: flowExpiresAt(nowSeconds),
    };
    const signed = signFlowEnvelope(envelope, flowKey);

    const googleUrl = buildGoogleAuthorizeUrl({
      clientId: config.googleClientId,
      redirectUri,
      codeChallenge: challenge,
      state: signed,
      ...(loginHint !== undefined ? { loginHint } : {}),
    });

    const redirectResponse = HttpServerResponse.empty({ status: 302 }).pipe(
      HttpServerResponse.setHeader("Location", googleUrl),
    );
    return yield* HttpServerResponse.setCookie(OAUTH_FLOW_COOKIE_NAME, signed, {
      httpOnly: true,
      path: "/api/auth/google",
      sameSite: "lax",
      maxAge: 600,
    })(redirectResponse).pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Failed to set OAuth flow cookie.",
            status: 500,
            cause,
          }),
      ),
    );
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);

const flowVerificationToAuthError = (error: OAuthFlowVerificationError): AuthError =>
  new AuthError({
    message:
      error.reason === "expired"
        ? "Your sign-in took too long — please try again."
        : "Could not verify the sign-in flow.",
    status: 400,
    cause: error,
  });

const googleTokenExchangeToAuthError = (error: GoogleTokenExchangeError): AuthError =>
  new AuthError({
    message: "Google rejected the sign-in code exchange.",
    status: 500,
    cause: error,
  });

const cookieWriteError = new AuthError({
  message: "Failed to set response cookie.",
  status: 500,
});

export const googleCallbackRouteLayer = HttpRouter.add(
  "GET",
  "/api/auth/google/callback",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const config = yield* ServerConfig;
    if (!config.googleClientId || !config.googleClientSecret) {
      return HttpServerResponse.text("Google sign-in is not fully configured on this server.", {
        status: 500,
      });
    }

    const stateParam = extractQueryParam(request, "state");
    const codeParam = extractQueryParam(request, "code");
    const errorParam = extractQueryParam(request, "error");
    if (errorParam) {
      return HttpServerResponse.text(`Google declined the sign-in: ${errorParam}`, { status: 400 });
    }
    if (!stateParam || !codeParam) {
      return HttpServerResponse.text("Callback missing code or state.", { status: 400 });
    }

    const secretStore = yield* ServerSecretStore;
    const flowKey = yield* secretStore
      .getOrCreateRandom(OAUTH_FLOW_SECRET_NAME, OAUTH_FLOW_SECRET_BYTES)
      .pipe(
        Effect.mapError(
          (cause) =>
            new AuthError({
              message: "Failed to access OAuth flow secret.",
              status: 500,
              cause,
            }),
        ),
      );

    const nowMs = yield* DateTime.now.pipe(Effect.map((value) => DateTime.toEpochMillis(value)));
    const envelope = yield* Effect.try({
      try: () => verifyFlowEnvelope(stateParam, flowKey, Math.floor(nowMs / 1000)),
      catch: (cause) =>
        cause instanceof OAuthFlowVerificationError
          ? flowVerificationToAuthError(cause)
          : new AuthError({
              message: "Invalid sign-in state.",
              status: 400,
              cause,
            }),
    });

    const origin = yield* pickRequestOrigin;
    const redirectUri = resolveRedirectUri({
      publicUrl: config.serverPublicUrl,
      requestOrigin: origin,
    });

    const tokens = yield* Effect.tryPromise({
      try: () =>
        exchangeAuthorizationCode({
          clientId: config.googleClientId as string,
          clientSecret: config.googleClientSecret as string,
          code: codeParam,
          codeVerifier: envelope.verifier,
          redirectUri,
          fetchImpl: fetch,
        }),
      catch: (cause) =>
        cause instanceof GoogleTokenExchangeError
          ? googleTokenExchangeToAuthError(cause)
          : new AuthError({
              message: "Google token exchange failed.",
              status: 500,
              cause,
            }),
    });

    const google = yield* GoogleIdentityService;
    const verified = yield* google
      .verifyIdToken(tokens.id_token)
      .pipe(Effect.mapError(googleErrorToAuthError));
    const users = yield* UserRepository;

    if (!isEmailAuthorized(verified, config.authorizedEmails, config.mode)) {
      return yield* new AuthError({
        message: `This server node is not configured to accept sign-in from ${verified.email}.`,
        status: 403,
      });
    }
    yield* enforceSingleServerNodeUser({ mode: config.mode, verified, users });

    const now = yield* DateTime.now;
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

    const approvals = yield* DeviceApprovalService;
    const deviceIdForReg = DeviceId.make(envelope.deviceId);
    const platformForReg = envelope.platform as DevicePlatform;
    const kindForReg = envelope.kind as DeviceKind;
    const capabilitiesForReg = envelope.capabilities as ReadonlyArray<DeviceCapability>;
    const approvalResult = yield* approvals
      .registerOrResume({
        userId,
        deviceId: deviceIdForReg,
        deviceName: envelope.deviceName,
        platform: platformForReg,
        kind: kindForReg,
        capabilities: capabilitiesForReg,
        maxDevices: config.maxDevicesPerUser,
        now,
      })
      .pipe(
        Effect.mapError((cause) => {
          if (Schema.is(DeviceLimitReachedError)(cause)) {
            return new AuthError({
              message: `You have already registered ${cause.currentCount} devices (cap: ${cause.limit}). Remove an existing device from Settings → Devices before adding another.`,
              status: 409,
              cause,
            });
          }
          return new AuthError({
            message: "Failed to register device.",
            status: 500,
            cause,
          });
        }),
      );

    const sessions = yield* SessionCredentialService;
    const clientMetadata = deriveAuthClientMetadata({
      request,
      label: envelope.deviceName,
    });
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

    const deviceSessions = yield* DeviceSessionRepository;
    yield* deviceSessions
      .link({
        sessionId: AuthSessionId.make(issued.sessionId),
        deviceId: deviceIdForReg,
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

    // One-time handoff: drop the access_token into a very short-lived,
    // non-HttpOnly cookie so the renderer can pull it into JS once and
    // forward it to the Drive App Data client. The cookie is scoped to
    // `/app/` + cleared by the renderer after consumption; if the
    // operator has not deployed the cloud bundle yet we just never
    // set it. Bootstrap result payload unused here — the browser has
    // no JSON response surface to inspect, it just follows the
    // redirect — so we stash `user_email`, `needs_approval`, and a
    // `device_id` in a non-sensitive cookie so the renderer can
    // display the signed-in chip on first paint without a second
    // round-trip.
    const handoffStore = yield* GoogleTokenHandoffStore;
    const handoffId = yield* handoffStore.issue({
      snapshot: Schema.decodeUnknownSync(GoogleTokenHandoffSnapshot)({
        email: verified.email,
        displayName: userRecord.displayName,
        avatarUrl: userRecord.avatarUrl,
        pendingApproval: approvalResult.needsApproval,
        deviceId: deviceIdForReg,
      }),
      tokens: Schema.decodeUnknownSync(GoogleTokenBundle)(
        withGoogleTokenExpiry(
          {
            accessToken: tokens.access_token,
            idToken: tokens.id_token,
            refreshToken: tokens.refresh_token ?? null,
            scope: tokens.scope ?? null,
            tokenType: tokens.token_type ?? null,
          },
          tokens.expires_in ?? 3600,
        ),
      ),
      now,
    });

    const baseResponse = HttpServerResponse.empty({ status: 302 }).pipe(
      HttpServerResponse.setHeader("Location", envelope.returnTo || "/app/"),
    );
    const withSession = yield* HttpServerResponse.setCookie(sessions.cookieName, issued.token, {
      expires: DateTime.toDate(issued.expiresAt),
      httpOnly: true,
      path: "/",
      sameSite: "lax",
    })(baseResponse).pipe(Effect.mapError(() => cookieWriteError));
    const withHandoff = yield* HttpServerResponse.setCookie(
      GOOGLE_TOKEN_HANDOFF_COOKIE_NAME,
      handoffId,
      {
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        maxAge: 120,
      },
    )(withSession).pipe(Effect.mapError(() => cookieWriteError));
    const withoutLegacySnapshot = yield* HttpServerResponse.setCookie("v3_signin_snapshot", "", {
      path: "/",
      sameSite: "lax",
      maxAge: 0,
    })(withHandoff).pipe(Effect.mapError(() => cookieWriteError));
    const withoutLegacyDriveToken = yield* HttpServerResponse.setCookie(
      "v3_drive_access_token",
      "",
      {
        path: "/",
        sameSite: "lax",
        maxAge: 0,
      },
    )(withoutLegacySnapshot).pipe(Effect.mapError(() => cookieWriteError));
    return yield* HttpServerResponse.setCookie(OAUTH_FLOW_COOKIE_NAME, "", {
      path: "/api/auth/google",
      sameSite: "lax",
      maxAge: 0,
    })(withoutLegacyDriveToken).pipe(Effect.mapError(() => cookieWriteError));
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);

// ---------------------------------------------------------------------------
// V3 Phase 1e — GitHub sign-in / connect flow.
//
// Four routes:
//   GET /api/auth/github/config       — public { available, clientId, scopes }
//   GET /api/auth/github/status       — authenticated { connected, username, ... }
//   GET /api/auth/github/authorize    — authenticated; redirects to GitHub
//   GET /api/auth/github/callback     — GitHub callback; exchanges code,
//                                       persists encrypted token on v3_users,
//                                       redirects back to the client
//   POST /api/auth/github/disconnect  — authenticated; clears the token row
//
// Unlike Google sign-in, the GitHub flow assumes the user is already
// signed into V3 — we tie the encrypted token to `UserRepository` via
// the authenticated session's userId. Browsers and the desktop shell
// both funnel through the same server-hosted endpoints so there's one
// code path to reason about.

const githubIdentityErrorToAuthError = (error: GitHubIdentityError): AuthError => {
  const status: 400 | 500 = error.reason === "not-configured" ? 500 : 400;
  return new AuthError({
    message: error.message,
    status,
    cause: error,
  });
};

const githubFlowVerificationToAuthError = (error: GitHubFlowVerificationError): AuthError =>
  new AuthError({
    message:
      error.reason === "expired"
        ? "Your GitHub connect flow expired — please try again."
        : "Could not verify the GitHub connect flow.",
    status: 400,
    cause: error,
  });

export const githubConfigRouteLayer = HttpRouter.add(
  "GET",
  "/api/auth/github/config",
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const available =
      typeof config.githubClientId === "string" &&
      config.githubClientId.length > 0 &&
      typeof config.githubClientSecret === "string" &&
      config.githubClientSecret.length > 0;
    const body: GitHubClientPublicConfig = {
      available,
      clientId: available ? (config.githubClientId as GitHubClientPublicConfig["clientId"]) : null,
      scopes: available ? config.githubOauthScopes : "",
    };
    return HttpServerResponse.jsonUnsafe(Schema.encodeSync(GitHubClientPublicConfig)(body), {
      status: 200,
    });
  }),
);

export const githubStatusRouteLayer = HttpRouter.add(
  "GET",
  "/api/auth/github/status",
  Effect.gen(function* () {
    const users = yield* UserRepository;
    const secretStore = yield* ServerSecretStore;
    const githubIdentity = yield* GitHubIdentityService;
    const { userId } = yield* resolveV3RequestContext;
    const tokenOpt = yield* users
      .getGitHubToken({ id: userId })
      .pipe(Effect.mapError(toInternalAuthError("Failed to load GitHub connection state.")));

    if (Option.isNone(tokenOpt)) {
      return HttpServerResponse.jsonUnsafe(
        Schema.encodeSync(GitHubConnectionStatus)({
          connected: false,
          username: null,
          scopes: [],
          connectedAt: null,
          needsReconnect: false,
          reconnectReason: null,
        } satisfies GitHubConnectionStatus),
        {
          status: 200,
        },
      );
    }

    const record = tokenOpt.value;
    const scopes = parseGitHubScopes(record.githubScopes);
    const baseStatus: GitHubConnectionStatus = {
      connected: true,
      username: record.githubUsername,
      scopes,
      connectedAt: record.connectedAt,
      needsReconnect: false,
      reconnectReason: null,
    };
    const reconnectStatus = (reason: string): GitHubConnectionStatus => ({
      ...baseStatus,
      needsReconnect: true,
      reconnectReason: reason,
    });

    const encKey = yield* secretStore
      .getOrCreateRandom(GITHUB_TOKEN_ENCRYPTION_KEY_NAME, GITHUB_TOKEN_ENCRYPTION_KEY_BYTES)
      .pipe(Effect.mapError(toInternalAuthError("Failed to load the GitHub token key.")));

    const decryptedTokenExit = yield* Effect.exit(
      Effect.try({
        try: () =>
          decryptToken(
            unpackGitHubEncryptedToken({
              ciphertext: record.githubAccessTokenEnc,
              iv: record.githubTokenEncIv,
            }),
            encKey,
          ),
        catch: (cause) =>
          new AuthError({
            message: "Stored GitHub token could not be decrypted.",
            status: 500,
            cause,
          }),
      }),
    );

    if (Exit.isFailure(decryptedTokenExit)) {
      return HttpServerResponse.jsonUnsafe(
        Schema.encodeSync(GitHubConnectionStatus)(
          reconnectStatus("Stored GitHub token is invalid. Reconnect GitHub."),
        ),
        {
          status: 200,
        },
      );
    }

    const validationExit = yield* Effect.exit(
      githubIdentity.fetchUser({ accessToken: decryptedTokenExit.value }),
    );
    const body: GitHubConnectionStatus = Exit.isSuccess(validationExit)
      ? baseStatus
      : (() => {
          const failure = validationExit.cause.reasons.find(Cause.isFailReason);
          const error = failure?.error;
          if (error?.reason === "profile-fetch") {
            return reconnectStatus(error.message);
          }
          return baseStatus;
        })();

    return HttpServerResponse.jsonUnsafe(Schema.encodeSync(GitHubConnectionStatus)(body), {
      status: 200,
    });
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);

export const githubAuthorizeRouteLayer = HttpRouter.add(
  "GET",
  "/api/auth/github/authorize",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const config = yield* ServerConfig;
    if (!config.githubClientId || !config.githubClientSecret) {
      return HttpServerResponse.text(
        "GitHub sign-in is not configured (missing V3CODE_GITHUB_CLIENT_ID or V3CODE_GITHUB_CLIENT_SECRET).",
        { status: 500 },
      );
    }

    // Require an authenticated V3 session.
    const { userId } = yield* resolveV3RequestContext;

    const rawReturnTo = truncate(extractQueryParam(request, "return_to"), MAX_RETURN_TO_LENGTH);
    const loginHint = extractQueryParam(request, "login_hint") ?? undefined;

    const origin = yield* pickRequestOrigin;
    const redirectUri = resolveGitHubRedirectUri(config.serverPublicUrl, origin);
    const returnTo = sanitizeGitHubReturnTo(rawReturnTo, origin);

    const secretStore = yield* ServerSecretStore;
    const flowKey = yield* secretStore
      .getOrCreateRandom(GITHUB_FLOW_SECRET_NAME, OAUTH_FLOW_SECRET_BYTES)
      .pipe(
        Effect.mapError(
          (cause) =>
            new AuthError({
              message: "Failed to access GitHub flow secret.",
              status: 500,
              cause,
            }),
        ),
      );

    const nowMs = yield* DateTime.now.pipe(Effect.map((value) => DateTime.toEpochMillis(value)));
    const nowSeconds = Math.floor(nowMs / 1000);
    const envelope: GitHubFlowEnvelope = {
      v: 1,
      nonce: generateGitHubFlowNonce(),
      userId,
      returnTo,
      exp: githubFlowExpiresAt(nowSeconds),
    };
    const signed = signGitHubFlowEnvelope(envelope, flowKey);

    const target = buildGitHubAuthorizeUrl({
      clientId: config.githubClientId,
      redirectUri,
      state: signed,
      scopes: config.githubOauthScopes,
      ...(loginHint !== undefined ? { loginHint } : {}),
    });
    const baseResponse = HttpServerResponse.empty({ status: 302 }).pipe(
      HttpServerResponse.setHeader("Location", target),
    );
    return yield* HttpServerResponse.setCookie(GITHUB_FLOW_COOKIE_NAME, signed, {
      httpOnly: true,
      path: "/api/auth/github",
      sameSite: "lax",
      maxAge: 600,
    })(baseResponse).pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Failed to set GitHub flow cookie.",
            status: 500,
            cause,
          }),
      ),
    );
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);

export const githubCallbackRouteLayer = HttpRouter.add(
  "GET",
  "/api/auth/github/callback",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const config = yield* ServerConfig;
    if (!config.githubClientId || !config.githubClientSecret) {
      return HttpServerResponse.text("GitHub sign-in is not configured on this server.", {
        status: 500,
      });
    }

    const codeParam = extractQueryParam(request, "code");
    const stateParam = extractQueryParam(request, "state");
    const errorParam = extractQueryParam(request, "error");
    if (errorParam) {
      return HttpServerResponse.text(`GitHub declined the sign-in: ${errorParam}`, {
        status: 400,
      });
    }
    if (!codeParam || !stateParam) {
      return HttpServerResponse.text("Callback missing code or state.", { status: 400 });
    }

    const secretStore = yield* ServerSecretStore;
    const flowKey = yield* secretStore
      .getOrCreateRandom(GITHUB_FLOW_SECRET_NAME, OAUTH_FLOW_SECRET_BYTES)
      .pipe(
        Effect.mapError(
          (cause) =>
            new AuthError({
              message: "Failed to access GitHub flow secret.",
              status: 500,
              cause,
            }),
        ),
      );

    const nowMs = yield* DateTime.now.pipe(Effect.map((value) => DateTime.toEpochMillis(value)));
    const envelope = yield* Effect.try({
      try: () => verifyGitHubFlowEnvelope(stateParam, flowKey, Math.floor(nowMs / 1000)),
      catch: (cause) =>
        cause instanceof GitHubFlowVerificationError
          ? githubFlowVerificationToAuthError(cause)
          : new AuthError({ message: "Invalid GitHub flow state.", status: 400, cause }),
    });

    // The envelope contains the userId that kicked off the flow. The
    // currently-signed-in session's userId must match, otherwise a
    // second browser session could hijack someone else's connect
    // flow. `resolveV3RequestContext` throws if there is no V3
    // session at all.
    const currentContext = yield* resolveV3RequestContext;
    if (currentContext.userId !== envelope.userId) {
      return yield* new AuthError({
        message: "Sign-in session mismatch — please connect GitHub again.",
        status: 403,
      });
    }

    const origin = yield* pickRequestOrigin;
    const redirectUri = resolveGitHubRedirectUri(config.serverPublicUrl, origin);

    const githubIdentity = yield* GitHubIdentityService;
    const token = yield* githubIdentity
      .exchangeCode({ code: codeParam, state: stateParam, redirectUri })
      .pipe(Effect.mapError(githubIdentityErrorToAuthError));
    const profile = yield* githubIdentity
      .fetchUser({ accessToken: token.accessToken })
      .pipe(Effect.mapError(githubIdentityErrorToAuthError));

    // Encrypt the access token at rest. The encryption key is
    // persisted in ServerSecretStore and rotates only on an explicit
    // operator-driven migration.
    const encKey = yield* secretStore
      .getOrCreateRandom(GITHUB_TOKEN_ENCRYPTION_KEY_NAME, GITHUB_TOKEN_ENCRYPTION_KEY_BYTES)
      .pipe(
        Effect.mapError(
          (cause) =>
            new AuthError({
              message: "Failed to access token encryption key.",
              status: 500,
              cause,
            }),
        ),
      );
    const encrypted = packGitHubEncryptedToken(token.accessToken, encKey);

    const users = yield* UserRepository;
    const now = yield* DateTime.now;
    yield* users
      .setGitHubToken({
        userId: envelope.userId as UserId,
        githubUsername: profile.login,
        githubAccessTokenEnc: encrypted.ciphertext,
        githubTokenEncIv: encrypted.iv,
        githubScopes: token.scopes.join(","),
        now,
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new AuthError({
              message: "Failed to persist GitHub connection.",
              status: 500,
              cause,
            }),
        ),
      );

    const response = HttpServerResponse.empty({ status: 302 }).pipe(
      HttpServerResponse.setHeader("Location", envelope.returnTo || "/app/"),
    );
    return yield* HttpServerResponse.setCookie(GITHUB_FLOW_COOKIE_NAME, "", {
      path: "/api/auth/github",
      sameSite: "lax",
      maxAge: 0,
    })(response).pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Failed to clear GitHub flow cookie.",
            status: 500,
            cause,
          }),
      ),
    );
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);

// Desktop loopback GitHub flow hands a pre-obtained access token here
// instead of bouncing through /api/auth/github/{authorize,callback}.
// The server still calls GitHub's /user endpoint itself so it can
// verify the token and record the canonical login (the renderer is
// untrusted input). Requires an authenticated V3 session so we can
// bind the token to the signed-in user.
export const githubBootstrapRouteLayer = HttpRouter.add(
  "POST",
  "/api/auth/github/bootstrap",
  Effect.gen(function* () {
    const { userId } = yield* resolveV3RequestContext;

    const payload = yield* HttpServerRequest.schemaBodyJson(GitHubBootstrapInput).pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Invalid GitHub bootstrap payload.",
            status: 400,
            cause,
          }),
      ),
    );

    const githubIdentity = yield* GitHubIdentityService;
    const profile = yield* githubIdentity
      .fetchUser({ accessToken: payload.accessToken })
      .pipe(Effect.mapError(githubIdentityErrorToAuthError));

    const secretStore = yield* ServerSecretStore;
    const encKey = yield* secretStore
      .getOrCreateRandom(GITHUB_TOKEN_ENCRYPTION_KEY_NAME, GITHUB_TOKEN_ENCRYPTION_KEY_BYTES)
      .pipe(
        Effect.mapError(
          (cause) =>
            new AuthError({
              message: "Failed to access token encryption key.",
              status: 500,
              cause,
            }),
        ),
      );
    const encrypted = packGitHubEncryptedToken(payload.accessToken, encKey);

    const users = yield* UserRepository;
    const now = yield* DateTime.now;
    yield* users
      .setGitHubToken({
        userId: userId as UserId,
        githubUsername: profile.login,
        githubAccessTokenEnc: encrypted.ciphertext,
        githubTokenEncIv: encrypted.iv,
        githubScopes: payload.scopes.join(","),
        now,
      })
      .pipe(
        Effect.mapError(
          (cause) =>
            new AuthError({
              message: "Failed to persist GitHub connection.",
              status: 500,
              cause,
            }),
        ),
      );

    const body: GitHubBootstrapResult = { connected: true, username: profile.login };
    return HttpServerResponse.jsonUnsafe(Schema.encodeSync(GitHubBootstrapResult)(body), {
      status: 200,
    });
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);

export const githubDisconnectRouteLayer = HttpRouter.add(
  "POST",
  "/api/auth/github/disconnect",
  Effect.gen(function* () {
    const users = yield* UserRepository;
    const { userId } = yield* resolveV3RequestContext;
    const now = yield* DateTime.now;
    yield* users
      .clearGitHubToken({ userId, now })
      .pipe(Effect.mapError(toInternalAuthError("Failed to clear GitHub connection.")));
    const body: GitHubDisconnectResult = { disconnected: true };
    return HttpServerResponse.jsonUnsafe(Schema.encodeSync(GitHubDisconnectResult)(body), {
      status: 200,
    });
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);
