import type { OrchestrationThreadActivity } from "@v3tools/contracts";
import type { OrchestratorConfig, OrchestratorRole } from "@v3tools/contracts/orchestrator-config";
import { useMemo } from "react";

import type { Thread } from "../../types";
import { AgentLane, type AgentLaneChunk } from "./AgentLane";
import { TaskQueue, type OrchestratedTask, type OrchestratedTaskStatus } from "./TaskQueue";

const ACTIVITY_KINDS = {
  taskCreated: "orchestrator_task_created",
  taskAssigned: "orchestrator_task_assigned",
  taskCompleted: "orchestrator_task_completed",
  agentLaneChunk: "agent_lane_chunk",
} as const;

const ROLES: ReadonlyArray<OrchestratorRole> = ["orchestrator", "implementation", "assistant"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function payloadString(activity: OrchestrationThreadActivity, key: string): string | undefined {
  if (!isRecord(activity.payload)) {
    return undefined;
  }
  const value = activity.payload[key];
  return typeof value === "string" ? value : undefined;
}

function payloadLane(activity: OrchestrationThreadActivity): OrchestratorRole | null {
  const lane = payloadString(activity, "lane");
  return lane === "orchestrator" || lane === "implementation" || lane === "assistant" ? lane : null;
}

function roleModelLabel(config: OrchestratorConfig, role: OrchestratorRole): string {
  const roleConfig = config[role];
  return [roleConfig.provider, roleConfig.model, roleConfig.effort, roleConfig.mode]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" / ");
}

function taskStatusFromActivity(activity: OrchestrationThreadActivity): OrchestratedTaskStatus {
  if (activity.kind === ACTIVITY_KINDS.taskCompleted) {
    const state = payloadString(activity, "state");
    return state === "failed" || state === "interrupted" || state === "cancelled"
      ? "failed"
      : "done";
  }
  if (activity.kind === ACTIVITY_KINDS.taskAssigned) {
    return "in-progress";
  }
  return "pending";
}

function deriveOrchestratorViewState(activities: ReadonlyArray<OrchestrationThreadActivity>) {
  const laneChunks: Record<OrchestratorRole, AgentLaneChunk[]> = {
    orchestrator: [],
    implementation: [],
    assistant: [],
  };
  const laneStatuses: Record<OrchestratorRole, string> = {
    orchestrator: "pending",
    implementation: "pending",
    assistant: "pending",
  };
  const tasks = new Map<string, OrchestratedTask>();

  for (const activity of activities) {
    const lane = payloadLane(activity);
    const taskId = payloadString(activity, "taskId") ?? String(activity.id);

    if (
      activity.kind === ACTIVITY_KINDS.taskCreated ||
      activity.kind === ACTIVITY_KINDS.taskAssigned ||
      activity.kind === ACTIVITY_KINDS.taskCompleted
    ) {
      const status = taskStatusFromActivity(activity);
      tasks.set(taskId, {
        id: taskId,
        title: activity.summary,
        status,
        lane: lane ?? "orchestrator",
      });
      if (lane) {
        laneStatuses[lane] =
          status === "done" ? "done" : status === "failed" ? "failed" : "running";
      }
    }

    if (activity.kind !== ACTIVITY_KINDS.agentLaneChunk || !lane) {
      continue;
    }
    const chunk = payloadString(activity, "chunk");
    if (!chunk) {
      continue;
    }
    const bucket = laneChunks[lane];
    const previous = bucket[bucket.length - 1];
    if (lane === "implementation" && previous) {
      bucket[bucket.length - 1] = {
        ...previous,
        text: `${previous.text}${chunk}`,
        createdAt: activity.createdAt,
      };
    } else {
      bucket.push({
        id: String(activity.id),
        text: chunk,
        createdAt: activity.createdAt,
      });
    }
    if (laneStatuses[lane] === "pending") {
      laneStatuses[lane] = "active";
    }
  }

  return {
    laneChunks,
    laneStatuses,
    tasks: [...tasks.values()],
  };
}

export function OrchestratedSession(props: { thread: Thread; fallbackConfig: OrchestratorConfig }) {
  const config = props.thread.orchestratorConfig ?? props.fallbackConfig;
  const viewState = useMemo(
    () => deriveOrchestratorViewState(props.thread.activities),
    [props.thread.activities],
  );

  return (
    <div className="grid max-h-[42vh] min-h-0 gap-3 overflow-hidden border-b border-border/70 bg-background/95 p-3 sm:p-4">
      <div className="grid min-h-0 min-w-0 gap-3 overflow-hidden lg:grid-cols-3">
        {ROLES.map((role) => (
          <AgentLane
            key={role}
            role={role}
            modelLabel={roleModelLabel(config, role)}
            status={viewState.laneStatuses[role]}
            chunks={viewState.laneChunks[role]}
          />
        ))}
      </div>
      <TaskQueue tasks={viewState.tasks} />
    </div>
  );
}
