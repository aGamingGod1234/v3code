import { scopeProjectRef } from "@v3tools/client-runtime";
import { type ScopedThreadRef } from "@v3tools/contracts";
import { FolderTreeIcon, GitForkIcon } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";

import { readEnvironmentApi } from "~/environmentApi";
import { newCommandId } from "~/lib/utils";
import { readLocalApi } from "~/localApi";
import { useMeshDeviceSnapshot } from "~/rpc/meshState";
import { selectProjectByRef, selectThreadByRef, useStore } from "~/store";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { toastManager } from "~/components/ui/toast";

interface ForkAcceptDialogProps {
  threadRef: ScopedThreadRef;
}

export const ForkAcceptDialog = memo(function ForkAcceptDialog({
  threadRef,
}: ForkAcceptDialogProps) {
  const thread = useStore((state) => selectThreadByRef(state, threadRef));
  const project = useStore((state) =>
    thread
      ? selectProjectByRef(state, scopeProjectRef(threadRef.environmentId, thread.projectId))
      : undefined,
  );
  const meshDeviceSnapshot = useMeshDeviceSnapshot();
  const [submitting, setSubmitting] = useState(false);

  const sourceDeviceName = useMemo(() => {
    const parentDeviceId = thread?.forkLineage?.parentDeviceId;
    if (!parentDeviceId) {
      return null;
    }
    return meshDeviceSnapshot.devices.find((device) => device.id === parentDeviceId)?.name ?? null;
  }, [meshDeviceSnapshot.devices, thread?.forkLineage?.parentDeviceId]);

  const canAcceptFork =
    thread !== undefined &&
    thread.forkLineage != null &&
    thread.worktreePath === null &&
    (thread.hostDeviceId === null || thread.hostDeviceId === meshDeviceSnapshot.currentDeviceId);

  const chooseFolder = useCallback(async () => {
    const api = readEnvironmentApi(threadRef.environmentId);
    const localApi = readLocalApi();
    if (!api) {
      return;
    }
    if (!localApi) {
      toastManager.add({
        type: "error",
        title: "Desktop folder picker unavailable",
        description: "Open this chat in the desktop app to choose a local folder for the fork.",
      });
      return;
    }

    setSubmitting(true);
    try {
      const selectedPath = await localApi.dialogs.pickFolder(
        project?.cwd ? { initialPath: project.cwd } : undefined,
      );
      if (!selectedPath) {
        return;
      }

      await api.orchestration.dispatchCommand({
        type: "thread.meta.update",
        commandId: newCommandId(),
        threadId: threadRef.threadId,
        worktreePath: selectedPath,
      });

      toastManager.add({
        type: "success",
        title: "Fork folder saved",
        description: `This fork will now use ${selectedPath}.`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error choosing a folder for this fork.";
      toastManager.add({
        type: "error",
        title: "Could not prepare fork",
        description: message,
      });
    } finally {
      setSubmitting(false);
    }
  }, [project?.cwd, threadRef.environmentId, threadRef.threadId]);

  if (!canAcceptFork || thread?.forkLineage == null) {
    return null;
  }

  return (
    <div className="border-b border-border px-3 py-3 sm:px-5">
      <Alert variant="info">
        <GitForkIcon className="mt-0.5 size-4" />
        <AlertTitle>Choose a local folder for this fork</AlertTitle>
        <AlertDescription>
          <span>
            {sourceDeviceName
              ? `This chat was forked from ${sourceDeviceName}.`
              : "This chat was forked from another chat."}{" "}
            Pick the folder this device should use for the new working copy before you continue.
          </span>
          {project?.cwd ? (
            <span className="text-xs">
              Folder picker starts in <strong>{project.cwd}</strong>.
            </span>
          ) : null}
        </AlertDescription>
        <AlertAction>
          <Button type="button" size="sm" onClick={chooseFolder} disabled={submitting}>
            <FolderTreeIcon className="size-4" />
            {submitting ? "Saving..." : "Choose folder"}
          </Button>
        </AlertAction>
      </Alert>
    </div>
  );
});
