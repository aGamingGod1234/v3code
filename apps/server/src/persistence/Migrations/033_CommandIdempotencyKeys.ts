import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

// Persistent dedup table for command/event idempotency keys consumed by
// ProviderCommandReactor. Replaces the in-memory Cache that lost its state
// on every server restart, which let queued duplicate turn-start events
// re-fire after a crash. The TTL semantics are enforced at the call site
// via processed_at; a periodic cleanup fiber prunes expired rows so the
// table stays bounded under load.

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS command_idempotency_keys (
      key TEXT PRIMARY KEY,
      processed_at INTEGER NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_command_idempotency_keys_processed_at
    ON command_idempotency_keys(processed_at)
  `;
});
