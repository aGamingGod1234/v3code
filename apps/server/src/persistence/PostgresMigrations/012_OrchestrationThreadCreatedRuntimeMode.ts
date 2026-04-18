// Postgres port of SQLite migration 011_OrchestrationThreadCreatedRuntimeMode.
//
// The SQLite migration backfills existing `thread.created` events with
// `runtimeMode = 'full-access'` using `json_set` + `json_type`. Postgres
// has analogous functions (`jsonb_set`, `jsonb_typeof`) but on a fresh
// server-node deployment there are zero existing events, so the UPDATE
// reduces to a no-op. We keep this migration as an empty entry to
// preserve id alignment with the SQLite history; when upstream replays
// events into a V3 Postgres deployment in the future, a follow-up will
// re-introduce the port using jsonb operations.

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  yield* SqlClient.SqlClient;
});
