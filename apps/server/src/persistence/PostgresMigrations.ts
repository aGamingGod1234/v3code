/**
 * Postgres migration runner.
 *
 * Parallels `apps/server/src/persistence/Migrations.ts` (the SQLite
 * runner) but with a separate registry of Postgres-flavored migrations.
 * The migration ids are independent of the SQLite counterparts because
 * the Postgres baseline is a new deployment shape — it does not share
 * the 26-migration history that the existing SQLite database carries.
 *
 * P2b ships only `001_V3IdentityBaseline`. Upstream T3 tables
 * (`orchestration_events`, `projection_threads`, `auth_sessions`, …)
 * are still SQLite-only; their Postgres ports will land as separate
 * migration entries in follow-up P2 slices.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Migrator from "effect/unstable/sql/Migrator";

import Migration0001 from "./PostgresMigrations/001_V3IdentityBaseline.ts";

export const postgresMigrationEntries = [[1, "V3IdentityBaseline", Migration0001]] as const;

export const makePostgresMigrationLoader = (throughId?: number) =>
  Migrator.fromRecord(
    Object.fromEntries(
      postgresMigrationEntries
        .filter(([id]) => throughId === undefined || id <= throughId)
        .map(([id, name, migration]) => [`${id}_${name}`, migration]),
    ),
  );

const run = Migrator.make({});

export interface RunPostgresMigrationsOptions {
  readonly toMigrationInclusive?: number | undefined;
}

export const runPostgresMigrations = Effect.fn("runPostgresMigrations")(function* ({
  toMigrationInclusive,
}: RunPostgresMigrationsOptions = {}) {
  yield* Effect.log(
    toMigrationInclusive === undefined
      ? "Running Postgres migrations..."
      : `Running Postgres migrations 1 through ${toMigrationInclusive}...`,
  );
  const executed = yield* run({ loader: makePostgresMigrationLoader(toMigrationInclusive) });
  yield* Effect.log("Postgres migrations ran successfully").pipe(
    Effect.annotateLogs({ migrations: executed.map(([id, name]) => `${id}_${name}`) }),
  );
  return executed;
});

// Layer that runs migrations on build — intended to be provided into
// the PG client layer stack at server-node startup.
export const PostgresMigrationsLive = Layer.effectDiscard(runPostgresMigrations());
