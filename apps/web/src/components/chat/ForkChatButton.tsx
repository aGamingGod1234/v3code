import { type ScopedThreadRef } from "@v3tools/contracts";
import { GitForkIcon } from "lucide-react";
import { memo, useCallback, useState } from "react";

import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useThreadActions } from "~/hooks/useThreadActions";
import { selectThreadByRef, useStore } from "~/store";

interface ForkChatButtonProps {
  threadRef: ScopedThreadRef;
}

export const ForkChatButton = memo(function ForkChatButton({ threadRef }: ForkChatButtonProps) {
  const { forkThread } = useThreadActions();
  const thread = useStore((state) => selectThreadByRef(state, threadRef));
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");

  const orchestrationStatus = thread?.session?.orchestrationStatus ?? null;
  const isLive = orchestrationStatus === "running" || orchestrationStatus === "starting";

  const handleConfirm = useCallback(async () => {
    setSubmitting(true);
    try {
      const trimmed = title.trim();
      const result = await forkThread(threadRef, {
        ...(trimmed.length > 0 ? { title: trimmed } : {}),
      });
      if (result) {
        setOpen(false);
        setTitle("");
      }
    } finally {
      setSubmitting(false);
    }
  }, [forkThread, threadRef, title]);

  if (!thread) {
    return null;
  }

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
              onClick={() => setOpen(true)}
              disabled={isLive}
              aria-label="Fork chat"
            >
              <GitForkIcon className="size-3" />
            </Button>
          }
        />
        <TooltipPopup side="bottom">
          {isLive
            ? "Pause or stop the active session before forking this chat."
            : "Fork this chat into a fresh thread"}
        </TooltipPopup>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Fork chat</DialogTitle>
            <DialogDescription>
              Copies the full event history of <strong>{thread.title}</strong> into a new thread in
              the same project. The new thread starts with the same messages, settings, and
              worktree, but you can keep iterating on it independently.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
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
                placeholder={`Fork of ${thread.title}`}
                disabled={submitting}
              />
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirm} disabled={submitting}>
              {submitting ? "Forking…" : "Fork chat"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
});
