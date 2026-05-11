import {
  ChevronRightIcon,
  CloudIcon,
  GlobeIcon,
  LaptopIcon,
  MonitorIcon,
  ServerIcon,
  SmartphoneIcon,
} from "lucide-react";

import { DateTime } from "effect";
import type { DeviceInfo } from "@v3tools/contracts";
import { scopeThreadRef, scopedThreadKey } from "@v3tools/client-runtime";
import type { ReactNode } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";
import type { SidebarThreadSummary } from "../../types";
import { ChatItem } from "./ChatItem";

interface DeviceGroupProps {
  readonly chats: ReadonlyArray<SidebarThreadSummary>;
  readonly children?: ReactNode;
  readonly currentDeviceId: DeviceInfo["id"] | null;
  readonly device: DeviceInfo;
  readonly routeThreadKey: string | null;
}

function DeviceIcon({ device }: { device: DeviceInfo }) {
  switch (device.kind) {
    case "browser":
      return <GlobeIcon className="size-3.5" />;
    case "cloud":
      return <CloudIcon className="size-3.5" />;
    case "laptop":
      return <LaptopIcon className="size-3.5" />;
    case "phone":
    case "tablet":
      return <SmartphoneIcon className="size-3.5" />;
    case "server":
      return <ServerIcon className="size-3.5" />;
    default:
      return <MonitorIcon className="size-3.5" />;
  }
}

// Spec §8.1: "Hovering a device shows last-seen timestamp." The native
// `title` attribute is the lightest reliable tooltip in the sidebar — we
// avoid a tooltip portal here because the trigger is also a
// CollapsibleTrigger button and layering two focus-trapping portals over
// it hurts keyboard UX.
function buildDeviceTooltip(device: DeviceInfo): string {
  const name = device.name;
  if (device.online) {
    return `${name} · online now`;
  }
  if (device.lastSeenAt === null) {
    return `${name} · never connected`;
  }
  const formatted = DateTime.formatIso(device.lastSeenAt);
  return `${name} · last seen ${formatted}`;
}

export function DeviceGroup({
  chats,
  children,
  currentDeviceId,
  device,
  routeThreadKey,
}: DeviceGroupProps) {
  const isCurrentDevice = device.id === currentDeviceId;
  const hasChildren = children !== undefined && children !== null;

  return (
    <Collapsible
      key={`${device.id}:${isCurrentDevice ? "current" : "other"}:${device.online ? "online" : "offline"}`}
      defaultOpen={isCurrentDevice || device.online}
    >
      <CollapsibleTrigger
        title={buildDeviceTooltip(device)}
        className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-accent"
      >
        <ChevronRightIcon className="size-3.5 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90" />
        <span
          className={`inline-flex size-6 shrink-0 items-center justify-center rounded-md ${
            device.online
              ? "bg-success/12 text-success-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          <DeviceIcon device={device} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-foreground">{device.name}</div>
          <div className="truncate text-[10px] text-muted-foreground">
            {device.online ? "Online" : "Offline"}
            {isCurrentDevice ? " · This device" : ""}
            {!device.approved ? " · Pending approval" : ""}
          </div>
        </div>
        {chats.length > 0 ? (
          <span className="text-[10px] text-muted-foreground">{chats.length}</span>
        ) : null}
      </CollapsibleTrigger>

      <CollapsibleContent className="pt-1">
        {hasChildren ? (
          children
        ) : chats.length === 0 ? (
          <div className="px-10 py-1 text-[11px] text-muted-foreground/70">
            {isCurrentDevice ? "No chats yet on this device." : "Chat attribution lands next."}
          </div>
        ) : (
          <div className="flex flex-col gap-1 px-2">
            {chats.map((thread) => (
              <ChatItem
                key={`${thread.environmentId}:${thread.id}`}
                isActive={
                  routeThreadKey ===
                  scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))
                }
                thread={thread}
              />
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
