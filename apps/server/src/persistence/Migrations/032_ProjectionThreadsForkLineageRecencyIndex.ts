import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

// Composite index over (parent_chat_id, forked_at DESC) so the
// projected lineage query in ProjectionThreads.ts:192 can serve
// "children of <thread> ordered newest-first" without sorting in
// memory. The standalone parent_chat_id index from migration 029 is
// retained — it still serves count / existence-only queries — but
// the composite is the dominant access pattern for the fork-lineage
// UI surface added in P6.
//
// SQLite supports DESC in indexes; we keep the wrapping Effect.catch
// for forward-compat with older local databases that may have run
// migration 029 without re-creating the table.

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_parent_chat_id_forked_at
    ON projection_threads(parent_chat_id, forked_at DESC)
  `.pipe(Effect.catch(() => Effect.void));
});
