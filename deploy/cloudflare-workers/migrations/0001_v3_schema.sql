-- V3 Code — Cloudflare D1 baseline migration.
--
-- Mirrors the SQLite migrations under
-- `apps/server/src/persistence/Migrations/*` so the same V3 server
-- bundle can back either a local SQLite file or a D1 database. D1
-- speaks SQLite, so the migration is a straight port — the only
-- differences against the Postgres migration set are BLOB vs BYTEA and
-- TEXT timestamps vs TIMESTAMPTZ (unified on ISO-8601 strings, which
-- `Schema.DateTimeUtcFromString` round-trips identically in both
-- dialects).
--
-- Run via:
--   wrangler d1 migrations apply v3-server --remote
--
-- Every subsequent V3 migration goes in its own file named
-- `NNNN_<slug>.sql` so Wrangler orders them deterministically.

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
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_v3_users_email ON v3_users(email);

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
);

CREATE INDEX IF NOT EXISTS idx_v3_devices_user_active
  ON v3_devices(user_id, approved)
  WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS v3_device_sessions (
  session_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES v3_devices(id) ON DELETE CASCADE,
  linked_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_v3_device_sessions_device
  ON v3_device_sessions(device_id);

-- Mesh event store + projections. These mirror the T3 upstream
-- orchestration_events + projection_threads schema. When the server
-- boots against D1 it runs its own migration series on top of this
-- baseline, so any new projection column added post-v0.1 lands in a
-- fresh `NNNN_*.sql` migration file in this directory.
CREATE TABLE IF NOT EXISTS orchestration_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  aggregate_kind TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  command_id TEXT,
  causation_event_id TEXT,
  correlation_id TEXT,
  metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_orchestration_events_aggregate
  ON orchestration_events(aggregate_kind, aggregate_id, sequence);

CREATE INDEX IF NOT EXISTS idx_orchestration_events_occurred
  ON orchestration_events(occurred_at);

CREATE TABLE IF NOT EXISTS projection_threads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT,
  host_device_id TEXT,
  parent_thread_id TEXT,
  parent_device_id TEXT,
  working_directory TEXT,
  github_repo TEXT,
  github_branch TEXT,
  container_id TEXT,
  event_seq INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','ended')),
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_event_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_projection_threads_project
  ON projection_threads(project_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_projection_threads_host
  ON projection_threads(host_device_id)
  WHERE host_device_id IS NOT NULL;

-- Additional V3 tables (device push tokens, FCM config, projection
-- thread messages, projection turns) are created by the server's own
-- SQLite migration series on first boot. The baseline above is the
-- minimum D1 needs to accept an initial Worker deploy.
