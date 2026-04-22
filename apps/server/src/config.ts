/**
 * ServerConfig - Runtime configuration services.
 *
 * Defines process-level server configuration and networking helpers used by
 * startup and runtime layers.
 *
 * @module ServerConfig
 */
import { Effect, FileSystem, Layer, LogLevel, Path, Schema, Context } from "effect";

export const DEFAULT_PORT = 3773;

// `server-node` is the V3 Phase 2 mode for self-hosted multi-device mesh
// deployments. The detection precedence (CLI flag > env var > config.toml
// presence > default) lives in `apps/server/src/serverMode.ts`. Adding the
// literal here keeps the existing `Config.schema(RuntimeMode, ...)` env-var
// path working without bespoke parsing.
export const RuntimeMode = Schema.Literals(["web", "desktop", "server-node"]);
export type RuntimeMode = typeof RuntimeMode.Type;

export const StartupPresentation = Schema.Literals(["browser", "headless"]);
export type StartupPresentation = typeof StartupPresentation.Type;

/**
 * ServerDerivedPaths - Derived paths from the base directory.
 */
export interface ServerDerivedPaths {
  readonly stateDir: string;
  readonly dbPath: string;
  readonly keybindingsConfigPath: string;
  readonly settingsPath: string;
  readonly providerStatusCacheDir: string;
  readonly worktreesDir: string;
  readonly attachmentsDir: string;
  readonly logsDir: string;
  readonly serverLogPath: string;
  readonly serverTracePath: string;
  readonly providerLogsDir: string;
  readonly providerEventLogPath: string;
  readonly terminalLogsDir: string;
  readonly anonymousIdPath: string;
  readonly environmentIdPath: string;
  readonly serverRuntimeStatePath: string;
  readonly secretsDir: string;
}

/**
 * ServerConfigShape - Process/runtime configuration required by the server.
 */
export interface ServerConfigShape extends ServerDerivedPaths {
  readonly logLevel: LogLevel.LogLevel;
  readonly traceMinLevel: LogLevel.LogLevel;
  readonly traceTimingEnabled: boolean;
  readonly traceBatchWindowMs: number;
  readonly traceMaxBytes: number;
  readonly traceMaxFiles: number;
  readonly otlpTracesUrl: string | undefined;
  readonly otlpMetricsUrl: string | undefined;
  readonly otlpExportIntervalMs: number;
  readonly otlpServiceName: string;
  readonly mode: RuntimeMode;
  readonly port: number;
  readonly host: string | undefined;
  readonly cwd: string;
  readonly baseDir: string;
  readonly staticDir: string | undefined;
  readonly devUrl: URL | undefined;
  readonly noBrowser: boolean;
  readonly startupPresentation: StartupPresentation;
  readonly desktopBootstrapToken: string | undefined;
  readonly autoBootstrapProjectFromCwd: boolean;
  readonly logWebSocketEvents: boolean;
  // V3 identity (Phase 1+). When `googleClientId` is undefined the V3 Google
  // sign-in layer is still constructible but will reject all verify attempts
  // with `not-configured`. `authorizedEmails` is an allowlist; an empty list
  // rejects every email, so the resolver must provide at least one entry to
  // enable Google sign-in.
  readonly googleClientId: string | undefined;
  readonly authorizedEmails: ReadonlyArray<string>;
  // V3 server-node mode (Phase 2b). Populated from `V3CODE_POSTGRES_URL`
  // or `[database].postgres_url` in `~/.v3-code-server/config.toml`. The
  // Postgres persistence layer at `persistence/Layers/Postgres.ts`
  // refuses to construct when this is undefined. In desktop / web
  // modes the SQLite layer ignores it entirely.
  readonly postgresUrl: string | undefined;
  // V3 Phase 7 — browser Google sign-in + cloud-mode hosting.
  //
  // `googleClientSecret`: the OAuth 2.0 client secret that Google hands
  // out when you register a "Web application" client. Required only for
  // the *browser* sign-in flow; the desktop flow uses PKCE without a
  // secret. Populated from `V3CODE_GOOGLE_CLIENT_SECRET` env or
  // `[auth].google_client_secret` in `config.toml`.
  //
  // `serverPublicUrl`: the externally-reachable origin of this server
  // (e.g. `https://v3.agaminggod.com`). Used to build the OAuth
  // `redirect_uri` so Google calls back to the server-node instead of
  // an Electron deep-link. Populated from `V3CODE_SERVER_PUBLIC_URL`
  // env or `[server].public_url` in `config.toml`.
  //
  // `cloudModeStaticDir`: directory containing a pre-built cloud-mode
  // web bundle (`VITE_V3_CLOUD_MODE=1 vite build --outDir dist-cloud`).
  // When set, the server mounts its contents at `/app/*` in addition to
  // the existing `staticDir` at `/`. Populated from
  // `V3CODE_CLOUD_MODE_STATIC_DIR` env or the monorepo fallback.
  readonly googleClientSecret: string | undefined;
  readonly serverPublicUrl: string | undefined;
  readonly cloudModeStaticDir: string | undefined;
  // V3 Phase 1e — GitHub OAuth app client.
  //
  // `githubClientId` + `githubClientSecret` populate from
  // `V3CODE_GITHUB_CLIENT_ID` + `V3CODE_GITHUB_CLIENT_SECRET` env or
  // `[auth].github_client_id` / `[auth].github_client_secret` in
  // config.toml. Both must be set for GitHub sign-in to work; if either
  // is missing the `GitHubIdentityService` falls back to a
  // `not-configured` stub that returns a tagged error on every call.
  //
  // `githubOauthScopes` is a space-separated scope list sent to GitHub
  // during the authorize redirect. Defaults to `read:user repo` so the
  // P7 GitHubRepoBrowser + P8 Cloud env have what they need.
  readonly githubClientId: string | undefined;
  readonly githubClientSecret: string | undefined;
  readonly githubOauthScopes: string;
  readonly cloudEnvEnabled: boolean;
  readonly cloudEnvDockerSocket: string | undefined;
  readonly cloudEnvBaseImage: string;
  readonly cloudEnvMaxContainers: number;
  readonly cloudEnvContainerCpuLimit: number;
  readonly cloudEnvContainerMemoryMb: number;
  readonly cloudEnvContainerDiskGb: number;
  readonly cloudEnvContainerMaxRuntimeHours: number;
}

export const deriveServerPaths = Effect.fn(function* (
  baseDir: ServerConfigShape["baseDir"],
  devUrl: ServerConfigShape["devUrl"],
): Effect.fn.Return<ServerDerivedPaths, never, Path.Path> {
  const { join } = yield* Path.Path;
  const stateDir = join(baseDir, devUrl !== undefined ? "dev" : "userdata");
  const dbPath = join(stateDir, "state.sqlite");
  const attachmentsDir = join(stateDir, "attachments");
  const logsDir = join(stateDir, "logs");
  const providerLogsDir = join(logsDir, "provider");
  const providerStatusCacheDir = join(baseDir, "caches");
  return {
    stateDir,
    dbPath,
    keybindingsConfigPath: join(stateDir, "keybindings.json"),
    settingsPath: join(stateDir, "settings.json"),
    providerStatusCacheDir,
    worktreesDir: join(baseDir, "worktrees"),
    attachmentsDir,
    logsDir,
    serverLogPath: join(logsDir, "server.log"),
    serverTracePath: join(logsDir, "server.trace.ndjson"),
    providerLogsDir,
    providerEventLogPath: join(providerLogsDir, "events.log"),
    terminalLogsDir: join(logsDir, "terminals"),
    anonymousIdPath: join(stateDir, "anonymous-id"),
    environmentIdPath: join(stateDir, "environment-id"),
    serverRuntimeStatePath: join(stateDir, "server-runtime.json"),
    secretsDir: join(stateDir, "secrets"),
  };
});

export const ensureServerDirectories = Effect.fn(function* (derivedPaths: ServerDerivedPaths) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  yield* Effect.all(
    [
      fs.makeDirectory(derivedPaths.stateDir, { recursive: true }),
      fs.makeDirectory(derivedPaths.logsDir, { recursive: true }),
      fs.makeDirectory(derivedPaths.providerLogsDir, { recursive: true }),
      fs.makeDirectory(derivedPaths.terminalLogsDir, { recursive: true }),
      fs.makeDirectory(derivedPaths.attachmentsDir, { recursive: true }),
      fs.makeDirectory(derivedPaths.worktreesDir, { recursive: true }),
      fs.makeDirectory(path.dirname(derivedPaths.keybindingsConfigPath), { recursive: true }),
      fs.makeDirectory(path.dirname(derivedPaths.settingsPath), { recursive: true }),
      fs.makeDirectory(derivedPaths.providerStatusCacheDir, { recursive: true }),
      fs.makeDirectory(path.dirname(derivedPaths.anonymousIdPath), { recursive: true }),
      fs.makeDirectory(path.dirname(derivedPaths.serverRuntimeStatePath), { recursive: true }),
    ],
    { concurrency: "unbounded" },
  );
});

/**
 * ServerConfig - Service tag for server runtime configuration.
 */
export class ServerConfig extends Context.Service<ServerConfig, ServerConfigShape>()(
  "t3/config/ServerConfig",
) {
  static readonly layerTest = (cwd: string, baseDirOrPrefix: string | { prefix: string }) =>
    Layer.effect(
      ServerConfig,
      Effect.gen(function* () {
        const devUrl = undefined;

        const fs = yield* FileSystem.FileSystem;
        const baseDir =
          typeof baseDirOrPrefix === "string"
            ? baseDirOrPrefix
            : yield* fs.makeTempDirectoryScoped({ prefix: baseDirOrPrefix.prefix });
        const derivedPaths = yield* deriveServerPaths(baseDir, devUrl);
        yield* ensureServerDirectories(derivedPaths);

        return {
          logLevel: "Error",
          traceMinLevel: "Info",
          traceTimingEnabled: true,
          traceBatchWindowMs: 200,
          traceMaxBytes: 10 * 1024 * 1024,
          traceMaxFiles: 10,
          otlpTracesUrl: undefined,
          otlpMetricsUrl: undefined,
          otlpExportIntervalMs: 10_000,
          otlpServiceName: "t3-server",
          cwd,
          baseDir,
          ...derivedPaths,
          mode: "web",
          autoBootstrapProjectFromCwd: false,
          logWebSocketEvents: false,
          port: 0,
          host: undefined,
          desktopBootstrapToken: undefined,
          staticDir: undefined,
          devUrl,
          noBrowser: false,
          startupPresentation: "browser",
          googleClientId: undefined,
          authorizedEmails: [],
          postgresUrl: undefined,
          googleClientSecret: undefined,
          serverPublicUrl: undefined,
          cloudModeStaticDir: undefined,
          githubClientId: undefined,
          githubClientSecret: undefined,
          githubOauthScopes: "read:user repo",
          cloudEnvEnabled: false,
          cloudEnvDockerSocket: undefined,
          cloudEnvBaseImage: "ghcr.io/v3-code/cloud-env:latest",
          cloudEnvMaxContainers: 10,
          cloudEnvContainerCpuLimit: 2,
          cloudEnvContainerMemoryMb: 4096,
          cloudEnvContainerDiskGb: 20,
          cloudEnvContainerMaxRuntimeHours: 720,
        } satisfies ServerConfigShape;
      }),
    );
}

export const resolveStaticDir = Effect.fn(function* () {
  const { join, resolve } = yield* Path.Path;
  const { exists } = yield* FileSystem.FileSystem;
  const bundledClient = resolve(join(import.meta.dirname, "client"));
  const bundledStat = yield* exists(join(bundledClient, "index.html")).pipe(
    Effect.orElseSucceed(() => false),
  );
  if (bundledStat) {
    return bundledClient;
  }

  const monorepoClient = resolve(join(import.meta.dirname, "../../web/dist"));
  const monorepoStat = yield* exists(join(monorepoClient, "index.html")).pipe(
    Effect.orElseSucceed(() => false),
  );
  if (monorepoStat) {
    return monorepoClient;
  }
  return undefined;
});

/**
 * V3 Phase 7 — resolve the cloud-mode static directory.
 *
 * Resolution order:
 *   1. `V3CODE_CLOUD_MODE_STATIC_DIR` (set by operator / bundler).
 *   2. `<server-bundle>/client-cloud/` — how we ship cloud assets
 *      alongside the electron bundle.
 *   3. Monorepo fallback `apps/web/dist-cloud/` for local dev.
 *
 * Returns `undefined` when no build has been produced yet — the server
 * then falls through to its legacy static behaviour for `/app`
 * requests, responding with a 503 so the operator can deploy or build
 * the bundle.
 */
export const resolveCloudModeStaticDir = Effect.fn(function* () {
  const { join, resolve } = yield* Path.Path;
  const { exists } = yield* FileSystem.FileSystem;
  const override = process.env.V3CODE_CLOUD_MODE_STATIC_DIR?.trim();
  if (override && override.length > 0) {
    const explicitStat = yield* exists(join(override, "index.html")).pipe(
      Effect.orElseSucceed(() => false),
    );
    if (explicitStat) {
      return resolve(override);
    }
  }

  const bundledCloud = resolve(join(import.meta.dirname, "client-cloud"));
  const bundledStat = yield* exists(join(bundledCloud, "index.html")).pipe(
    Effect.orElseSucceed(() => false),
  );
  if (bundledStat) {
    return bundledCloud;
  }

  const monorepoCloud = resolve(join(import.meta.dirname, "../../web/dist-cloud"));
  const monorepoStat = yield* exists(join(monorepoCloud, "index.html")).pipe(
    Effect.orElseSucceed(() => false),
  );
  if (monorepoStat) {
    return monorepoCloud;
  }
  return undefined;
});
