import { Effect, Layer } from "effect";
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/unstable/http";

import { ServerConfig } from "./config.ts";
import {
  attachmentsRouteLayer,
  cloudModeStaticRouteLayer,
  otlpTracesProxyRouteLayer,
  projectFaviconRouteLayer,
  serverEnvironmentRouteLayer,
  staticAndDevRouteLayer,
  browserApiCorsLayer,
} from "./http.ts";
import { fixPath } from "./os-jank.ts";
import { websocketRpcRouteLayer } from "./ws.ts";
import { OpenLive } from "./open.ts";
import { PersistenceLive as SqlitePersistenceLayerLive } from "./persistence/Layers/PersistenceSelector.ts";
import { ServerLifecycleEventsLive } from "./serverLifecycleEvents.ts";
import { AnalyticsServiceLayerLive } from "./telemetry/Layers/AnalyticsService.ts";
import { makeEventNdjsonLogger } from "./provider/Layers/EventNdjsonLogger.ts";
import { ProviderSessionDirectoryLive } from "./provider/Layers/ProviderSessionDirectory.ts";
import { ProviderSessionRuntimeRepositoryLive } from "./persistence/Layers/ProviderSessionRuntime.ts";
import { makeCodexAdapterLive } from "./provider/Layers/CodexAdapter.ts";
import { makeClaudeAdapterLive } from "./provider/Layers/ClaudeAdapter.ts";
import { makeCursorAdapterLive } from "./provider/Layers/CursorAdapter.ts";
import { makeOpenCodeAdapterLive } from "./provider/Layers/OpenCodeAdapter.ts";
import { ProviderAdapterRegistryLive } from "./provider/Layers/ProviderAdapterRegistry.ts";
import { makeProviderServiceLive } from "./provider/Layers/ProviderService.ts";
import { ProviderSessionReaperLive } from "./provider/Layers/ProviderSessionReaper.ts";
import { CheckpointDiffQueryLive } from "./checkpointing/Layers/CheckpointDiffQuery.ts";
import { CheckpointStoreLive } from "./checkpointing/Layers/CheckpointStore.ts";
import { GitCoreLive } from "./git/Layers/GitCore.ts";
import { GitHubCliLive } from "./git/Layers/GitHubCli.ts";
import { GitStatusBroadcasterLive } from "./git/Layers/GitStatusBroadcaster.ts";
import { RoutingTextGenerationLive } from "./git/Layers/RoutingTextGeneration.ts";
import { TerminalManagerLive } from "./terminal/Layers/Manager.ts";
import { GitManagerLive } from "./git/Layers/GitManager.ts";
import { KeybindingsLive } from "./keybindings.ts";
import { ServerRuntimeStartup, ServerRuntimeStartupLive } from "./serverRuntimeStartup.ts";
import { OrchestrationReactorLive } from "./orchestration/Layers/OrchestrationReactor.ts";
import { RuntimeReceiptBusLive } from "./orchestration/Layers/RuntimeReceiptBus.ts";
import { ProviderRuntimeIngestionLive } from "./orchestration/Layers/ProviderRuntimeIngestion.ts";
import { ProviderCommandReactorLive } from "./orchestration/Layers/ProviderCommandReactor.ts";
import { CheckpointReactorLive } from "./orchestration/Layers/CheckpointReactor.ts";
import { ThreadDeletionReactorLive } from "./orchestration/Layers/ThreadDeletionReactor.ts";
import { ProviderRegistryLive } from "./provider/Layers/ProviderRegistry.ts";
import { ServerSettingsLive } from "./serverSettings.ts";
import { ProjectFaviconResolverLive } from "./project/Layers/ProjectFaviconResolver.ts";
import { RepositoryIdentityResolverLive } from "./project/Layers/RepositoryIdentityResolver.ts";
import { WorkspaceEntriesLive } from "./workspace/Layers/WorkspaceEntries.ts";
import { WorkspaceFileSystemLive } from "./workspace/Layers/WorkspaceFileSystem.ts";
import { WorkspacePathsLive } from "./workspace/Layers/WorkspacePaths.ts";
import { ProjectSetupScriptRunnerLive } from "./project/Layers/ProjectSetupScriptRunner.ts";
import { ObservabilityLive } from "./observability/Layers/Observability.ts";
import { ServerEnvironmentLive } from "./environment/Layers/ServerEnvironment.ts";
import {
  authBearerBootstrapRouteLayer,
  authBootstrapRouteLayer,
  authClientsRevokeOthersRouteLayer,
  authClientsRevokeRouteLayer,
  authClientsRouteLayer,
  authPairingLinksRevokeRouteLayer,
  authPairingLinksRouteLayer,
  authPairingCredentialRouteLayer,
  authSessionRouteLayer,
  authWebSocketTokenRouteLayer,
} from "./auth/http.ts";
import { ServerSecretStoreLive } from "./auth/Layers/ServerSecretStore.ts";
import { ServerAuthLive } from "./auth/Layers/ServerAuth.ts";
import {
  approveDeviceRouteLayer,
  githubAuthorizeRouteLayer,
  githubCallbackRouteLayer,
  githubConfigRouteLayer,
  githubDisconnectRouteLayer,
  githubStatusRouteLayer,
  googleAuthorizeRouteLayer,
  googleBootstrapRouteLayer,
  googleCallbackRouteLayer,
  googleConfigRouteLayer,
  googleTokenConsumeRouteLayer,
  googleTokenRefreshRouteLayer,
  listDevicesRouteLayer,
  removeDeviceRouteLayer,
} from "./identity/http.ts";
import {
  adminContainersRouteLayer,
  adminEventLogRouteLayer,
  adminLogsRouteLayer,
  adminSessionsRouteLayer,
  adminSummaryRouteLayer,
} from "./admin/http.ts";
import {
  adminFcmConfigDeleteRouteLayer,
  adminFcmConfigGetRouteLayer,
  adminFcmConfigUploadRouteLayer,
} from "./admin/fcmPushHttp.ts";
import { DeviceApprovalServiceLive } from "./identity/Layers/DeviceApprovalService.ts";
import { DevicePushTokenRepositoryLive } from "./identity/Layers/DevicePushTokenRepository.ts";
import { DeviceRepositoryLive } from "./identity/Layers/DeviceRepository.ts";
import { DeviceSessionRepositoryLive } from "./identity/Layers/DeviceSessionRepository.ts";
import { FcmPushConfigRepositoryLive } from "./identity/Layers/FcmPushConfigRepository.ts";
import { GitHubIdentityServiceLive } from "./identity/Layers/GitHubIdentityService.ts";
import { GoogleTokenHandoffStoreLive } from "./identity/Layers/GoogleTokenHandoffStore.ts";
import { GoogleIdentityServiceLive } from "./identity/Layers/GoogleIdentityService.ts";
import { UserContextResolverLive } from "./identity/Layers/UserContextResolver.ts";
import { UserRepositoryLive } from "./identity/Layers/UserRepository.ts";
import { ContainerManagerLive } from "./cloud/Layers/ContainerManager.ts";
import {
  cloudChatStatusRouteLayer,
  cloudCreateChatRouteLayer,
  cloudEndChatRouteLayer,
  cloudGitHubBranchesRouteLayer,
  cloudGitHubReposRouteLayer,
} from "./cloud/http.ts";
import { cloudPreviewProxyRouteLayer } from "./cloud/previewProxy.ts";
import { CloudLifecycleLive } from "./cloud/Layers/CloudLifecycle.ts";
import { ChatSubscriptionManagerLive } from "./mesh/Layers/ChatSubscriptionManager.ts";
import { DeviceRegistryLive } from "./mesh/Layers/DeviceRegistry.ts";
import { FcmPushServiceLive } from "./mesh/Layers/FcmPushService.ts";
import { MeshPublisherLive } from "./mesh/Layers/MeshPublisher.ts";
import { PromptRouterLive } from "./mesh/Layers/PromptRouter.ts";
import { PresenceBroadcasterLive } from "./mesh/Layers/PresenceBroadcaster.ts";
import { MeshEventIngestionLive } from "./orchestration/Layers/MeshEventIngestion.ts";
import { OrchestrationLayerLive } from "./orchestration/runtimeLayer.ts";
import {
  clearPersistedServerRuntimeState,
  makePersistedServerRuntimeState,
  persistServerRuntimeState,
} from "./serverRuntimeState.ts";
import {
  orchestrationDispatchRouteLayer,
  orchestrationSnapshotRouteLayer,
} from "./orchestration/http.ts";

const PtyAdapterLive = Layer.unwrap(
  Effect.gen(function* () {
    if (typeof Bun !== "undefined") {
      const BunPTY = yield* Effect.promise(() => import("./terminal/Layers/BunPTY.ts"));
      return BunPTY.layer;
    } else {
      const NodePTY = yield* Effect.promise(() => import("./terminal/Layers/NodePTY.ts"));
      return NodePTY.layer;
    }
  }),
);

const HttpServerLive = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    if (typeof Bun !== "undefined") {
      const BunHttpServer = yield* Effect.promise(
        () => import("@effect/platform-bun/BunHttpServer"),
      );
      return BunHttpServer.layer({
        port: config.port,
        ...(config.host ? { hostname: config.host } : {}),
      });
    } else {
      const [NodeHttpServer, NodeHttp] = yield* Effect.all([
        Effect.promise(() => import("@effect/platform-node/NodeHttpServer")),
        Effect.promise(() => import("node:http")),
      ]);
      return NodeHttpServer.layer(NodeHttp.createServer, {
        host: config.host,
        port: config.port,
      });
    }
  }),
);

const PlatformServicesLive = Layer.unwrap(
  Effect.gen(function* () {
    if (typeof Bun !== "undefined") {
      const { layer } = yield* Effect.promise(() => import("@effect/platform-bun/BunServices"));
      return layer;
    } else {
      const { layer } = yield* Effect.promise(() => import("@effect/platform-node/NodeServices"));
      return layer;
    }
  }),
);

const ReactorLayerLive = Layer.empty.pipe(
  Layer.provideMerge(OrchestrationReactorLive),
  Layer.provideMerge(ProviderRuntimeIngestionLive),
  Layer.provideMerge(ProviderCommandReactorLive),
  Layer.provideMerge(CheckpointReactorLive),
  Layer.provideMerge(ThreadDeletionReactorLive),
  Layer.provideMerge(RuntimeReceiptBusLive),
);

const CheckpointingLayerLive = Layer.empty.pipe(
  Layer.provideMerge(CheckpointDiffQueryLive),
  Layer.provideMerge(CheckpointStoreLive),
);

const ProviderSessionDirectoryLayerLive = ProviderSessionDirectoryLive.pipe(
  Layer.provide(ProviderSessionRuntimeRepositoryLive),
);

const ProviderLayerLive = Layer.unwrap(
  Effect.gen(function* () {
    const { providerEventLogPath } = yield* ServerConfig;
    const nativeEventLogger = yield* makeEventNdjsonLogger(providerEventLogPath, {
      stream: "native",
    });
    const canonicalEventLogger = yield* makeEventNdjsonLogger(providerEventLogPath, {
      stream: "canonical",
    });
    // V3 Phase 8 — Codex and Claude adapters consult ContainerManager
    // inside startSession to swap in the per-thread docker-exec wrapper
    // whenever the thread has a cloud workspace. Provided here so the
    // provider layer is self-contained.
    const codexAdapterLayer = makeCodexAdapterLive(
      nativeEventLogger ? { nativeEventLogger } : undefined,
    ).pipe(Layer.provide(ContainerManagerLive));
    const claudeAdapterLayer = makeClaudeAdapterLive(
      nativeEventLogger ? { nativeEventLogger } : undefined,
    ).pipe(Layer.provide(ContainerManagerLive));
    const openCodeAdapterLayer = makeOpenCodeAdapterLive(
      nativeEventLogger ? { nativeEventLogger } : undefined,
    );
    const cursorAdapterLayer = makeCursorAdapterLive(
      nativeEventLogger ? { nativeEventLogger } : undefined,
    );
    const adapterRegistryLayer = ProviderAdapterRegistryLive.pipe(
      Layer.provide(codexAdapterLayer),
      Layer.provide(claudeAdapterLayer),
      Layer.provide(openCodeAdapterLayer),
      Layer.provide(cursorAdapterLayer),
      Layer.provideMerge(ProviderSessionDirectoryLayerLive),
    );
    return makeProviderServiceLive(
      canonicalEventLogger ? { canonicalEventLogger } : undefined,
    ).pipe(
      Layer.provide(adapterRegistryLayer),
      Layer.provideMerge(ProviderSessionDirectoryLayerLive),
    );
  }),
);

const PersistenceLayerLive = Layer.empty.pipe(Layer.provideMerge(SqlitePersistenceLayerLive));

const GitManagerLayerLive = GitManagerLive.pipe(
  Layer.provideMerge(ProjectSetupScriptRunnerLive),
  Layer.provideMerge(GitCoreLive),
  Layer.provideMerge(GitHubCliLive),
  Layer.provideMerge(RoutingTextGenerationLive),
);

const GitLayerLive = Layer.empty.pipe(
  Layer.provideMerge(GitManagerLayerLive),
  Layer.provideMerge(GitStatusBroadcasterLive.pipe(Layer.provide(GitManagerLayerLive))),
  Layer.provideMerge(GitCoreLive),
);

const TerminalLayerLive = TerminalManagerLive.pipe(Layer.provide(PtyAdapterLive));

const WorkspaceEntriesLayerLive = WorkspaceEntriesLive.pipe(
  Layer.provide(WorkspacePathsLive),
  Layer.provideMerge(GitCoreLive),
);

const WorkspaceFileSystemLayerLive = WorkspaceFileSystemLive.pipe(
  Layer.provide(WorkspacePathsLive),
  Layer.provide(WorkspaceEntriesLayerLive),
);

const WorkspaceLayerLive = Layer.mergeAll(
  WorkspacePathsLive,
  WorkspaceEntriesLayerLive,
  WorkspaceFileSystemLayerLive,
);

const AuthLayerLive = ServerAuthLive.pipe(
  Layer.provideMerge(PersistenceLayerLive),
  Layer.provide(ServerSecretStoreLive),
);

// V3 identity layer (Phase 1+). Additive to AuthLayerLive; does not touch
// ServerAuth's existing shape. Provides Google ID-token verification, user /
// device repositories, and the device approval service + bus.
//
// P7 addition: the browser Google sign-in routes use `ServerSecretStore`
// to derive the short-lived OAuth flow signing key, so the same live
// secret-store layer the auth module uses is threaded in *and re-exposed*
// here via `provideMerge`. The auth module still scopes its own copy
// internally via `Layer.provide`, so the two layers are independent
// consumers of the same (idempotent) file-backed store.
const V3IdentityLayerLive = Layer.mergeAll(
  UserRepositoryLive,
  DeviceRepositoryLive,
  DeviceSessionRepositoryLive,
  // V3 Phase 9 — mobile push tokens + FCM service account config live
  // alongside the other V3 identity repositories so the mesh handlers
  // and admin routes share a single source of truth.
  DevicePushTokenRepositoryLive,
  FcmPushConfigRepositoryLive,
  GoogleIdentityServiceLive,
  GoogleTokenHandoffStoreLive,
  // V3 Phase 1e — GitHub identity for "Connect GitHub" in settings and
  // the P8 Cloud env container token minting. The Live layer falls back
  // to a `not-configured` stub when either env var is missing, so it's
  // safe to always merge.
  GitHubIdentityServiceLive,
  UserContextResolverLive.pipe(Layer.provide(DeviceSessionRepositoryLive)),
).pipe(Layer.provideMerge(PersistenceLayerLive), Layer.provideMerge(ServerSecretStoreLive));

const ProviderRuntimeLayerLive = ProviderSessionReaperLive.pipe(
  Layer.provideMerge(ProviderLayerLive),
  Layer.provideMerge(OrchestrationLayerLive),
);

const MeshLayerLive = Layer.mergeAll(
  PresenceBroadcasterLive,
  DeviceRegistryLive.pipe(Layer.provide(PresenceBroadcasterLive)),
  ChatSubscriptionManagerLive,
  PromptRouterLive,
  MeshEventIngestionLive,
  MeshPublisherLive.pipe(Layer.provide(ChatSubscriptionManagerLive)),
  // V3 Phase 9 — FCM dispatch depends on the V3 identity repositories
  // (push token repo + config repo). `V3IdentityLayerLive` is provided
  // below via `provideMerge`, so the FCM layer inherits both.
  FcmPushServiceLive,
).pipe(
  Layer.provideMerge(OrchestrationLayerLive),
  Layer.provideMerge(V3IdentityLayerLive),
  Layer.provideMerge(WorkspacePathsLive),
);

const DeviceApprovalLayerLive = DeviceApprovalServiceLive.pipe(
  Layer.provideMerge(V3IdentityLayerLive),
  Layer.provideMerge(MeshLayerLive),
);

// V3 Phase 8 — Cloud environment container manager. Depends on ServerConfig
// only, so it can be provided directly. CloudLifecycleLive owns the
// scheduled prune loop that reaps containers past `cloudEnvContainerMaxRuntimeHours`.
const CloudLayerLive = CloudLifecycleLive.pipe(Layer.provideMerge(ContainerManagerLive));

const RuntimeDependenciesLive = ReactorLayerLive.pipe(
  // Core Services
  Layer.provideMerge(CheckpointingLayerLive),
  Layer.provideMerge(GitLayerLive),
  Layer.provideMerge(ProviderRuntimeLayerLive),
  Layer.provideMerge(TerminalLayerLive),
  Layer.provideMerge(PersistenceLayerLive),
  Layer.provideMerge(KeybindingsLive),
  Layer.provideMerge(ProviderRegistryLive),
  Layer.provideMerge(ServerSettingsLive),
  Layer.provideMerge(WorkspaceLayerLive),
  Layer.provideMerge(MeshLayerLive),
  Layer.provideMerge(ProjectFaviconResolverLive),
  Layer.provideMerge(RepositoryIdentityResolverLive),
  Layer.provideMerge(ServerEnvironmentLive),
  Layer.provideMerge(AuthLayerLive),
  Layer.provideMerge(V3IdentityLayerLive),
  Layer.provideMerge(DeviceApprovalLayerLive),
  Layer.provideMerge(CloudLayerLive),

  // Misc.
  Layer.provideMerge(AnalyticsServiceLayerLive),
  Layer.provideMerge(OpenLive),
  Layer.provideMerge(ServerLifecycleEventsLive),
);

const RuntimeServicesLive = ServerRuntimeStartupLive.pipe(
  Layer.provideMerge(RuntimeDependenciesLive),
);

export const makeRoutesLayer = Layer.mergeAll(
  authBearerBootstrapRouteLayer,
  authBootstrapRouteLayer,
  authClientsRevokeOthersRouteLayer,
  authClientsRevokeRouteLayer,
  authClientsRouteLayer,
  authPairingLinksRevokeRouteLayer,
  authPairingLinksRouteLayer,
  authPairingCredentialRouteLayer,
  authSessionRouteLayer,
  authWebSocketTokenRouteLayer,
  // V3 Phase 2g — admin panel read-only endpoints. Always registered;
  // each route 404s outside server-node mode.
  adminContainersRouteLayer,
  adminEventLogRouteLayer,
  adminLogsRouteLayer,
  adminSessionsRouteLayer,
  adminSummaryRouteLayer,
  // V3 Phase 9 — FCM service account management endpoints for the
  // admin panel's "Mobile Push" tab.
  adminFcmConfigGetRouteLayer,
  adminFcmConfigUploadRouteLayer,
  adminFcmConfigDeleteRouteLayer,
  approveDeviceRouteLayer,
  githubAuthorizeRouteLayer,
  githubCallbackRouteLayer,
  githubConfigRouteLayer,
  githubDisconnectRouteLayer,
  githubStatusRouteLayer,
  googleAuthorizeRouteLayer,
  googleBootstrapRouteLayer,
  googleCallbackRouteLayer,
  googleConfigRouteLayer,
  googleTokenConsumeRouteLayer,
  googleTokenRefreshRouteLayer,
  listDevicesRouteLayer,
  removeDeviceRouteLayer,
  // V3 Phase 8 — Cloud environment routes. Always registered; each route
  // guards on `mode === "server-node" && cloudEnvEnabled` or replies 503 so
  // desktop / web never surface cloud options.
  cloudGitHubReposRouteLayer,
  cloudGitHubBranchesRouteLayer,
  cloudCreateChatRouteLayer,
  cloudChatStatusRouteLayer,
  cloudEndChatRouteLayer,
  cloudPreviewProxyRouteLayer,
  attachmentsRouteLayer,
  orchestrationDispatchRouteLayer,
  orchestrationSnapshotRouteLayer,
  otlpTracesProxyRouteLayer,
  projectFaviconRouteLayer,
  serverEnvironmentRouteLayer,
  // V3 Phase 7 — cloud-mode bundle at `/app/*`. Registered before the
  // `*` catch-all so HttpRouter's prefix match picks it up.
  cloudModeStaticRouteLayer,
  staticAndDevRouteLayer,
  websocketRpcRouteLayer,
).pipe(Layer.provide(browserApiCorsLayer));

export const makeServerLayer = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig;

    fixPath();

    const httpListeningLayer = Layer.effectDiscard(
      Effect.gen(function* () {
        yield* HttpServer.HttpServer;
        const startup = yield* ServerRuntimeStartup;
        yield* startup.markHttpListening;
      }),
    );
    const runtimeStateLayer = Layer.effectDiscard(
      Effect.acquireRelease(
        Effect.gen(function* () {
          const server = yield* HttpServer.HttpServer;
          const address = server.address;
          if (typeof address === "string" || !("port" in address)) {
            return;
          }

          const state = makePersistedServerRuntimeState({
            config,
            port: address.port,
          });
          yield* persistServerRuntimeState({
            path: config.serverRuntimeStatePath,
            state,
          });
        }),
        () => clearPersistedServerRuntimeState(config.serverRuntimeStatePath),
      ),
    );

    const serverApplicationLayer = Layer.mergeAll(
      HttpRouter.serve(makeRoutesLayer, {
        disableLogger: !config.logWebSocketEvents,
      }),
      httpListeningLayer,
      runtimeStateLayer,
    );

    return serverApplicationLayer.pipe(
      Layer.provideMerge(RuntimeServicesLive),
      Layer.provideMerge(PersistenceLayerLive),
      Layer.provideMerge(RepositoryIdentityResolverLive),
      Layer.provideMerge(HttpServerLive),
      Layer.provide(ObservabilityLive),
      Layer.provideMerge(FetchHttpClient.layer),
      Layer.provideMerge(PlatformServicesLive),
    );
  }),
);

// Important: Only `ServerConfig` should be provided by the CLI layer!!! Don't let other requirements leak into the launch layer.
export const runServer = Layer.launch(makeServerLayer) satisfies Effect.Effect<
  never,
  any,
  ServerConfig
>;
