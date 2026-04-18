// Postgres port of SQLite migration 007_ProjectionThreadMessageAttachments.

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_thread_messages
    ADD COLUMN IF NOT EXISTS attachments_json TEXT
  `;
});
