import { DeviceId, type DeviceInfo } from "@v3tools/contracts";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { selectSidebarThreadsAcrossEnvironments, useStore } from "../store";
import type { SidebarThreadSummary } from "../types";
import { useDevices } from "./useDevices";
import { useV3DriveAppDataSnapshot } from "./useV3DriveAppDataSnapshot";

export interface DeviceChatGroup {
  readonly device: DeviceInfo;
  readonly chats: ReadonlyArray<SidebarThreadSummary>;
}

function compareDevices(
  left: DeviceInfo,
  right: DeviceInfo,
  currentDeviceId: DeviceInfo["id"] | null,
): number {
  const leftScore =
    (left.id === currentDeviceId ? 4 : 0) + (left.online ? 2 : 0) + (left.approved ? 1 : 0);
  const rightScore =
    (right.id === currentDeviceId ? 4 : 0) + (right.online ? 2 : 0) + (right.approved ? 1 : 0);
  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }
  return left.name.localeCompare(right.name);
}

export function useChatsByDevice() {
  const threads = useStore(useShallow(selectSidebarThreadsAcrossEnvironments));
  const { currentDevice, currentDeviceId, devices } = useDevices();
  const driveSnapshot = useV3DriveAppDataSnapshot();

  return useMemo(() => {
    const activeChats = threads.filter((thread) => thread.archivedAt === null);
    const archivedChats = threads.filter((thread) => thread.archivedAt !== null);
    const chatsByDeviceId = new Map<string, SidebarThreadSummary[]>();

    for (const chat of activeChats) {
      const deviceId = chat.hostDeviceId ?? currentDeviceId;
      if (deviceId === null) {
        continue;
      }
      const chats = chatsByDeviceId.get(deviceId);
      if (chats) {
        chats.push(chat);
      } else {
        chatsByDeviceId.set(deviceId, [chat]);
      }
    }

    const deviceById = new Map(devices.map((device) => [device.id, device]));
    if (currentDevice) {
      for (const entry of driveSnapshot?.devices ?? []) {
        if (deviceById.has(entry.device_id as DeviceId)) {
          continue;
        }
        deviceById.set(entry.device_id as DeviceId, {
          id: DeviceId.make(entry.device_id),
          userId: currentDevice.userId,
          name: entry.name,
          platform: "web",
          kind: "browser",
          capabilities: ["view_only"],
          approved: true,
          online: false,
          firstSeenAt: entry.added_at as unknown as DeviceInfo["firstSeenAt"],
          lastSeenAt: null,
        });
      }
    }

    return {
      activeChats,
      archivedChats,
      currentDeviceId,
      groups: Array.from(deviceById.values())
        .toSorted((left, right) => compareDevices(left, right, currentDeviceId))
        .map((device) => ({
          device,
          chats: chatsByDeviceId.get(device.id) ?? [],
        })),
    };
  }, [currentDevice, currentDeviceId, devices, driveSnapshot?.devices, threads]);
}
