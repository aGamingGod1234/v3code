// Postgres schema fix-forward for SQLite migration 016.
//
// Migration 017 (the Postgres port of SQLite 016) was intentionally a
// no-op on the assumption that fresh Postgres deployments write the
// new `modelSelection` / `defaultModelSelection` event shapes from
// the start. That's correct for the orchestration_events data, but
// it missed the schema DDL: `projection_projects.default_model` and
// `projection_threads.model` are still present in the Postgres
// schema, and the query layer at
// `apps/server/src/persistence/Layers/ProjectionProjects.ts` selects
// the new `default_model_selection_json` column directly.
//
// This migration brings the Postgres projection schema in line with
// what the query layer expects:
//
//   projection_projects:   + default_model_selection_json TEXT
//                          - default_model
//   projection_threads:    + model_selection_json TEXT
//                          - model
//
// Data-migration UPDATE statements are still unnecessary because a
// Postgres deployment has no pre-canonicalization rows to rewrite
// (every event written under Postgres already uses the new shape).
//
// `ADD COLUMN IF NOT EXISTS` is Postgres 9.6+; all V3 deployments run
// Postgres 16 so this is safe. `DROP COLUMN IF EXISTS` similarly.

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_projects
    ADD COLUMN IF NOT EXISTS default_model_selection_json TEXT
  `;

  yield* sql`
    ALTER TABLE projection_projects
    DROP COLUMN IF EXISTS default_model
  `;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS model_selection_json TEXT
  `;

  yield* sql`
    ALTER TABLE projection_threads
    DROP COLUMN IF EXISTS model
  `;
});
