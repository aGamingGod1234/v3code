import { InfoIcon } from "lucide-react";

import type { DeviceInfo, DeviceId } from "@v3tools/contracts";

interface RemoteHostBannerProps {
  readonly currentDeviceId: DeviceId | null;
  readonly hostDeviceId: DeviceId | null | undefined;
  readonly devices: ReadonlyArray<DeviceInfo>;
}

// Spec §8.2: when the user is viewing a chat hosted on another device, a
// persistent strip above the transcript spells out what that means for
// any prompts they send. We render nothing for locally-hosted chats so
// the strip doesn't compete with the composer for space.
export function RemoteHostBanner({
  currentDeviceId,
  hostDeviceId,
  devices,
}: RemoteHostBannerProps) {
  if (
    currentDeviceId === null ||
    hostDeviceId === null ||
    hostDeviceId === undefined ||
    hostDeviceId === currentDeviceId
  ) {
    return null;
  }

  const host = devices.find((device) => device.id === hostDeviceId);
  const hostLabel = host?.name ?? "another device";
  const online = host?.online ?? false;

  return (
    <div
      role="status"
      className="flex items-start gap-2 border-b border-border/70 bg-muted/40 px-3 py-2 text-xs text-muted-foreground sm:px-5"
    >
      <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-foreground">Viewing chat hosted on {hostLabel}.</div>
        <div className="mt-0.5">
          {online
            ? "All prompts you send will run there."
            : `${hostLabel} is offline — prompts will queue locally until it reconnects.`}
        </div>
      </div>
    </div>
  );
}
