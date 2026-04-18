// V3 Phase 2b — Postgres identity baseline.
//
// Mirrors the SQLite migration at
// `apps/server/src/persistence/Migrations/026_V3UsersDevices.ts` but in
// Postgres syntax so the same `UserRepository`, `DeviceRepository`,
// `DeviceSessionRepository` code can back a server-node deployment
// without touching the service layer.
//
// Dialect deltas vs the SQLite baseline:
//   - SQLite BLOB → Postgres BYTEA
//   - SQLite INTEGER (boolean) → Postgres BOOLEAN
//   - Timestamps intentionally stored as TEXT (ISO-8601) rather than
//     TIMESTAMPTZ so `Schema.DateTimeUtcFromString` decodes the same
//     way on both backends. Native TIMESTAMPTZ is a follow-up once we
//     verify round-trips end to end.
//
// Forward compatibility:
//   - `v3_device_sessions.session_id` does NOT reference `auth_sessions`
//     yet. That base T3 table is created by SQLite migration 020 and has
//     not been ported to Postgres in this phase. When the upstream T3
//     tables land in Postgres (future P2b slice), a follow-up migration
//     adds the FK constraint.

import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS v3_users (
      id TEXT PRIMARY KEY,
      google_sub TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      display_name TEXT,
      avatar_url TEXT,
      github_access_token_enc BYTEA,
      github_token_enc_iv BYTEA,
      github_token_enc_auth_tag BYTEA,
      github_username TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_v3_users_email
    ON v3_users(email)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS v3_devices (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES v3_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      platform TEXT NOT NULL CHECK (platform IN (
        'windows','macos','linux','android','ios','web'
      )),
      kind TEXT NOT NULL CHECK (kind IN (
        'desktop','laptop','server','phone','tablet','browser','cloud'
      )),
      capabilities_json TEXT NOT NULL DEFAULT '[]',
      approved BOOLEAN NOT NULL DEFAULT FALSE,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT,
      removed_at TEXT
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_v3_devices_user_active
    ON v3_devices(user_id, approved)
    WHERE removed_at IS NULL
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS v3_device_sessions (
      session_id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES v3_devices(id) ON DELETE CASCADE,
      linked_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_v3_device_sessions_device
    ON v3_device_sessions(device_id)
  `;
});
