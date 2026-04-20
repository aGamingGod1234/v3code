import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

// Postgres mirror of SQLite migration 030. Adds the scope list + a
// connection-timestamp column to `v3_users`. See the SQLite counterpart
// for the P1e rationale.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE v3_users
    ADD COLUMN IF NOT EXISTS github_scopes TEXT
  `;

  yield* sql`
    ALTER TABLE v3_users
    ADD COLUMN IF NOT EXISTS github_connected_at TEXT
  `;
});
