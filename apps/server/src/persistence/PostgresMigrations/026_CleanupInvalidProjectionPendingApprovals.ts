// Postgres port of SQLite migration 025_CleanupInvalidProjectionPendingApprovals.
//
// The SQLite version deletes `projection_pending_approvals` rows whose
// request_id has no corresponding `approval.requested` activity, then
// recomputes `projection_threads.pending_approval_count`. Both operate
// on empty tables in a fresh server-node Postgres deployment, so the
// migration is a no-op here. The projector maintains both invariants
// going forward.

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  yield* SqlClient.SqlClient;
});
