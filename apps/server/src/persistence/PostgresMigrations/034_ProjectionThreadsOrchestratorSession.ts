// Postgres port of SQLite migration 034_ProjectionThreadsOrchestratorSession.

import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS session_mode TEXT NOT NULL DEFAULT 'single'
  `;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS orchestrator_config_json TEXT
  `;
});
