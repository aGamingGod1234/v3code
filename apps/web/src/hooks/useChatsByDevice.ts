import type { DeviceInfo } from "@v3tools/contracts";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { selectSidebarThreadsAcrossEnvironments, useStore } from "../store";
import type { SidebarThreadSummary } from "../types";
import { useDevices } from "./useDevices";

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
  const { currentDeviceId, devices } = useDevices();

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

    return {
      activeChats,
      archivedChats,
      currentDeviceId,
      groups: devices
        .toSorted((left, right) => compareDevices(left, right, currentDeviceId))
        .map((device) => ({
          device,
          chats: chatsByDeviceId.get(device.id) ?? [],
        })),
    };
  }, [currentDeviceId, devices, threads]);
}
