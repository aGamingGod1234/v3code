import { CheckCircle2Icon, CircleDashedIcon, Loader2Icon } from "lucide-react";

export type OrchestratedTaskStatus = "pending" | "in-progress" | "done" | "failed";

export interface OrchestratedTask {
  readonly id: string;
  readonly title: string;
  readonly status: OrchestratedTaskStatus;
  readonly lane: string;
}

const STATUS_LABELS: Record<OrchestratedTaskStatus, string> = {
  pending: "Pending",
  "in-progress": "In progress",
  done: "Done",
  failed: "Failed",
};

function TaskStatusIcon({ status }: { status: OrchestratedTaskStatus }) {
  if (status === "done") {
    return <CheckCircle2Icon className="size-3.5 text-emerald-600 dark:text-emerald-400" />;
  }
  if (status === "in-progress") {
    return <Loader2Icon className="size-3.5 animate-spin text-primary" />;
  }
  return <CircleDashedIcon className="size-3.5 text-muted-foreground" />;
}

export function TaskQueue(props: { tasks: ReadonlyArray<OrchestratedTask> }) {
  return (
    <section className="rounded-lg border border-border/70 bg-card">
      <div className="border-b border-border/60 px-3 py-2">
        <h2 className="text-xs font-semibold text-foreground">Task queue</h2>
      </div>
      <div className="grid gap-2 p-3">
        {props.tasks.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/80 px-3 py-4 text-center text-xs text-muted-foreground">
            No orchestrator tasks yet.
          </div>
        ) : (
          props.tasks.map((task) => (
            <div
              key={task.id}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md bg-muted/45 px-2.5 py-2"
            >
              <TaskStatusIcon status={task.status} />
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-foreground">{task.title}</div>
                <div className="truncate text-[11px] text-muted-foreground">{task.lane}</div>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {STATUS_LABELS[task.status]}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
