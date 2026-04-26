import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

// Postgres mirror of SQLite migration 031: composite index over
// (parent_chat_id, forked_at DESC) on projection_threads for the
// lineage-by-recency query in ProjectionThreads.ts:192. The
// standalone parent_chat_id index from migration 029 is retained —
// the composite serves the dominant ORDER BY forked_at DESC pattern.
//
// Postgres supports DESC in btree indexes natively; CREATE INDEX
// IF NOT EXISTS is idempotent for this exact name+columns shape.

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_parent_chat_id_forked_at
    ON projection_threads(parent_chat_id, forked_at DESC)
  `;
});
