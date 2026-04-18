// Postgres port of SQLite migration 016_CanonicalizeModelSelections.
//
// The SQLite version is a dense data migration that uses json_set,
// json_extract, json_patch, json_remove, json_object, json_type — all
// of which have Postgres equivalents (`jsonb_set`, `->`, `||`, `-`,
// `jsonb_build_object`, `jsonb_typeof`) but with different syntax.
//
// For a fresh server-node Postgres deployment there is no pre-existing
// orchestration_events data to canonicalize — every event written under
// Postgres will already use the new `modelSelection` / `defaultModelSelection`
// shapes. So this migration runs against empty tables and all UPDATE
// statements would match zero rows.
//
// We therefore keep this migration as an explicit no-op (no SQL
// executed) to preserve id alignment with the SQLite history. If/when
// the V3 project ever needs to replay legacy SQLite events into a new
// Postgres deployment, a dedicated back-migration will introduce the
// jsonb-based equivalent logic.

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  yield* SqlClient.SqlClient;
});
