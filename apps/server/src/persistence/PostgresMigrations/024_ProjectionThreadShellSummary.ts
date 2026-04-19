// Postgres port of SQLite migration 023_ProjectionThreadShellSummary.
//
// SQLite version wraps each ALTER in `.pipe(Effect.catch(() => Effect.void))`
// for idempotency. Postgres has `ADD COLUMN IF NOT EXISTS` so the
// catch-all is unnecessary.

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS latest_user_message_at TEXT
  `;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS pending_approval_count INTEGER NOT NULL DEFAULT 0
  `;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS pending_user_input_count INTEGER NOT NULL DEFAULT 0
  `;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS has_actionable_proposed_plan INTEGER NOT NULL DEFAULT 0
  `;
});
