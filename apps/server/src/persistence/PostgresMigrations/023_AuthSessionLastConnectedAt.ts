// Postgres port of SQLite migration 022_AuthSessionLastConnectedAt.

import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE auth_sessions
    ADD COLUMN IF NOT EXISTS last_connected_at TEXT
  `;
});
