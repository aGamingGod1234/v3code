// Postgres port of SQLite migration 017_ProjectionThreadsArchivedAt.
//
// The SQLite version guards against a duplicate ALTER by reading
// `PRAGMA table_info(...)`. In Postgres we use the native
// `ADD COLUMN IF NOT EXISTS` (9.6+) and skip the existence check.

import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS archived_at TEXT
  `;
});
