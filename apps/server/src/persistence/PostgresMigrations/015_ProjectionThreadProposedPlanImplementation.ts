// Postgres port of SQLite migration 014_ProjectionThreadProposedPlanImplementation.

import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_thread_proposed_plans
    ADD COLUMN IF NOT EXISTS implemented_at TEXT
  `;

  yield* sql`
    ALTER TABLE projection_thread_proposed_plans
    ADD COLUMN IF NOT EXISTS implementation_thread_id TEXT
  `;
});
