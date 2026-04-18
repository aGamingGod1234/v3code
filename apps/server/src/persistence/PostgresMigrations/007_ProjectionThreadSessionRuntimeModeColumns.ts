// Postgres port of SQLite migration 006_ProjectionThreadSessionRuntimeModeColumns.
//
// In SQLite the migration has to `ALTER TABLE ADD COLUMN` and then `UPDATE`
// to backfill NULLs. In Postgres, `ADD COLUMN ... NOT NULL DEFAULT 'x'`
// already sets every existing row to the default in one shot, so the
// trailing `UPDATE` is unnecessary — we keep it for symmetry with the
// SQLite history (no-op on empty tables anyway).

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_thread_sessions
    ADD COLUMN IF NOT EXISTS runtime_mode TEXT NOT NULL DEFAULT 'full-access'
  `;

  yield* sql`
    UPDATE projection_thread_sessions
    SET runtime_mode = 'full-access'
    WHERE runtime_mode IS NULL
  `;
});
