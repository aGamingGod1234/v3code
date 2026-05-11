import { DateTime } from "effect";
import type { DeviceInfo, MeshPresenceStreamItem, PresenceUpdatePayload } from "@v3tools/contracts";

import type { DeviceListSnapshot } from "../hooks/useDevices";

function parsePresenceLastSeenAt(value: string): DeviceInfo["lastSeenAt"] | null {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }
  return DateTime.fromDateUnsafe(parsed);
}

function formatDeviceLastSeenAt(value: DeviceInfo["lastSeenAt"]): string | null {
  return value === null ? null : DateTime.formatIso(value);
}

function applyPresenceUpdateToDevice(
  device: DeviceInfo,
  update: PresenceUpdatePayload,
): DeviceInfo {
  if (device.id !== update.device_id) {
    return device;
  }

  const parsedLastSeenAt = parsePresenceLastSeenAt(update.last_seen_at);
  const nextLastSeenAt = parsedLastSeenAt ?? device.lastSeenAt;
  if (
    device.online === update.online &&
    formatDeviceLastSeenAt(device.lastSeenAt) === formatDeviceLastSeenAt(nextLastSeenAt)
  ) {
    return device;
  }

  return {
    ...device,
    online: update.online,
    lastSeenAt: nextLastSeenAt,
  };
}

export function applyPresenceUpdatesToDeviceList(
  snapshot: DeviceListSnapshot,
  updates: ReadonlyArray<PresenceUpdatePayload>,
): DeviceListSnapshot {
  if (updates.length === 0 || snapshot.devices.length === 0) {
    return snapshot;
  }

  const updateByDeviceId = new Map(updates.map((update) => [update.device_id, update]));
  let changed = false;
  const devices = snapshot.devices.map((device) => {
    const update = updateByDeviceId.get(device.id);
    if (!update) {
      return device;
    }
    const nextDevice = applyPresenceUpdateToDevice(device, update);
    if (nextDevice !== device) {
      changed = true;
    }
    return nextDevice;
  });

  return changed ? { ...snapshot, devices } : snapshot;
}

export function applyPresenceStreamItemToDeviceList(
  snapshot: DeviceListSnapshot | undefined,
  item: MeshPresenceStreamItem,
): DeviceListSnapshot | undefined {
  if (!snapshot) {
    return snapshot;
  }

  if (item.kind === "snapshot") {
    return applyPresenceUpdatesToDeviceList(snapshot, item.snapshot.devices);
  }

  return applyPresenceUpdatesToDeviceList(snapshot, [item.update]);
}
