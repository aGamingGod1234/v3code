import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN parent_chat_id TEXT
  `.pipe(Effect.catch(() => Effect.void));

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN parent_device_id TEXT
  `.pipe(Effect.catch(() => Effect.void));

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN forked_from_stream_version INTEGER
  `.pipe(Effect.catch(() => Effect.void));

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN forked_at TEXT
  `.pipe(Effect.catch(() => Effect.void));

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_parent_chat_id
    ON projection_threads(parent_chat_id)
  `;
});
