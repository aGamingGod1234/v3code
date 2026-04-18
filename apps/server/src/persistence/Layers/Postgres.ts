/**
 * Postgres persistence layer for V3 server-node mode (Phase 2b).
 *
 * Parallels `./Sqlite.ts` but backed by `@effect/sql-pg`. Only
 * constructible when `ServerConfig.postgresUrl` is defined, which in
 * turn is populated from `[database].postgres_url` in
 * `~/.v3-code-server/config.toml` (see P2a) or `V3CODE_POSTGRES_URL`.
 *
 * Startup flow: Postgres client connects → Migrator runs pending
 * Postgres migrations (currently just `001_V3IdentityBaseline`) →
 * downstream services receive `SqlClient.SqlClient`.
 *
 * NOT YET WIRED into `server.ts` / `bootstrap.ts`. The layer is
 * exported for composition but server startup still provides the
 * SQLite layer unconditionally. Mode-aware routing (SQLite for
 * desktop/web, Postgres for server-node) lands in a follow-up slice
 * after the upstream T3 tables have been ported to Postgres — running
 * Postgres as the only backend today would break every
 * orchestration/auth service at startup.
 */

import { Data, Effect, Layer, Redacted } from "effect";
import * as PgClient from "@effect/sql-pg/PgClient";

import { ServerConfig } from "../../config.ts";
import { PostgresMigrationsLive } from "../PostgresMigrations.ts";

export class PostgresNotConfiguredError extends Data.TaggedError("PostgresNotConfiguredError")<{
  readonly message: string;
}> {}

export interface PostgresPersistenceOptions {
  readonly connectionUrl: string;
  readonly applicationName?: string;
  readonly spanAttributes?: Record<string, unknown>;
}

// Construct a Postgres-backed persistence layer that runs the V3
// migration set on build. Caller is responsible for providing
// `ServerConfig`-adjacent dependencies (FileSystem, Path) which the
// migrator requires for artifact loading.
export const makePostgresPersistenceLive = (options: PostgresPersistenceOptions) =>
  Layer.provideMerge(
    PostgresMigrationsLive,
    PgClient.layer({
      url: Redacted.make(options.connectionUrl),
      applicationName: options.applicationName ?? "t3-server",
      spanAttributes: options.spanAttributes ?? {
        "db.system": "postgresql",
        "service.name": "t3-server",
      },
    }),
  );

// Effect that resolves a Postgres layer from the live `ServerConfig`
// service, or fails with `PostgresNotConfiguredError` when `postgresUrl`
// is unset. Exported for tests (which want the raw failure, not the
// layer-construction wrapper). Production callers should use
// `layerConfig` below.
export const resolvePostgresPersistenceLive = Effect.gen(function* () {
  const config = yield* ServerConfig;
  if (config.postgresUrl === undefined || config.postgresUrl.length === 0) {
    return yield* new PostgresNotConfiguredError({
      message:
        "postgresUrl is unset. Set [database].postgres_url in ~/.v3-code-server/config.toml or V3CODE_POSTGRES_URL.",
    });
  }
  return makePostgresPersistenceLive({ connectionUrl: config.postgresUrl });
});

// Layer that reads the URL from the live `ServerConfig` service. Fails
// at layer construction if `postgresUrl` is undefined so startup
// surfaces the misconfiguration loudly rather than silently falling
// back to SQLite behind the operator's back.
export const layerConfig = Layer.unwrap(resolvePostgresPersistenceLive);
