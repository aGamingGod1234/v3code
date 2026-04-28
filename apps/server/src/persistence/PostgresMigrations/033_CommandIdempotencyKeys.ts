import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

// Postgres mirror of SQLite migration 033: persistent dedup table for
// command/event idempotency keys consumed by ProviderCommandReactor.
// processed_at is stored as bigint (epoch milliseconds) to match the
// SQLite INTEGER column shape used by Date.now() at the call site.

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS command_idempotency_keys (
      key TEXT PRIMARY KEY,
      processed_at BIGINT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_command_idempotency_keys_processed_at
    ON command_idempotency_keys(processed_at)
  `;
});
