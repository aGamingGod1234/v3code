// Postgres port of SQLite migration 015_ProjectionTurnsSourceProposedPlan.

import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_turns
    ADD COLUMN IF NOT EXISTS source_proposed_plan_thread_id TEXT
  `;

  yield* sql`
    ALTER TABLE projection_turns
    ADD COLUMN IF NOT EXISTS source_proposed_plan_id TEXT
  `;
});
