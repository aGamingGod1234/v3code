import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

// V3 Phase 1e — add GitHub scope + connection-time metadata to `v3_users`.
//
// Migration 026 created the encrypted-token columns (ciphertext, iv,
// authTag, username) but didn't track the scope list or the moment
// the user clicked "Connect GitHub." Those two fields let the Settings
// UI surface "connected as X since Y with scopes Z1,Z2" and let the
// disconnect flow know whether there's anything to tear down.
//
// Wrapped in Effect.catch to stay idempotent on existing test DBs.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE v3_users
    ADD COLUMN github_scopes TEXT
  `.pipe(Effect.catch(() => Effect.void));

  yield* sql`
    ALTER TABLE v3_users
    ADD COLUMN github_connected_at TEXT
  `.pipe(Effect.catch(() => Effect.void));
});
