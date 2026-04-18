// Postgres port of SQLite migration 009_ProviderSessionRuntimeMode.
// SQLite version is an explicit no-op (the runtime_mode column was
// already added in migration 004_ProviderSessionRuntime). We preserve
// the entry in the sequence so the migration ids stay aligned with
// the SQLite history (+1 for V3IdentityBaseline at 001).

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  yield* SqlClient.SqlClient;
});
