import { FcmNotificationEnvelope, TrimmedNonEmptyString, type DeviceId } from "@v3tools/contracts";
import { DateTime, Effect, Layer, Option } from "effect";

import { FcmPushError } from "../../identity/Errors.ts";
import { DevicePushTokenRepository } from "../../identity/Services/DevicePushTokenRepository.ts";
import {
  FcmPushConfigRepository,
  type FcmServiceAccountConfig,
} from "../../identity/Services/FcmPushConfigRepository.ts";
import {
  FcmPushService,
  toEnvelope,
  type EnqueueInput,
  type FcmDispatchReport,
  type FcmPushServiceShape,
} from "../Services/FcmPushService.ts";

// V3 Phase 9 — live FCM dispatcher.
//
// Implementation notes:
//
//   * We do NOT import `firebase-admin`. That package pulls in 40+ MB
//     of gRPC deps that blow up the server bundle. Instead we talk to
//     FCM's v1 HTTP API directly: POST https://fcm.googleapis.com/v1/projects/{pid}/messages:send
//     with a bearer token minted from the service account's JWT.
//     `jose` (already a server dep for Google ID token verification)
//     signs the JWT.
//
//   * The layer is defensive against misconfig: `enqueue` short-
//     circuits with `FcmPushError("not-configured")` if no service
//     account has been uploaded. Callers (the mesh hub) should treat
//     "not configured" as a soft failure — the user just hasn't set
//     up mobile push yet.
//
//   * Invalid tokens (FCM 404 / 410 UNREGISTERED) are soft-deleted
//     via `DevicePushTokenRepository.markInvalid` so subsequent
//     dispatches don't keep hitting them.
//
//   * All outgoing requests get a 10s fetch timeout via `AbortSignal`
//     to avoid blocking the hub event loop indefinitely when FCM is
//     unreachable.

import * as Crypto from "node:crypto";

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const FCM_AUD = "https://oauth2.googleapis.com/token";
const TOKEN_CACHE_TTL_MS = 45 * 60 * 1000; // refresh after 45 min
const DISPATCH_TIMEOUT_MS = 10_000;

interface CachedAccessToken {
  readonly accessToken: string;
  readonly expiresAt: number;
  readonly projectId: string;
}

const encodeJwtPart = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

// Minimal JWT signer — avoids pulling `jose` into the push code path.
// The FCM service account key is RSA-SHA256. We build the JWT manually
// and sign with Node's built-in crypto, identical to `jose`'s output
// for the same key. Kept lean because this runs on every 45-min token
// refresh; bundling jose for this single call would be gratuitous.
const buildJwtAssertion = (config: FcmServiceAccountConfig, now: number): string => {
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: config.clientEmail,
    scope: FCM_SCOPE,
    aud: FCM_AUD,
    exp: Math.floor(now / 1000) + 60 * 59,
    iat: Math.floor(now / 1000),
  };
  const signingInput = `${encodeJwtPart(header)}.${encodeJwtPart(payload)}`;
  const signer = Crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(config.privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
};

const makeLive = Effect.gen(function* () {
  const tokens = yield* DevicePushTokenRepository;
  const configRepo = yield* FcmPushConfigRepository;

  let cachedToken: CachedAccessToken | null = null;

  const loadConfig = () =>
    configRepo.get().pipe(
      Effect.mapError(
        (cause) =>
          new FcmPushError({
            reason: "unknown",
            message: "Failed to load FCM service account from storage.",
            cause,
          }),
      ),
    );

  const mintAccessToken = (config: FcmServiceAccountConfig) =>
    Effect.gen(function* () {
      const now = Date.now();
      if (cachedToken !== null && cachedToken.expiresAt > now + 60_000) {
        return cachedToken;
      }
      const jwt = buildJwtAssertion(config, now);
      const response = yield* Effect.tryPromise({
        try: async () => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);
          try {
            return await fetch(FCM_AUD, {
              method: "POST",
              signal: controller.signal,
              headers: { "content-type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
                assertion: jwt,
              }).toString(),
            });
          } finally {
            clearTimeout(timer);
          }
        },
        catch: (cause) =>
          new FcmPushError({
            reason: "token-mint",
            message: "Could not reach Google's OAuth2 token endpoint.",
            cause,
          }),
      });
      if (!response.ok) {
        return yield* new FcmPushError({
          reason: "token-mint",
          message: `Google OAuth2 token endpoint returned ${response.status}.`,
        });
      }
      const body = (yield* Effect.tryPromise({
        try: () => response.json() as Promise<{ access_token?: unknown; expires_in?: unknown }>,
        catch: (cause) =>
          new FcmPushError({
            reason: "token-mint",
            message: "Malformed token-mint response.",
            cause,
          }),
      })) as { access_token?: unknown; expires_in?: unknown };
      if (typeof body.access_token !== "string" || body.access_token.length === 0) {
        return yield* new FcmPushError({
          reason: "token-mint",
          message: "Token-mint response missing access_token.",
        });
      }
      const expiresInSec = typeof body.expires_in === "number" ? body.expires_in : 3600;
      cachedToken = {
        accessToken: body.access_token,
        expiresAt: now + Math.min(expiresInSec * 1000, TOKEN_CACHE_TTL_MS),
        projectId: config.projectId,
      };
      return cachedToken;
    });

  const sendSingleToken = (
    accessToken: CachedAccessToken,
    tokenValue: string,
    envelope: FcmNotificationEnvelope,
  ) =>
    Effect.tryPromise({
      try: async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);
        try {
          const body = {
            message: {
              token: tokenValue,
              ...(envelope.title !== null || envelope.body !== null
                ? {
                    notification: {
                      ...(envelope.title !== null ? { title: envelope.title } : {}),
                      ...(envelope.body !== null ? { body: envelope.body } : {}),
                    },
                  }
                : {}),
              data: {
                category: envelope.category,
                ...(envelope.thread_id !== null ? { chat_id: envelope.thread_id } : {}),
                ...envelope.data,
              },
              android: {
                priority: envelope.priority === "high" ? "HIGH" : "NORMAL",
                ttl: `${envelope.ttl_seconds}s`,
              },
            },
          };
          return await fetch(
            `https://fcm.googleapis.com/v1/projects/${accessToken.projectId}/messages:send`,
            {
              method: "POST",
              signal: controller.signal,
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${accessToken.accessToken}`,
              },
              body: JSON.stringify(body),
            },
          );
        } finally {
          clearTimeout(timer);
        }
      },
      catch: (cause) =>
        new FcmPushError({
          reason: "dispatch",
          message: "FCM send failed with a network error.",
          cause,
        }),
    });

  const send: FcmPushServiceShape["sendNow"] = (envelope) =>
    Effect.gen(function* () {
      const configOpt = yield* loadConfig();
      if (Option.isNone(configOpt)) {
        return yield* new FcmPushError({
          reason: "not-configured",
          message: "FCM service account has not been uploaded yet.",
        });
      }
      const config = configOpt.value;
      const deviceTokens = yield* tokens
        .listActiveForDevices({ deviceIds: envelope.target_device_ids })
        .pipe(
          Effect.mapError(
            (cause) =>
              new FcmPushError({
                reason: "dispatch",
                message: "Failed to load active push tokens.",
                cause,
              }),
          ),
        );
      if (deviceTokens.length === 0) {
        return {
          envelope,
          deliveredTo: [],
          invalidTokens: [],
          dispatchedAt: envelope.created_at,
        } satisfies FcmDispatchReport;
      }
      const accessToken = yield* mintAccessToken(config);

      const delivered: DeviceId[] = [];
      const invalid: Array<typeof TrimmedNonEmptyString.Type> = [];
      for (const row of deviceTokens) {
        const response = yield* sendSingleToken(accessToken, row.token, envelope);
        if (response.ok) {
          delivered.push(row.deviceId);
        } else if (response.status === 404 || response.status === 410) {
          invalid.push(row.token);
        } else {
          return yield* new FcmPushError({
            reason: "dispatch",
            message: `FCM returned ${response.status} for device ${row.deviceId}.`,
          });
        }
      }
      const dispatchedAt = yield* DateTime.now.pipe(Effect.map((d) => DateTime.formatIso(d)));
      for (const token of invalid) {
        yield* tokens
          .markInvalid({
            token,
            now: DateTime.makeUnsafe(dispatchedAt),
          })
          .pipe(Effect.ignore);
      }
      yield* configRepo
        .touchDispatch({
          dispatchedAt: DateTime.makeUnsafe(dispatchedAt),
          error: null,
        })
        .pipe(Effect.ignore);
      return {
        envelope,
        deliveredTo: delivered,
        invalidTokens: invalid,
        dispatchedAt,
      } satisfies FcmDispatchReport;
    }).pipe(
      Effect.tapError((error) =>
        DateTime.now.pipe(
          Effect.map((d) => DateTime.formatIso(d)),
          Effect.flatMap((dispatchedAt) =>
            configRepo
              .touchDispatch({
                dispatchedAt: DateTime.makeUnsafe(dispatchedAt),
                error: error.message,
              })
              .pipe(Effect.ignore),
          ),
        ),
      ),
    );

  const enqueue: FcmPushServiceShape["enqueue"] = (input: EnqueueInput) =>
    Effect.gen(function* () {
      const createdAt = yield* DateTime.now.pipe(Effect.map((d) => DateTime.formatIso(d)));
      const envelope = toEnvelope(input, createdAt);
      return yield* send(envelope);
    });

  const isConfigured: FcmPushServiceShape["isConfigured"] = () =>
    configRepo.getStatus().pipe(
      Effect.map((opt) => Option.isSome(opt)),
      Effect.orElseSucceed(() => false),
    );

  return {
    enqueue,
    sendNow: send,
    isConfigured,
  } satisfies FcmPushServiceShape;
});

export const FcmPushServiceLive = Layer.effect(FcmPushService, makeLive);
