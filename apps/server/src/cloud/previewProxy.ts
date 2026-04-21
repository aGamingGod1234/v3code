// V3 Phase 8 — Cloud env preview proxy.
//
// Mounts `/preview/:threadId/*` so the V3 web app can iframe the cloud-
// hosted dev server without exposing docker networking to the public
// internet. The proxy:
//
//   1. Authenticates the current V3 session.
//   2. Verifies the caller owns the cloud chat (same user id on the
//      workspace metadata).
//   3. Resolves a live container origin via `resolvePreviewTarget`.
//   4. Forwards the request over native `fetch()` and streams the
//      response body back to the browser.
//
// When cloud env is disabled, the route still exists but short-circuits
// with 503 so browsers get a stable error shape rather than a 404.

import { Effect, Option } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { AuthError, ServerAuth } from "../auth/Services/ServerAuth.ts";
import { respondToAuthError } from "../auth/http.ts";
import { ServerConfig } from "../config.ts";
import { DeviceRepository } from "../identity/Services/DeviceRepository.ts";
import { UserContextResolver } from "../identity/Services/UserContextResolver.ts";
import { ContainerManager } from "./Services/ContainerManager.ts";
import type { ThreadId } from "@v3tools/contracts";

const PREVIEW_PREFIX = "/preview/";

const toInternalAuthError = (message: string) => (cause: unknown) =>
  new AuthError({
    message,
    status: 500,
    cause,
  });

function extractThreadIdAndRest(pathname: string): { threadId: string; rest: string } | null {
  if (!pathname.startsWith(PREVIEW_PREFIX)) return null;
  const remainder = pathname.slice(PREVIEW_PREFIX.length);
  const slash = remainder.indexOf("/");
  if (slash === -1) {
    return remainder.length === 0 ? null : { threadId: remainder, rest: "/" };
  }
  const threadId = remainder.slice(0, slash);
  if (threadId.length === 0) return null;
  const rest = remainder.slice(slash);
  return { threadId, rest: rest.length === 0 ? "/" : rest };
}

export const cloudPreviewProxyRouteLayer = HttpRouter.add(
  "*",
  `${PREVIEW_PREFIX}*`,
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    if (config.mode !== "server-node" || !config.cloudEnvEnabled) {
      return HttpServerResponse.text("Cloud preview is not enabled.", { status: 503 });
    }

    const request = yield* HttpServerRequest.HttpServerRequest;
    const urlOpt = HttpServerRequest.toURL(request);
    if (Option.isNone(urlOpt)) {
      return HttpServerResponse.text("Bad Request", { status: 400 });
    }
    const url = urlOpt.value;
    const parsed = extractThreadIdAndRest(url.pathname);
    if (!parsed) {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }

    const serverAuth = yield* ServerAuth;
    const users = yield* UserContextResolver;
    const devices = yield* DeviceRepository;
    const session = yield* serverAuth.authenticateHttpRequest(request);
    const userContext = yield* users
      .resolve(session.sessionId)
      .pipe(Effect.mapError(toInternalAuthError("Failed to resolve the V3 device context.")));
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
    if (Option.isNone(currentDevice) || !currentDevice.value.approved) {
      return yield* new AuthError({
        message: "Approve this device before opening cloud previews.",
        status: 403,
      });
    }

    const containers = yield* ContainerManager;
    const threadId = parsed.threadId as ThreadId;
    const metadataOpt = yield* containers
      .getWorkspaceMetadata(threadId)
      .pipe(Effect.mapError(toInternalAuthError("Failed to load cloud environment metadata.")));
    if (Option.isNone(metadataOpt) || metadataOpt.value.userId !== userContext.value.userId) {
      return HttpServerResponse.text("Not Found", { status: 404 });
    }
    if (metadataOpt.value.endedAt) {
      return HttpServerResponse.text("Cloud environment has ended.", { status: 410 });
    }

    const previewOpt = yield* containers
      .resolvePreviewTarget(threadId)
      .pipe(Effect.mapError(toInternalAuthError("Failed to resolve preview target.")));
    if (Option.isNone(previewOpt)) {
      return HttpServerResponse.text(
        "No dev server is currently listening inside this cloud environment.",
        { status: 504 },
      );
    }

    const targetUrl = new URL(previewOpt.value.origin);
    targetUrl.pathname = parsed.rest;
    targetUrl.search = url.search;

    const webRequest = yield* HttpServerRequest.toWeb(request).pipe(
      Effect.mapError(toInternalAuthError("Failed to translate preview request.")),
    );
    const forwardHeaders = new Headers();
    for (const [key, value] of webRequest.headers) {
      const lower = key.toLowerCase();
      if (
        lower === "host" ||
        lower === "connection" ||
        lower === "content-length" ||
        lower === "transfer-encoding" ||
        lower === "cookie"
      ) {
        continue;
      }
      forwardHeaders.set(key, value);
    }
    forwardHeaders.set("x-v3-cloud-thread", String(threadId));

    const upstreamBody = yield* Effect.promise(async () =>
      webRequest.method === "GET" || webRequest.method === "HEAD"
        ? undefined
        : await webRequest.arrayBuffer().catch(() => undefined),
    );

    const upstreamResponse = yield* Effect.tryPromise({
      try: () =>
        fetch(targetUrl.toString(), {
          method: webRequest.method,
          headers: forwardHeaders,
          ...(upstreamBody ? { body: upstreamBody } : {}),
          redirect: "manual",
        }),
      catch: (cause) =>
        new AuthError({
          message: cause instanceof Error ? cause.message : "Failed to reach the cloud dev server.",
          status: 502,
          cause,
        }),
    });

    const responseHeaders: Record<string, string> = {};
    upstreamResponse.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (
        lower === "connection" ||
        lower === "keep-alive" ||
        lower === "transfer-encoding" ||
        lower === "content-length"
      ) {
        return;
      }
      responseHeaders[key] = value;
    });
    const bodyBuffer = yield* Effect.promise(async () =>
      upstreamResponse.arrayBuffer().catch(() => new ArrayBuffer(0)),
    );

    return HttpServerResponse.uint8Array(new Uint8Array(bodyBuffer), {
      status: upstreamResponse.status,
      headers: responseHeaders,
    });
  }).pipe(Effect.catchTag("AuthError", respondToAuthError)),
);
