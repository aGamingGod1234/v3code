// V3 Phase 10 — Devin-style live status header for an in-flight
// subagent. Renders a spinner + label + last tool name + elapsed ticker
// when the node is still running, transitions to a static state when
// completed or failed.

import { AlertCircleIcon, CheckCircle2Icon, Loader2Icon } from "lucide-react";
import { type ReactNode } from "react";

import { cn } from "~/lib/utils";

import type { SubagentNode, SubagentStatus } from "./subagentDerivation.ts";

const statusToneClass: Record<SubagentStatus, string> = {
  running: "text-info",
  completed: "text-success",
  failed: "text-destructive",
};

const StatusIcon = ({ status }: { status: SubagentStatus }) => {
  const base = cn("size-3.5", statusToneClass[status]);
  switch (status) {
    case "running":
      return <Loader2Icon className={cn(base, "animate-spin")} aria-hidden />;
    case "completed":
      return <CheckCircle2Icon className={base} aria-hidden />;
    case "failed":
      return <AlertCircleIcon className={base} aria-hidden />;
  }
};

const formatElapsed = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds - mins * 60);
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
};

const statusText = (node: SubagentNode): string => {
  switch (node.status) {
    case "running":
      if (node.lastToolName !== null) return `running · ${node.lastToolName}`;
      return "running";
    case "completed":
      return "completed";
    case "failed": {
      if (node.failureReason === null) return "failed";
      return node.failureReason === "error" ? "failed" : node.failureReason;
    }
  }
};

export interface SubagentInlineStatusProps {
  readonly node: SubagentNode;
  readonly className?: string;
  readonly trailing?: ReactNode;
}

export function SubagentInlineStatus({ node, className, trailing }: SubagentInlineStatusProps) {
  const elapsed = formatElapsed(node.elapsedSeconds);
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm leading-none",
        statusToneClass[node.status],
        className,
      )}
      data-slot="subagent-inline-status"
    >
      <StatusIcon status={node.status} />
      <span className="font-medium text-foreground">{node.label}</span>
      <span className="text-muted-foreground">·</span>
      <span className="text-muted-foreground">{statusText(node)}</span>
      {elapsed !== "" ? (
        <>
          <span className="text-muted-foreground">·</span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{elapsed}</span>
        </>
      ) : null}
      {trailing !== undefined ? <div className="ml-auto">{trailing}</div> : null}
    </div>
  );
}
