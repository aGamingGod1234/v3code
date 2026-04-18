import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

// V3 identity schema.
//
// Three tables prefixed `v3_` to keep V3 additions visually separate from
// upstream T3 tables. These tables are populated only in server-node mode
// (Phase 2+). In single-device mode they remain empty and inert.
//
// Referential integrity:
// - v3_devices.user_id cascades on user delete (full account removal)
// - v3_device_sessions.session_id cascades on auth_sessions delete
//   (device session is scoped to an auth session)
// - v3_device_sessions.device_id cascades on device delete

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS v3_users (
      id TEXT PRIMARY KEY,
      google_sub TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      display_name TEXT,
      avatar_url TEXT,
      github_access_token_enc BLOB,
      github_token_enc_iv BLOB,
      github_token_enc_auth_tag BLOB,
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
      approved INTEGER NOT NULL DEFAULT 0,
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
      session_id TEXT PRIMARY KEY REFERENCES auth_sessions(session_id) ON DELETE CASCADE,
      device_id TEXT NOT NULL REFERENCES v3_devices(id) ON DELETE CASCADE,
      linked_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_v3_device_sessions_device
    ON v3_device_sessions(device_id)
  `;
});
