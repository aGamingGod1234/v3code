import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

// V3 Phase 8 — Cloud env container registry (SQLite dialect).
//
// Tracks the lifecycle of the Docker containers the server node boots
// to back Cloud-hosted chats. One row per chat; the row lives from the
// `docker create` moment through `docker rm` so we keep ended
// containers as `status='dead'` for post-mortem / admin panel.
//
// chat_id is the v3 thread id (UUID). It's a natural PK because every
// Cloud chat gets exactly one container; re-provisioning a chat after
// failure inserts a new row under the same chat_id via
// `ON CONFLICT ... DO UPDATE`.
//
// Keeping this as a standalone table rather than columns on
// `projection_threads` leaves the thread projection independent of
// Docker specifics and keeps server-node-only columns out of the
// desktop / SQLite schema surface area (the schema is shared so the
// table exists in both, but only server-node ever writes rows).
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS v3_cloud_containers (
      chat_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
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
