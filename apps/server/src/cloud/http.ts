// V3 Phase 8 — Cloud env HTTP surface.
//
// Every route requires an authenticated V3 session and an approved
// device — same access model as `/api/v3/devices`. The handlers
// delegate into `CloudEnvService` and translate its tagged errors
// into HTTP status codes:
//
//   not-enabled         → 404  ("feature off" surfaces as "not found"
//                                so the UI can hide the Cloud host
//                                option without a special flag)
//   docker-unavailable  → 503
//   github-not-linked   → 409
//   repo-access         → 502
//   limit-reached       → 429
//   container-failure   → 500
//   unknown             → 500

import {
  CloudContainerListResult,
  CloudEndChatInput,
  CloudEndChatResult,
  CloudGitHubBranchListResult,
  CloudGitHubRepoListResult,
  CloudProvisionInput,
  CloudProvisionResult,
  CloudPublicConfig,
} from "@v3tools/contracts";
import { Effect, Option, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { AuthError } from "../auth/Services/ServerAuth.ts";
import { respondToAuthError } from "../auth/http.ts";
import { resolveV3RequestContext } from "../identity/http.ts";
import { CloudEnvError } from "./Errors.ts";
import { CloudEnvService } from "./Services/CloudEnvService.ts";

const cloudErrorToAuthError = (err: CloudEnvError): AuthError => {
  // `AuthError.status` is narrowed to 400 | 401 | 403 | 500. The cloud
  // reasons we care about collapse onto this set like so:
  //
  //   not-enabled, limit-reached       → 403 (policy; feature off
  //                                          or capacity cap hit)
  //   github-not-linked                → 400 (client-fixable — connect
  //                                          GitHub and retry)
  //   docker-unavailable, repo-access,
  //   container-failure, unknown       → 500 (operator / upstream)
  //
  // The error body still carries the original `cause` so callers can
  // inspect the specific reason when they need richer UX.
  const status: 400 | 403 | 500 =
    err.reason === "not-enabled" || err.reason === "limit-reached"
      ? 403
      : err.reason === "github-not-linked"
        ? 400
        : 500;
  return new AuthError({
    message: err.message,
    status,
    cause: err,
  });
};

const requireCurrentActor = Effect.gen(function* () {
  const context = yield* resolveV3RequestContext;
  if (!context.currentDevice.approved) {
    return yield* new AuthError({
      message: "Approve this device before using Cloud env features.",
      status: 403,
    });
  }
  return {
    userId: context.userId,
    sourceDeviceId: context.currentDevice.id,
  } as const;
});

export const cloudConfigRouteLayer = HttpRouter.add(
  "GET",
  "/api/v3/cloud/config",
  Effect.gen(function* () {
    const cloud = yield* CloudEnvService;
    const actor = yield* requireCurrentActor;
    const view = yield* cloud.getPublicConfig(actor).pipe(Effect.mapError(cloudErrorToAuthError));
    const body: CloudPublicConfig = {
      enabled: view.enabled,
      dockerAvailable: view.dockerAvailable,
      githubConnected: view.githubConnected,
      baseImage: view.baseImage as CloudPublicConfig["baseImage"],
      maxContainers: view.maxContainers,
      containerCpuLimit: view.containerCpuLimit,
      containerMemoryMb: view.containerMemoryMb,
      containerDiskGb: view.containerDiskGb,
      containerMaxRuntimeHours: view.containerMaxRuntimeHours,
    };
    return HttpServerResponse.jsonUnsafe(Schema.encodeSync(CloudPublicConfig)(body), {
      status: 200,
    });
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);

export const cloudReposRouteLayer = HttpRouter.add(
  "GET",
  "/api/v3/cloud/repos",
  Effect.gen(function* () {
    const cloud = yield* CloudEnvService;
    const actor = yield* requireCurrentActor;
    const repos = yield* cloud.listRepos(actor).pipe(Effect.mapError(cloudErrorToAuthError));
    const body: CloudGitHubRepoListResult = { repos };
    return HttpServerResponse.jsonUnsafe(Schema.encodeSync(CloudGitHubRepoListResult)(body), {
      status: 200,
    });
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);

export const cloudBranchesRouteLayer = HttpRouter.add(
  "GET",
  "/api/v3/cloud/branches",
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const cloud = yield* CloudEnvService;
    const actor = yield* requireCurrentActor;
    const urlOpt = HttpServerRequest.toURL(request);
    const repo = Option.isSome(urlOpt) ? urlOpt.value.searchParams.get("repo") : null;
    if (!repo) {
      return yield* new AuthError({
        message: "Missing `repo` query parameter.",
        status: 400,
      });
    }
    const branches = yield* cloud
      .listBranches(actor, repo)
      .pipe(Effect.mapError(cloudErrorToAuthError));
    const body: CloudGitHubBranchListResult = { branches };
    return HttpServerResponse.jsonUnsafe(Schema.encodeSync(CloudGitHubBranchListResult)(body), {
      status: 200,
    });
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);

export const cloudContainersRouteLayer = HttpRouter.add(
  "GET",
  "/api/v3/cloud/containers",
  Effect.gen(function* () {
    const cloud = yield* CloudEnvService;
    const actor = yield* requireCurrentActor;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const urlOpt = HttpServerRequest.toURL(request);
    const includeEnded =
      Option.isSome(urlOpt) && urlOpt.value.searchParams.get("include_ended") === "true";
    const containers = yield* cloud
      .listContainersForUser(actor.userId, { includeEnded })
      .pipe(Effect.mapError(cloudErrorToAuthError));
    const view = yield* cloud.getPublicConfig(actor).pipe(Effect.mapError(cloudErrorToAuthError));
    const body: CloudContainerListResult = {
      containers,
      enabled: view.enabled,
      dockerAvailable: view.dockerAvailable,
    };
    return HttpServerResponse.jsonUnsafe(Schema.encodeSync(CloudContainerListResult)(body), {
      status: 200,
    });
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);

export const cloudProvisionRouteLayer = HttpRouter.add(
  "POST",
  "/api/v3/cloud/provision",
  Effect.gen(function* () {
    const cloud = yield* CloudEnvService;
    const actor = yield* requireCurrentActor;
    const payload = yield* HttpServerRequest.schemaBodyJson(CloudProvisionInput).pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Invalid provision payload.",
            status: 400,
            cause,
          }),
      ),
    );
    const result = yield* cloud
      .provision(payload, actor)
      .pipe(Effect.mapError(cloudErrorToAuthError));
    const encoded = Schema.encodeSync(CloudProvisionResult)(result);
    return HttpServerResponse.jsonUnsafe(encoded, { status: 200 });
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);

export const cloudEndChatRouteLayer = HttpRouter.add(
  "POST",
  "/api/v3/cloud/end",
  Effect.gen(function* () {
    const cloud = yield* CloudEnvService;
    const actor = yield* requireCurrentActor;
    const payload = yield* HttpServerRequest.schemaBodyJson(CloudEndChatInput).pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Invalid end-chat payload.",
            status: 400,
            cause,
          }),
      ),
    );
    const result = yield* cloud.end(payload, actor).pipe(Effect.mapError(cloudErrorToAuthError));
    return HttpServerResponse.jsonUnsafe(Schema.encodeSync(CloudEndChatResult)(result), {
      status: 200,
    });
  }).pipe(Effect.catchTag("AuthError", (error) => respondToAuthError(error))),
);
