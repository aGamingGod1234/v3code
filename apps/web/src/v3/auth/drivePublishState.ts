import { Schema } from "effect";

export const V3_PENDING_DRIVE_PUBLISH_KEY = "v3.pending-drive-publish";

export const PendingDrivePublish = Schema.Struct({
  server_url: Schema.NullOr(Schema.String),
  server_version_installed: Schema.String,
  setup_at: Schema.String,
  device_id: Schema.String,
  device_name: Schema.String,
});
export type PendingDrivePublish = typeof PendingDrivePublish.Type;

export function readPendingDrivePublish(): PendingDrivePublish | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(V3_PENDING_DRIVE_PUBLISH_KEY);
    return raw ? Schema.decodeUnknownSync(PendingDrivePublish)(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writePendingDrivePublish(value: PendingDrivePublish): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(V3_PENDING_DRIVE_PUBLISH_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function clearPendingDrivePublish(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(V3_PENDING_DRIVE_PUBLISH_KEY);
  } catch {
    // ignore
  }
}
