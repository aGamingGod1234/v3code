// Postgres port of SQLite migration 024_BackfillProjectionThreadShellSummary.
//
// The SQLite version is a dense data backfill using JSON_EXTRACT, ROW_NUMBER()
// OVER (...), CTEs, and correlated subqueries to reconstruct
// pending_approval_count / pending_user_input_count / has_actionable_proposed_plan
// from existing activity rows.
//
// On a fresh server-node Postgres deployment all the projection tables
// start empty, so the backfill has nothing to operate on. We keep this
// migration in place as a no-op to preserve id alignment with the
// SQLite history; the projector itself (re-)populates these counters
// as events are replayed.

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  yield* SqlClient.SqlClient;
});
