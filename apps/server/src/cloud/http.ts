import {
  CloudChatStatus,
  CloudChatStatusInput,
  CloudCreateChatInput,
  CloudCreateChatResult,
  CloudEndChatInput,
  CloudEndChatResult,
  CloudGitHubBranchListResponse,
  CloudGitHubRepoListResponse,
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  ProjectId,
  ThreadId,
} from "@v3tools/contracts";
import { Cause, Effect, Option, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { AuthError, ServerAuth } from "../auth/Services/ServerAuth.ts";
import { respondToAuthError } from "../auth/http.ts";
import { ServerConfig } from "../config.ts";
import { DeviceRepository } from "../identity/Services/DeviceRepository.ts";
import { UserContextResolver } from "../identity/Services/UserContextResolver.ts";
import { UserRepository } from "../identity/Services/UserRepository.ts";
import { OrchestrationEngineService } from "../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import { ProviderService } from "../provider/Services/ProviderService.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { ContainerManager } from "./Services/ContainerManager.ts";
import {
  loadGitHubAccessTokenForUser,
  listGitHubBranchesForUser,
  listGitHubReposForUser,
} from "./GitHubAppAuth.ts";

const parsePositiveInt = (value: string | null | undefined, fallback: number): number => {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const toInternalAuthError = (message: string) => (cause: unknown) =>
  new AuthError({
    message,
    status: 500,
    cause,
  });

const toGitHubAuthError = (cause: unknown) => {
  const message =
    cause instanceof Error ? cause.message : "Failed to reach GitHub for this V3 account.";
  const status = message.toLowerCase().includes("not connected") ? 409 : 502;
  return new AuthError({
    message,
    status,
    cause,
  });
};

const resolveApprovedCloudUserContext = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
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
      message: "Approve this device before using Cloud environments.",
      status: 403,
    });
  }

  return {
    currentDevice: currentDevice.value,
    userId: userContext.value.userId,
  } as const;
});

function mapProviderSessionStatus(
  status: "connecting" | "ready" | "running" | "error" | "closed",
): "starting" | "ready" | "running" | "error" | "stopped" {
  switch (status) {
    case "connecting":
      return "starting";
    case "ready":
      return "ready";
    case "running":
      return "running";
    case "error":
      return "error";
    case "closed":
    default:
      return "stopped";
  }
}

const requireCloudEnabled = Effect.gen(function* () {
  const config = yield* ServerConfig;
  if (config.mode !== "server-node" || !config.cloudEnvEnabled) {
    return yield* new AuthError({
      message: "Cloud environments are not enabled on this server node.",
      status: 503,
    });
  }
  return config;
});

export const cloudGitHubReposRouteLayer = HttpRouter.add(
  "GET",
  "/api/v3/cloud/github/repos",
  Effect.gen(function* () {
    const { userId } = yield* resolveApprovedCloudUserContext;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    const query = Option.isSome(url)
      ? (url.value.searchParams.get("query") ?? undefined)
      : undefined;
    const page = Option.isSome(url) ? parsePositiveInt(url.value.searchParams.get("page"), 1) : 1;
    const perPage = Option.isSome(url)
      ? parsePositiveInt(url.value.searchParams.get("perPage"), 25)
      : 25;

    const result = yield* listGitHubReposForUser({
      userId,
      ...(query !== undefined ? { query } : {}),
      page,
      perPage,
    }).pipe(Effect.mapError(toGitHubAuthError));

    return HttpServerResponse.jsonUnsafe(Schema.encodeSync(CloudGitHubRepoListResponse)(result), {
      status: 200,
    });
  }).pipe(Effect.catchTag("AuthError", respondToAuthError)),
);

export const cloudGitHubBranchesRouteLayer = HttpRouter.add(
  "GET",
  "/api/v3/cloud/github/branches",
  Effect.gen(function* () {
    const { userId } = yield* resolveApprovedCloudUserContext;
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = HttpServerRequest.toURL(request);
    const repoFullName = Option.isSome(url)
      ? (url.value.searchParams.get("repoFullName")?.trim() ?? "")
      : "";
    if (repoFullName.length === 0) {
      return yield* new AuthError({
        message: "repoFullName is required.",
        status: 400,
      });
    }
    const page = Option.isSome(url) ? parsePositiveInt(url.value.searchParams.get("page"), 1) : 1;
    const perPage = Option.isSome(url)
      ? parsePositiveInt(url.value.searchParams.get("perPage"), 50)
      : 50;

    const result = yield* listGitHubBranchesForUser({
      userId,
      repoFullName,
      page,
      perPage,
    }).pipe(Effect.mapError(toGitHubAuthError));

    return HttpServerResponse.jsonUnsafe(Schema.encodeSync(CloudGitHubBranchListResponse)(result), {
      status: 200,
    });
  }).pipe(Effect.catchTag("AuthError", respondToAuthError)),
);

export const cloudCreateChatRouteLayer = HttpRouter.add(
  "POST",
  "/api/v3/cloud/chats",
  Effect.gen(function* () {
    yield* requireCloudEnabled;

    const { userId } = yield* resolveApprovedCloudUserContext;
    const payload = yield* HttpServerRequest.schemaBodyJson(CloudCreateChatInput).pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Invalid cloud chat payload.",
            status: 400,
            cause,
          }),
      ),
    );

    const users = yield* UserRepository;
    const serverSettings = yield* ServerSettingsService;
    const containers = yield* ContainerManager;
    const orchestration = yield* OrchestrationEngineService;
    const providerService = yield* ProviderService;
    const user = yield* users.getById({ id: userId }).pipe(
      Effect.mapError(toInternalAuthError("Failed to load the current V3 user.")),
      Effect.flatMap((record) =>
        Option.isSome(record)
          ? Effect.succeed(record.value)
          : Effect.fail(
              new AuthError({
                message: "This V3 user is no longer registered on the server node.",
                status: 403,
              }),
            ),
      ),
    );

    const accessToken = yield* loadGitHubAccessTokenForUser(userId).pipe(
      Effect.mapError(toGitHubAuthError),
    );

    const threadId = ThreadId.make(crypto.randomUUID());
    const projectId = ProjectId.make(crypto.randomUUID());
    const createdAt = new Date().toISOString();
    const requestedTitle = payload.title?.trim() ?? "";
    const projectTitle = payload.repoFullName;
    const threadTitle =
      requestedTitle.length > 0 ? requestedTitle : `${payload.repoFullName} (${payload.branch})`;
    const defaultModelSelection = yield* serverSettings.getSettings.pipe(
      Effect.map((settings) => settings.textGenerationModelSelection),
    );

    const state = {
      workspaceCreated: false,
      projectCreated: false,
      threadCreated: false,
    };

    const rollback = Effect.gen(function* () {
      if (state.threadCreated) {
        yield* orchestration
          .dispatch({
            type: "thread.delete",
            commandId: CommandId.make(`server:cloud-thread-rollback:${crypto.randomUUID()}`),
            threadId,
          })
          .pipe(Effect.catch(() => Effect.void));
      }
      if (state.projectCreated) {
        yield* orchestration
          .dispatch({
            type: "project.delete",
            commandId: CommandId.make(`server:cloud-project-rollback:${crypto.randomUUID()}`),
            projectId,
            force: true,
          })
          .pipe(Effect.catch(() => Effect.void));
      }
      if (state.workspaceCreated) {
        yield* containers.stopThreadEnvironment(threadId).pipe(Effect.catch(() => Effect.void));
      }
    });

    const runCreate = Effect.gen(function* () {
      const workspace = yield* containers
        .createWorkspace({
          threadId,
          userId,
          repoFullName: payload.repoFullName,
          branch: payload.branch,
          gitUserName: user.displayName?.trim() || user.email,
          gitUserEmail: user.email,
          accessToken,
          createdAt,
        })
        .pipe(
          Effect.mapError(
            (cause) =>
              new AuthError({
                message: cause.message,
                status: 500,
                cause,
              }),
          ),
        );
      state.workspaceCreated = true;

      yield* orchestration
        .dispatch({
          type: "project.create",
          commandId: CommandId.make(`server:cloud-project:${crypto.randomUUID()}`),
          projectId,
          title: projectTitle as never,
          workspaceRoot: workspace.repoDir as never,
          createWorkspaceRootIfMissing: false,
          defaultModelSelection,
          createdAt,
        })
        .pipe(Effect.mapError(toInternalAuthError("Failed to create the cloud project shell.")));
      state.projectCreated = true;

      yield* orchestration
        .dispatch({
          type: "thread.create",
          commandId: CommandId.make(`server:cloud-thread:${crypto.randomUUID()}`),
          threadId,
          projectId,
          title: threadTitle as never,
          hostDeviceId: null,
          modelSelection: defaultModelSelection,
          sessionMode: "single",
          orchestratorConfig: null,
          runtimeMode: DEFAULT_RUNTIME_MODE,
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          branch: payload.branch as never,
          worktreePath: workspace.repoDir as never,
          createdAt,
        })
        .pipe(Effect.mapError(toInternalAuthError("Failed to create the cloud thread shell.")));
      state.threadCreated = true;

      const providerSession = yield* providerService
        .startSession(threadId, {
          threadId,
          provider: defaultModelSelection.provider,
          cwd: workspace.repoDir,
          modelSelection: defaultModelSelection,
          runtimeMode: DEFAULT_RUNTIME_MODE,
        })
        .pipe(
          Effect.mapError(
            (cause) =>
              new AuthError({
                message:
                  cause instanceof Error
                    ? cause.message
                    : "Failed to start the cloud provider session.",
                status: 500,
                cause,
              }),
          ),
        );

      yield* orchestration
        .dispatch({
          type: "thread.session.set",
          commandId: CommandId.make(`server:cloud-session:${crypto.randomUUID()}`),
          threadId,
          session: {
            threadId,
            status: mapProviderSessionStatus(providerSession.status),
            providerName: providerSession.provider,
            runtimeMode: DEFAULT_RUNTIME_MODE,
            activeTurnId: null,
            lastError: providerSession.lastError ?? null,
            updatedAt: providerSession.updatedAt,
          },
          createdAt: providerSession.updatedAt,
        })
        .pipe(Effect.mapError(toInternalAuthError("Failed to bind the cloud provider session.")));

      const body = {
        projectId,
        threadId,
        projectTitle: projectTitle as never,
        threadTitle: threadTitle as never,
        worktreePath: workspace.repoDir as never,
        hostDeviceId: null,
        repoFullName: payload.repoFullName as never,
        branch: payload.branch as never,
      } satisfies CloudCreateChatResult;
      return HttpServerResponse.jsonUnsafe(Schema.encodeSync(CloudCreateChatResult)(body), {
        status: 201,
      });
    });

    return yield* runCreate.pipe(
      Effect.onError((cause) =>
        rollback.pipe(
          Effect.andThen(Effect.logDebug("cloud create-chat rolled back", Cause.pretty(cause))),
          Effect.catch(() => Effect.void),
        ),
      ),
      Effect.catchTag("AuthError", respondToAuthError),
    );
  }),
);

export const cloudChatStatusRouteLayer = HttpRouter.add(
  "GET",
  "/api/v3/cloud/chat",
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const { userId } = yield* resolveApprovedCloudUserContext;
    const payload = yield* HttpServerRequest.schemaSearchParams(CloudChatStatusInput).pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Invalid cloud chat query.",
            status: 400,
            cause,
          }),
      ),
    );
    const containers = yield* ContainerManager;
    const metadataOpt = yield* containers
      .getWorkspaceMetadata(payload.threadId)
      .pipe(Effect.mapError(toInternalAuthError("Failed to load cloud environment metadata.")));
    if (Option.isNone(metadataOpt) || metadataOpt.value.userId !== userId) {
      return yield* new AuthError({
        message: "Cloud chat not found.",
        status: 404,
      });
    }
    const metadata = metadataOpt.value;
    const preview = yield* containers
      .resolvePreviewTarget(payload.threadId)
      .pipe(Effect.mapError(toInternalAuthError("Failed to resolve the cloud preview target.")));
    const status = metadata.endedAt ? "ended" : Option.isSome(preview) ? "running" : "starting";
    const startedAtMs = new Date(metadata.startedAt).getTime();
    const endedAtMs = metadata.endedAt ? new Date(metadata.endedAt).getTime() : Date.now();
    const body = {
      threadId: payload.threadId,
      repoFullName: metadata.repoFullName as never,
      branch: metadata.branch as never,
      status,
      previewUrl: Option.isSome(preview) ? (`/preview/${payload.threadId}/` as never) : null,
      startedAt: metadata.startedAt as never,
      endedAt: metadata.endedAt as never,
      uptimeSeconds: Number.isFinite(startedAtMs)
        ? Math.max(0, Math.floor((endedAtMs - startedAtMs) / 1_000))
        : 0,
      cpuCount: Math.max(1, Math.floor(config.cloudEnvContainerCpuLimit)),
      memoryMb: Math.max(256, config.cloudEnvContainerMemoryMb),
    } satisfies CloudChatStatus;

    return HttpServerResponse.jsonUnsafe(Schema.encodeSync(CloudChatStatus)(body), {
      status: 200,
    });
  }).pipe(Effect.catchTag("AuthError", respondToAuthError)),
);

export const cloudEndChatRouteLayer = HttpRouter.add(
  "POST",
  "/api/v3/cloud/chat/end",
  Effect.gen(function* () {
    const { userId } = yield* resolveApprovedCloudUserContext;
    const payload = yield* HttpServerRequest.schemaBodyJson(CloudEndChatInput).pipe(
      Effect.mapError(
        (cause) =>
          new AuthError({
            message: "Invalid cloud end-chat payload.",
            status: 400,
            cause,
          }),
      ),
    );
    const containers = yield* ContainerManager;
    const metadataOpt = yield* containers
      .getWorkspaceMetadata(payload.threadId)
      .pipe(Effect.mapError(toInternalAuthError("Failed to load cloud environment metadata.")));
    if (Option.isNone(metadataOpt) || metadataOpt.value.userId !== userId) {
      return yield* new AuthError({
        message: "Cloud chat not found.",
        status: 404,
      });
    }

    yield* containers
      .stopThreadEnvironment(payload.threadId)
      .pipe(Effect.mapError(toInternalAuthError("Failed to stop the cloud environment.")));

    const projection = yield* ProjectionSnapshotQuery;
    const threadOpt = yield* projection
      .getThreadShellById(payload.threadId)
      .pipe(Effect.mapError(toInternalAuthError("Failed to read cloud chat state.")));
    if (Option.isSome(threadOpt) && threadOpt.value.session) {
      const orchestration = yield* OrchestrationEngineService;
      yield* orchestration
        .dispatch({
          type: "thread.session.set",
          commandId: CommandId.make(`server:cloud-end:${crypto.randomUUID()}`),
          threadId: payload.threadId,
          session: {
            ...threadOpt.value.session,
            status: "stopped",
            activeTurnId: null,
            updatedAt: new Date().toISOString(),
          },
          createdAt: new Date().toISOString(),
        })
        .pipe(Effect.catch(() => Effect.void));
    }

    const body = {
      threadId: payload.threadId,
      ended: true,
    } satisfies CloudEndChatResult;
    return HttpServerResponse.jsonUnsafe(Schema.encodeSync(CloudEndChatResult)(body), {
      status: 200,
    });
  }).pipe(Effect.catchTag("AuthError", respondToAuthError)),
);
