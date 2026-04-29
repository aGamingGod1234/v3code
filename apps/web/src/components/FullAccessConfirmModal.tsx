// Full-access per-run confirmation. Settings.permissions.mode === "full-access"
// alone does NOT grant unrestricted access. Each run prompts:
//   * Allow once — single run only.
//   * Allow for this workspace — persists { cwd, grantedAt } under
//     settings.permissions.fullAccessRememberByProject keyed by projectId.
//     Before skipping the prompt for a known project, the runner verifies
//     that the project's current cwd still matches the remembered cwd.
//   * Cancel — abort the run.
// The user must type "ENABLE FULL ACCESS" to confirm.

import { useEffect, useState } from "react";

import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { useSettings, useUpdateSettings } from "../hooks/useSettings";

const CONFIRM_PHRASE = "ENABLE FULL ACCESS";

export type FullAccessConfirmDecision = "allow-once" | "allow-workspace" | "cancel";

interface FullAccessConfirmModalProps {
  readonly open: boolean;
  readonly projectId: string;
  readonly cwd: string;
  readonly onResolve: (decision: FullAccessConfirmDecision) => void;
}

export function FullAccessConfirmModal({
  open,
  projectId,
  cwd,
  onResolve,
}: FullAccessConfirmModalProps) {
  const { updateSettings } = useUpdateSettings();
  const permissions = useSettings((s) => s.permissions);
  const [confirmation, setConfirmation] = useState("");

  useEffect(() => {
    if (!open) setConfirmation("");
  }, [open]);

  const phraseMatches = confirmation === CONFIRM_PHRASE;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onResolve("cancel")}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Grant full access for this run?</DialogTitle>
          <DialogDescription>
            The agent will have unrestricted file-system and network access on this device. This
            significantly increases the risk of data loss, leaks, or unexpected behaviour.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-3 text-xs text-muted-foreground">
          <div>
            <span className="font-medium text-foreground">Workspace:</span> {cwd}
          </div>
          <div>
            Type <code className="rounded bg-muted px-1">{CONFIRM_PHRASE}</code> to enable:
          </div>
          <input
            type="text"
            value={confirmation}
            onChange={(event) => setConfirmation(event.currentTarget.value)}
            placeholder={CONFIRM_PHRASE}
            className="h-9 w-full rounded-md border border-border bg-background px-2 font-mono text-xs"
          />
        </DialogPanel>
        <DialogFooter variant="bare">
          <Button variant="outline" onClick={() => onResolve("cancel")}>
            Cancel
          </Button>
          <Button
            variant="outline"
            disabled={!phraseMatches}
            onClick={() => {
              updateSettings({
                permissions: {
                  ...permissions,
                  fullAccessRememberByProject: {
                    ...permissions.fullAccessRememberByProject,
                    [projectId]: { cwd, grantedAt: new Date().toISOString() },
                  },
                },
              });
              onResolve("allow-workspace");
            }}
          >
            Allow for this workspace
          </Button>
          <Button disabled={!phraseMatches} onClick={() => onResolve("allow-once")}>
            Allow once
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
