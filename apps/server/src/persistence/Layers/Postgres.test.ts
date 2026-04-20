import { describe, expect, it } from "vitest";
import { Effect, Exit, Layer } from "effect";

import { ServerConfig } from "../../config.ts";
import type { ServerConfigShape } from "../../config.ts";
import { PostgresNotConfiguredError, resolvePostgresPersistenceLive } from "./Postgres.ts";

// Build a minimal ServerConfigShape with every field present. Only the
// `postgresUrl` branch is under test — the rest match the shape of a
// server-node headless startup.
const makeConfig = (overrides: Partial<ServerConfigShape>): ServerConfigShape =>
  ({
    logLevel: "Error" as ServerConfigShape["logLevel"],
    traceMinLevel: "Info" as ServerConfigShape["traceMinLevel"],
    traceTimingEnabled: true,
    traceBatchWindowMs: 200,
    traceMaxBytes: 10 * 1024 * 1024,
    traceMaxFiles: 10,
    otlpTracesUrl: undefined,
    otlpMetricsUrl: undefined,
    otlpExportIntervalMs: 10_000,
    otlpServiceName: "t3-server",
    mode: "server-node",
    port: 0,
    cwd: "/tmp",
    baseDir: "/tmp/v3",
    stateDir: "/tmp/v3/state",
    dbPath: "/tmp/v3/state/state.sqlite",
    keybindingsConfigPath: "/tmp/v3/state/keybindings.json",
    settingsPath: "/tmp/v3/state/settings.json",
    providerStatusCacheDir: "/tmp/v3/caches",
    worktreesDir: "/tmp/v3/worktrees",
    attachmentsDir: "/tmp/v3/state/attachments",
    logsDir: "/tmp/v3/state/logs",
    serverLogPath: "/tmp/v3/state/logs/server.log",
    serverTracePath: "/tmp/v3/state/logs/server.trace.ndjson",
    providerLogsDir: "/tmp/v3/state/logs/provider",
    providerEventLogPath: "/tmp/v3/state/logs/provider/events.log",
    terminalLogsDir: "/tmp/v3/state/logs/terminals",
    anonymousIdPath: "/tmp/v3/state/anonymous-id",
    environmentIdPath: "/tmp/v3/state/environment-id",
    serverRuntimeStatePath: "/tmp/v3/state/server-runtime.json",
    secretsDir: "/tmp/v3/state/secrets",
    host: undefined,
    staticDir: undefined,
    devUrl: undefined,
    noBrowser: true,
    startupPresentation: "headless",
    desktopBootstrapToken: undefined,
    autoBootstrapProjectFromCwd: false,
    logWebSocketEvents: false,
    googleClientId: undefined,
    authorizedEmails: [],
    postgresUrl: undefined,
    googleClientSecret: undefined,
    serverPublicUrl: undefined,
    cloudModeStaticDir: undefined,
    githubClientId: undefined,
    githubClientSecret: undefined,
    githubOauthScopes: "read:user repo",
    ...overrides,
  }) satisfies ServerConfigShape;

const runResolve = (config: ServerConfigShape) =>
  Effect.runPromise(
    resolvePostgresPersistenceLive.pipe(
      Effect.provide(Layer.succeed(ServerConfig, config)),
      Effect.exit,
    ),
  );

describe("resolvePostgresPersistenceLive", () => {
  it("fails with PostgresNotConfiguredError when postgresUrl is undefined", async () => {
    const exit = await runResolve(makeConfig({ postgresUrl: undefined }));
    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(JSON.stringify(exit.cause)).toContain("PostgresNotConfiguredError");
    }
  });

  it("fails with PostgresNotConfiguredError when postgresUrl is an empty string", async () => {
    const exit = await runResolve(makeConfig({ postgresUrl: "" }));
    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("succeeds and returns a Layer when postgresUrl is set (without connecting)", async () => {
    // Layer construction is lazy; PgClient.layer does not open a connection
    // until the layer is built. `resolvePostgresPersistenceLive` only
    // packages the URL into a layer factory, so it succeeds with any
    // non-empty string.
    const exit = await runResolve(
      makeConfig({ postgresUrl: "postgres://user:pass@localhost:5432/v3" }),
    );
    expect(Exit.isSuccess(exit)).toBe(true);
  });

  it("PostgresNotConfiguredError carries a readable message tag", () => {
    const err = new PostgresNotConfiguredError({ message: "test hint" });
    expect(err._tag).toBe("PostgresNotConfiguredError");
    expect(err.message).toBe("test hint");
  });

  // Intentional gap: connecting to a real Postgres is a P2c+ integration
  // concern. P2b ships the factory + migration scaffolding only. The
  // `makePostgresPersistenceLive({ connectionUrl })` factory is exercised
  // end-to-end in the setup-wizard smoke test when P2d lands.
  it.todo("connects to a real Postgres instance and runs migration 001 to completion");
});
