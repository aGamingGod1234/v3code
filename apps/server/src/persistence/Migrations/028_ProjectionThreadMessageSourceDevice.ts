import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_thread_messages
    ADD COLUMN source_device_id TEXT
  `.pipe(Effect.catch(() => Effect.void));

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_thread_messages_source_device_id
    ON projection_thread_messages(source_device_id)
  `;
});
