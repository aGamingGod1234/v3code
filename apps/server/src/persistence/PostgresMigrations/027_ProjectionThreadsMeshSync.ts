// V3 mesh-sync extension for projection_threads.
//
// Adds:
// - host_device_id: thread ownership / sidebar grouping
// - last_stream_version: race-safe mesh snapshot cursor

import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS host_device_id TEXT
  `;

  yield* sql`
    ALTER TABLE projection_threads
    ADD COLUMN IF NOT EXISTS last_stream_version INTEGER NOT NULL DEFAULT 0
  `;

  yield* sql`
    UPDATE projection_threads
    SET
      host_device_id = COALESCE(
        (
          SELECT events.payload_json::jsonb ->> 'hostDeviceId'
          FROM orchestration_events AS events
          WHERE events.aggregate_kind = 'thread'
            AND events.stream_id = projection_threads.thread_id
            AND events.event_type IN ('thread.created', 'thread.meta-updated')
            AND events.payload_json::jsonb ? 'hostDeviceId'
            AND events.payload_json::jsonb ->> 'hostDeviceId' IS NOT NULL
          ORDER BY events.sequence DESC
          LIMIT 1
        ),
        host_device_id
      ),
      last_stream_version = COALESCE(
        (
          SELECT MAX(events.stream_version)
          FROM orchestration_events AS events
          WHERE events.aggregate_kind = 'thread'
            AND events.stream_id = projection_threads.thread_id
        ),
        0
      )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_host_device_id
    ON projection_threads(host_device_id)
  `;
});
