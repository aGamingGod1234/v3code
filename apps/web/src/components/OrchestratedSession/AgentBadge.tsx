import type { OrchestratorRole } from "@v3tools/contracts/orchestrator-config";

import { cn } from "../../lib/utils";

const ROLE_LABELS: Record<OrchestratorRole, string> = {
  orchestrator: "Orchestrator",
  implementation: "Implementation",
  assistant: "Assistant",
};

const STATUS_CLASS: Record<string, string> = {
  active: "bg-primary/10 text-primary",
  running: "bg-primary/10 text-primary",
  done: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  pending: "bg-muted text-muted-foreground",
  assigned: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  failed: "bg-destructive/10 text-destructive",
};

export function AgentBadge(props: { role: OrchestratorRole; modelLabel: string; status: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold text-foreground">
          {ROLE_LABELS[props.role]}
        </div>
        <div className="truncate text-[11px] text-muted-foreground">{props.modelLabel}</div>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]",
          STATUS_CLASS[props.status] ?? STATUS_CLASS.pending,
        )}
      >
        {props.status}
      </span>
    </div>
  );
}
