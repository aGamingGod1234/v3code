import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

// V3 Phase 8 — Cloud env container registry (Postgres dialect).
//
// Postgres mirror of SQLite migration 031. See the SQLite counterpart
// for the P8 design rationale. Only delta: `CHECK` clause uses the same
// literal set, and we rely on `CREATE INDEX ... WHERE` partial index
// support (available since Postgres 7.2).
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS v3_cloud_containers (
      chat_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES v3_users(id) ON DELETE CASCADE,
      container_id TEXT NOT NULL,
      image TEXT NOT NULL,
      github_repo TEXT,
      github_branch TEXT,
      status TEXT NOT NULL CHECK (status IN (
        'starting','cloning','ready','running','stopping','dead','error'
      )),
      status_message TEXT,
      cpu_limit INTEGER NOT NULL,
      memory_mb INTEGER NOT NULL,
      disk_gb INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      ready_at TEXT,
      ended_at TEXT,
      last_checked_at TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_v3_cloud_containers_user
    ON v3_cloud_containers(user_id)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_v3_cloud_containers_active
    ON v3_cloud_containers(user_id, status)
    WHERE status NOT IN ('dead','error')
  `;
});
