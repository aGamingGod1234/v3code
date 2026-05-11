import { type DeviceId, type ScopedThreadRef } from "@v3tools/contracts";
import { SendIcon } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import {
  clearForkChatOpenRequest,
  matchesScopedThreadRef,
  subscribeForkChatOpenRequests,
} from "./forkChatOpener";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useThreadActions } from "~/hooks/useThreadActions";
import { useMeshDeviceSnapshot } from "~/rpc/meshState";
import { selectSidebarThreadSummaryByRef, selectThreadByRef, useStore } from "~/store";

interface ForkChatButtonProps {
  threadRef: ScopedThreadRef;
}

const UNASSIGNED_DEVICE_VALUE = "__unassigned__";

function compareDeviceOptions(
  left: { id: string; current: boolean; online: boolean; name: string },
  right: { id: string; current: boolean; online: boolean; name: string },
): number {
  const leftScore = (left.current ? 2 : 0) + (left.online ? 1 : 0);
  const rightScore = (right.current ? 2 : 0) + (right.online ? 1 : 0);
  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }
  return left.name.localeCompare(right.name);
}

export const ForkChatButton = memo(function ForkChatButton({ threadRef }: ForkChatButtonProps) {
  const { forkThread } = useThreadActions();
  const thread = useStore((state) => selectThreadByRef(state, threadRef));
  const threadSummary = useStore((state) => selectSidebarThreadSummaryByRef(state, threadRef));
  const meshDeviceSnapshot = useMeshDeviceSnapshot();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [targetDeviceValue, setTargetDeviceValue] = useState<
    DeviceId | typeof UNASSIGNED_DEVICE_VALUE
  >(UNASSIGNED_DEVICE_VALUE);

  const orchestrationStatus = threadSummary?.session?.orchestrationStatus ?? null;
  const isLive = orchestrationStatus === "running" || orchestrationStatus === "starting";
  const hasPendingApprovals = threadSummary?.hasPendingApprovals ?? false;

  const deviceOptions = useMemo(
    () =>
      meshDeviceSnapshot.devices
        .filter((device) => device.approved)
        .map((device) => ({
          id: device.id,
          name: device.name,
          online: device.online,
          current: device.id === meshDeviceSnapshot.currentDeviceId,
          platform: device.platform,
        }))
        .sort(compareDeviceOptions),
    [meshDeviceSnapshot.currentDeviceId, meshDeviceSnapshot.devices],
  );

  const defaultTargetDeviceValue =
    meshDeviceSnapshot.currentDeviceId ?? thread?.hostDeviceId ?? UNASSIGNED_DEVICE_VALUE;

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (nextOpen) {
        setTitle("");
        setTargetDeviceValue(defaultTargetDeviceValue);
      }
    },
    [defaultTargetDeviceValue],
  );

  // Spec §9.1: the offline-host "Open on another device" toast fires
  // `requestOpenForkChatDialog(threadRef)`. Only the button rendered
  // for the matching thread should react.
  useEffect(
    () =>
      subscribeForkChatOpenRequests((requestedRef) => {
        if (!matchesScopedThreadRef(requestedRef, threadRef)) return;
        if (isLive || hasPendingApprovals) return;
        clearForkChatOpenRequest(threadRef);
        handleOpenChange(true);
      }),
    [handleOpenChange, hasPendingApprovals, isLive, threadRef],
  );

  const handleConfirm = useCallback(async () => {
    setSubmitting(true);
    try {
      const trimmedTitle = title.trim();
      const forkInput: {
        title?: string;
        targetDeviceId?: DeviceId;
      } = {};
      if (trimmedTitle.length > 0) {
        forkInput.title = trimmedTitle;
      }
      if (targetDeviceValue !== UNASSIGNED_DEVICE_VALUE) {
        forkInput.targetDeviceId = targetDeviceValue;
      }
      const result = await forkThread(threadRef, forkInput);
      if (result) {
        setOpen(false);
      }
    } finally {
      setSubmitting(false);
    }
  }, [forkThread, targetDeviceValue, threadRef, title]);

  if (!thread) {
    return null;
  }

  const disabledReason = isLive
    ? "Pause or stop the active session before transferring this chat."
    : hasPendingApprovals
      ? "Resolve pending approvals before transferring this chat."
      : "Transfer this chat into a fresh thread";

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="xs"
              className="shrink-0"
              onClick={() => handleOpenChange(true)}
              disabled={isLive || hasPendingApprovals}
              aria-label="Transfer chat"
            >
              <SendIcon className="size-3" />
            </Button>
          }
        />
        <TooltipPopup side="bottom">{disabledReason}</TooltipPopup>
      </Tooltip>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Transfer chat</DialogTitle>
            <DialogDescription>
              Copy the full chat context of <strong>{thread.title}</strong> to another signed-in
              device over the authenticated mesh. The receiving device picks the workspace folder
              before work continues there.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-4">
              {deviceOptions.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="fork-chat-device"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Target device
                  </label>
                  <Select
                    value={
                      targetDeviceValue === UNASSIGNED_DEVICE_VALUE ? undefined : targetDeviceValue
                    }
                    onValueChange={(value) =>
                      setTargetDeviceValue(
                        (value ?? UNASSIGNED_DEVICE_VALUE) as
                          | DeviceId
                          | typeof UNASSIGNED_DEVICE_VALUE,
                      )
                    }
                    items={deviceOptions.map((device) => ({
                      value: device.id,
                      label: device.name,
                    }))}
                  >
                    <SelectTrigger
                      id="fork-chat-device"
                      aria-label="Target device"
                      disabled={submitting}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      <SelectGroup>
                        <SelectGroupLabel>Available devices</SelectGroupLabel>
                        {deviceOptions.map((device) => (
                          <SelectItem key={device.id} value={device.id}>
                            <span className="inline-flex min-w-0 items-center gap-2">
                              <span className="truncate">{device.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {device.current ? "This device" : device.platform}
                                {device.online ? " - online" : " - offline"}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectPopup>
                  </Select>
                </div>
              ) : null}
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="fork-chat-title"
                  className="text-xs font-medium text-muted-foreground"
                >
                  New chat title (optional)
                </label>
                <Input
                  id="fork-chat-title"
                  value={title}
                  onChange={(event) => setTitle(event.currentTarget.value)}
                  placeholder={`Transfer of ${thread.title}`}
                  disabled={submitting}
                />
              </div>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={submitting}>
              {submitting ? "Transferring..." : "Transfer chat"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
});
