import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

// Postgres mirror of SQLite migration 029 (same id). Adds fork lineage
// columns + index to `projection_threads` so the server can snapshot
// the `parentChatId` / `parentDeviceId` / `forkedFromStreamVersion` /
// `forkedAt` metadata on a forked thread.
//
// The SQLite variant uses `ALTER TABLE ... ADD COLUMN` in a catch-all
// `.pipe(Effect.catch(() => Effect.void))` guard to tolerate repeat
// runs on older local databases. Postgres has native `IF NOT EXISTS`
// for ADD COLUMN, so we use that directly.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS parent_chat_id TEXT
  `;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS parent_device_id TEXT
  `;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS forked_from_stream_version INTEGER
  `;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS forked_at TEXT
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_parent_chat_id
    ON projection_threads(parent_chat_id)
  `;
});
