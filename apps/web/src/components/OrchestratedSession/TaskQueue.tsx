import type { OrchestrationThreadActivity } from "@v3tools/contracts";
import { CheckCircle2Icon, CircleDashedIcon, Loader2Icon } from "lucide-react";

import { cn } from "~/lib/utils";

export interface OrchestratorTask {
  readonly id: string;
  readonly title: string;
  readonly agentRole: string;
  readonly status: "pending" | "in_progress" | "done";
  readonly result: string | null;
  readonly updatedAt: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

export function deriveOrchestratorTasks(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
): OrchestratorTask[] {
  const tasks = new Map<string, OrchestratorTask>();

  for (const activity of activities) {
    if (!isRecord(activity.payload)) continue;
    const taskId = asString(activity.payload.taskId);
    if (!taskId) continue;

    if (activity.kind === "orchestrator_task_created") {
      tasks.set(taskId, {
        id: taskId,
        title: asString(activity.payload.title) ?? activity.summary,
        agentRole: asString(activity.payload.agentRole) ?? "orchestrator",
        status: "pending",
        result: null,
        updatedAt: activity.createdAt,
      });
      continue;
    }

    const existing =
      tasks.get(taskId) ??
      ({
        id: taskId,
        title: activity.summary,
        agentRole: asString(activity.payload.agentRole) ?? "implementation",
        status: "pending",
        result: null,
        updatedAt: activity.createdAt,
      } satisfies OrchestratorTask);

    if (activity.kind === "orchestrator_task_assigned") {
      tasks.set(taskId, {
        ...existing,
        agentRole: asString(activity.payload.agentRole) ?? existing.agentRole,
        status: "in_progress",
        updatedAt: activity.createdAt,
      });
      continue;
    }

    if (activity.kind === "orchestrator_task_completed") {
      tasks.set(taskId, {
        ...existing,
        status: "done",
        result: asString(activity.payload.result),
        updatedAt: activity.createdAt,
      });
    }
  }

  return [...tasks.values()].toSorted((left, right) =>
    left.updatedAt.localeCompare(right.updatedAt),
  );
}

export function TaskQueue({ tasks }: { readonly tasks: ReadonlyArray<OrchestratorTask> }) {
  return (
    <section className="flex min-h-0 flex-col border-border/70 border-b bg-muted/20">
      <div className="flex min-h-10 items-center justify-between px-3">
        <h2 className="text-[11px] font-semibold uppercase text-muted-foreground">Task Queue</h2>
        <span className="text-[11px] text-muted-foreground">{tasks.length} total</span>
      </div>
      <div className="flex min-h-0 gap-2 overflow-x-auto border-border/70 border-t px-3 py-2">
        {tasks.length === 0 ? (
          <div className="text-muted-foreground text-xs">No orchestrator tasks yet.</div>
        ) : (
          tasks.map((task) => <TaskQueueItem key={task.id} task={task} />)
        )}
      </div>
    </section>
  );
}

function TaskQueueItem({ task }: { readonly task: OrchestratorTask }) {
  const Icon =
    task.status === "done"
      ? CheckCircle2Icon
      : task.status === "in_progress"
        ? Loader2Icon
        : CircleDashedIcon;

  return (
    <div className="flex min-w-56 max-w-72 shrink-0 items-start gap-2 rounded-md border border-border/70 bg-background px-3 py-2">
      <Icon
        className={cn(
          "mt-0.5 size-3.5 shrink-0",
          task.status === "done"
            ? "text-sky-500"
            : task.status === "in_progress"
              ? "animate-spin text-emerald-500"
              : "text-muted-foreground/70",
        )}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium text-foreground">{task.title}</div>
        <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
          {task.agentRole} / {task.status.replace("_", " ")}
        </div>
      </div>
    </div>
  );
}
