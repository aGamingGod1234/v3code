// V3 Drive App Data schema (spec §3.4).
//
// Each signed-in Google account stores one `v3_config.json` blob in its
// per-app Drive `appDataFolder`. The blob is how multiple devices on the
// same Google account auto-discover each other's server node URL without
// talking to any backend owned by Lucas. Drive App Data is invisible to
// the user and has a ~10 MB per-app quota; a populated V3 blob is under
// 10 KB in realistic use.
//
// `server_url`, `server_version_installed`, and `setup_at` are optional
// because the blob is populated incrementally:
//   * A fresh install with only one device may not have the blob at all
//     (we never bootstrap it in single-device mode).
//   * After the server-node setup wizard (P2d) runs, `server_url` plus
//     the version/setup timestamp are written.
// `device_list` is always present once any device has written the blob —
// even if empty — so subsequent devices can append themselves
// deterministically.

import { Schema } from "effect";

export const DriveDeviceEntry = Schema.Struct({
  device_id: Schema.String,
  name: Schema.String,
  added_at: Schema.String,
});
export type DriveDeviceEntry = typeof DriveDeviceEntry.Type;

export const V3DriveConfigPayload = Schema.Struct({
  server_url: Schema.optional(Schema.String),
  server_version_installed: Schema.optional(Schema.String),
  setup_at: Schema.optional(Schema.String),
  device_list: Schema.Array(DriveDeviceEntry),
});
export type V3DriveConfigPayload = typeof V3DriveConfigPayload.Type;

export const V3DriveConfig = Schema.Struct({
  v3_config: V3DriveConfigPayload,
});
export type V3DriveConfig = typeof V3DriveConfig.Type;

export const V3_DRIVE_FILE_NAME = "v3_config.json";
