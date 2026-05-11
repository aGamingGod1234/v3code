import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has("session_mode")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN session_mode TEXT NOT NULL DEFAULT 'single'
    `;
  }

  if (!columnNames.has("orchestrator_config_json")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN orchestrator_config_json TEXT
    `;
  }
});
