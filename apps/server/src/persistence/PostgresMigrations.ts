/**
 * Postgres migration runner.
 *
 * Parallels `apps/server/src/persistence/Migrations.ts` (the SQLite
 * runner) but with a separate registry of Postgres-flavored migrations.
 * The migration ids are independent of the SQLite counterparts because
 * the Postgres baseline is a new deployment shape.
 *
 * Registry layout after P2b-mig (2026-04-19):
 *   id 001     : V3IdentityBaseline (V3-only; added first so v3_*
 *                tables exist independent of the upstream T3 schema).
 *   id 002+    : ports of subsequent SQLite migrations in the same order.
 *                The SQLite history stays canonical — comments on each
 *                port name the SQLite source.
 *
 * For fresh server-node deployments, the data-migration entries
 * (012 OrchestrationThreadCreatedRuntimeMode, 017 CanonicalizeModelSelections,
 * 025 BackfillProjectionThreadShellSummary, 026 CleanupInvalidProjectionPendingApprovals)
 * are explicit no-ops because their UPDATE/DELETE statements would
 * match zero rows on empty tables. They are kept in the sequence so a
 * future mode that replays SQLite data into a Postgres node can slot
 * the real jsonb-based logic in without renumbering.
 */

import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Migrator from "effect/unstable/sql/Migrator";

import Migration0001 from "./PostgresMigrations/001_V3IdentityBaseline.ts";
import Migration0002 from "./PostgresMigrations/002_OrchestrationEvents.ts";
import Migration0003 from "./PostgresMigrations/003_OrchestrationCommandReceipts.ts";
import Migration0004 from "./PostgresMigrations/004_CheckpointDiffBlobs.ts";
import Migration0005 from "./PostgresMigrations/005_ProviderSessionRuntime.ts";
import Migration0006 from "./PostgresMigrations/006_Projections.ts";
import Migration0007 from "./PostgresMigrations/007_ProjectionThreadSessionRuntimeModeColumns.ts";
import Migration0008 from "./PostgresMigrations/008_ProjectionThreadMessageAttachments.ts";
import Migration0009 from "./PostgresMigrations/009_ProjectionThreadActivitySequence.ts";
import Migration0010 from "./PostgresMigrations/010_ProviderSessionRuntimeMode.ts";
import Migration0011 from "./PostgresMigrations/011_ProjectionThreadsRuntimeMode.ts";
import Migration0012 from "./PostgresMigrations/012_OrchestrationThreadCreatedRuntimeMode.ts";
import Migration0013 from "./PostgresMigrations/013_ProjectionThreadsInteractionMode.ts";
import Migration0014 from "./PostgresMigrations/014_ProjectionThreadProposedPlans.ts";
import Migration0015 from "./PostgresMigrations/015_ProjectionThreadProposedPlanImplementation.ts";
import Migration0016 from "./PostgresMigrations/016_ProjectionTurnsSourceProposedPlan.ts";
import Migration0017 from "./PostgresMigrations/017_CanonicalizeModelSelections.ts";
import Migration0018 from "./PostgresMigrations/018_ProjectionThreadsArchivedAt.ts";
import Migration0019 from "./PostgresMigrations/019_ProjectionThreadsArchivedAtIndex.ts";
import Migration0020 from "./PostgresMigrations/020_ProjectionSnapshotLookupIndexes.ts";
import Migration0021 from "./PostgresMigrations/021_AuthAccessManagement.ts";
import Migration0022 from "./PostgresMigrations/022_AuthSessionClientMetadata.ts";
import Migration0023 from "./PostgresMigrations/023_AuthSessionLastConnectedAt.ts";
import Migration0024 from "./PostgresMigrations/024_ProjectionThreadShellSummary.ts";
import Migration0025 from "./PostgresMigrations/025_BackfillProjectionThreadShellSummary.ts";
import Migration0026 from "./PostgresMigrations/026_CleanupInvalidProjectionPendingApprovals.ts";
import Migration0027 from "./PostgresMigrations/027_ProjectionThreadsMeshSync.ts";
import Migration0028 from "./PostgresMigrations/028_ProjectionThreadMessageSourceDevice.ts";
import Migration0029 from "./PostgresMigrations/029_ProjectionThreadsForkLineage.ts";

export const postgresMigrationEntries = [
  [1, "V3IdentityBaseline", Migration0001],
  [2, "OrchestrationEvents", Migration0002],
  [3, "OrchestrationCommandReceipts", Migration0003],
  [4, "CheckpointDiffBlobs", Migration0004],
  [5, "ProviderSessionRuntime", Migration0005],
  [6, "Projections", Migration0006],
  [7, "ProjectionThreadSessionRuntimeModeColumns", Migration0007],
  [8, "ProjectionThreadMessageAttachments", Migration0008],
  [9, "ProjectionThreadActivitySequence", Migration0009],
  [10, "ProviderSessionRuntimeMode", Migration0010],
  [11, "ProjectionThreadsRuntimeMode", Migration0011],
  [12, "OrchestrationThreadCreatedRuntimeMode", Migration0012],
  [13, "ProjectionThreadsInteractionMode", Migration0013],
  [14, "ProjectionThreadProposedPlans", Migration0014],
  [15, "ProjectionThreadProposedPlanImplementation", Migration0015],
  [16, "ProjectionTurnsSourceProposedPlan", Migration0016],
  [17, "CanonicalizeModelSelections", Migration0017],
  [18, "ProjectionThreadsArchivedAt", Migration0018],
  [19, "ProjectionThreadsArchivedAtIndex", Migration0019],
  [20, "ProjectionSnapshotLookupIndexes", Migration0020],
  [21, "AuthAccessManagement", Migration0021],
  [22, "AuthSessionClientMetadata", Migration0022],
  [23, "AuthSessionLastConnectedAt", Migration0023],
  [24, "ProjectionThreadShellSummary", Migration0024],
  [25, "BackfillProjectionThreadShellSummary", Migration0025],
  [26, "CleanupInvalidProjectionPendingApprovals", Migration0026],
  [27, "ProjectionThreadsMeshSync", Migration0027],
  [28, "ProjectionThreadMessageSourceDevice", Migration0028],
  [29, "ProjectionThreadsForkLineage", Migration0029],
] as const;

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
