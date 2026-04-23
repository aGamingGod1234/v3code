import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

// V3 Phase 9 — mobile push registration + FCM config.
//
// `v3_device_push_tokens` holds per-device FCM / APNs tokens the
// mobile clients register via the `mesh.registerPushToken` RPC.
// Tokens rotate periodically (Google policy) so the row uses
// `(device_id, provider, token)` as the conflict key — a new token
// for the same device just supersedes the old one via
// `ON CONFLICT DO UPDATE`. `removed_at` is populated when the client
// explicitly unregisters or when FCM returns a 404 / 410 for the
// token during dispatch, keeping the historical record without
// firing into a stale address.
//
// `v3_fcm_config` is a single-row table (guarded by `id = 'default'`)
// storing the Firebase service account JSON the operator uploads via
// `/api/v3/admin/fcm-config`. The JSON lives as BLOB +
// AES-GCM IV / auth-tag the same way `v3_users.github_access_token`
// does, reusing `apps/server/src/identity/tokenEncryption.ts`. We
// store the `client_email` and `project_id` in plaintext so the
// admin panel can surface status without round-tripping the secret.
//
// Both tables run only in server-node mode; desktop / web modes keep
// them empty and inert, same pattern as migration 026.

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS v3_device_push_tokens (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES v3_devices(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES v3_users(id) ON DELETE CASCADE,
      platform TEXT NOT NULL CHECK (platform IN (
        'windows','macos','linux','android','ios','web'
      )),
      provider TEXT NOT NULL CHECK (provider IN ('fcm','apns')),
      token TEXT NOT NULL,
      app_version TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      removed_at TEXT
    )
  `;

  yield* sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_v3_device_push_tokens_device_provider_token
    ON v3_device_push_tokens(device_id, provider, token)
    WHERE removed_at IS NULL
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_v3_device_push_tokens_user_provider
    ON v3_device_push_tokens(user_id, provider)
    WHERE removed_at IS NULL
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS v3_fcm_config (
      id TEXT PRIMARY KEY CHECK (id = 'default'),
      project_id TEXT NOT NULL,
      client_email TEXT NOT NULL,
      private_key_enc BLOB NOT NULL,
      private_key_enc_iv BLOB NOT NULL,
      private_key_enc_auth_tag BLOB NOT NULL,
      uploaded_at TEXT NOT NULL,
      last_dispatch_at TEXT,
      last_error TEXT
    )
  `;
});
