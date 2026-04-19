// Postgres port of SQLite migration 012_ProjectionThreadsInteractionMode.

import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS interaction_mode TEXT NOT NULL DEFAULT 'default'
  `;
});
