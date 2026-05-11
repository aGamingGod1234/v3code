import type { OrchestrationThreadActivity } from "@v3tools/contracts";
import type { TimestampFormat } from "@v3tools/contracts/settings";
import { useMemo } from "react";

import type { ChatMessage, Thread } from "../../types";
import { AgentBadge } from "./AgentBadge";
import { AgentLane, type AgentLaneEntry } from "./AgentLane";
import { deriveOrchestratorTasks, TaskQueue } from "./TaskQueue";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

function formatActivityTime(value: string, timestampFormat: TimestampFormat): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const hour12 =
    timestampFormat === "12-hour" ? true : timestampFormat === "24-hour" ? false : undefined;
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    ...(hour12 !== undefined ? { hour12 } : {}),
  }).format(date);
}

function buildLaneEntryFromActivity(
  activity: OrchestrationThreadActivity,
  timestampFormat: TimestampFormat,
): AgentLaneEntry | null {
  if (!isRecord(activity.payload)) return null;

  if (activity.kind === "agent_lane_chunk") {
    const text = asString(activity.payload.chunk);
    if (!text) return null;
    return {
      id: activity.id,
      text,
      at: formatActivityTime(activity.createdAt, timestampFormat),
      tone: activity.tone,
    };
  }

  if (
    activity.kind === "orchestrator_task_created" ||
    activity.kind === "orchestrator_task_assigned" ||
    activity.kind === "orchestrator_task_completed"
  ) {
    return {
      id: activity.id,
      text: activity.summary,
      at: formatActivityTime(activity.createdAt, timestampFormat),
      tone: activity.tone,
    };
  }

  return null;
}

function getLaneName(activity: OrchestrationThreadActivity): string | null {
  if (!isRecord(activity.payload)) return null;
  return asString(activity.payload.lane) ?? asString(activity.payload.role);
}

function buildAssistantMessageEntries(
  messages: ReadonlyArray<ChatMessage>,
  timestampFormat: TimestampFormat,
): AgentLaneEntry[] {
  return messages
    .filter((message) => message.role === "assistant" && message.text.trim().length > 0)
    .slice(-8)
    .map((message) => ({
      id: message.id,
      text: message.text,
      at: formatActivityTime(message.createdAt, timestampFormat),
    }));
}

export function OrchestratedSession({
  thread,
  isWorking,
  timestampFormat,
}: {
  readonly thread: Thread;
  readonly isWorking: boolean;
  readonly timestampFormat: TimestampFormat;
}) {
  const config = thread.orchestratorConfig;
  const tasks = useMemo(() => deriveOrchestratorTasks(thread.activities), [thread.activities]);
  const lanes = useMemo(() => {
    const orchestrator: AgentLaneEntry[] = [];
    const implementation: AgentLaneEntry[] = [];
    const assistant: AgentLaneEntry[] = [];

    for (const activity of thread.activities) {
      const entry = buildLaneEntryFromActivity(activity, timestampFormat);
      if (!entry) continue;

      const lane = getLaneName(activity);
      if (lane === "implementation") {
        implementation.push(entry);
      } else if (lane === "assistant" || lane === "subagent") {
        assistant.push(entry);
      } else {
        orchestrator.push(entry);
      }
    }

    implementation.push(...buildAssistantMessageEntries(thread.messages, timestampFormat));

    for (const subAgent of config?.subAgents ?? []) {
      if (!subAgent.enabled) continue;
      assistant.unshift({
        id: `subagent:${subAgent.id}`,
        text: `${subAgent.name}: ${subAgent.role}`,
        at: null,
      });
    }

    return { orchestrator, implementation, assistant };
  }, [config?.subAgents, thread.activities, thread.messages, timestampFormat]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <TaskQueue tasks={tasks} />
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden border-border/70 border-t lg:grid-cols-3">
        <AgentLane
          title="Orchestrator"
          badge={
            <AgentBadge
              role="orchestrator"
              config={config?.roles.orchestrator ?? null}
              status={isWorking ? "active" : "idle"}
            />
          }
          entries={lanes.orchestrator}
          emptyText="The orchestrator has not emitted planning output yet."
        />
        <AgentLane
          title="Implementation"
          badge={
            <AgentBadge
              role="implementation"
              config={config?.roles.implementation ?? null}
              status={isWorking ? "active" : "idle"}
            />
          }
          entries={lanes.implementation}
          emptyText="Implementation output will stream here."
        />
        <AgentLane
          title="Assistant + Sub-agents"
          badge={
            <AgentBadge role="assistant" config={config?.roles.assistant ?? null} status="idle" />
          }
          entries={lanes.assistant}
          emptyText="Assistant and configured sub-agent output will stream here."
        />
      </div>
    </div>
  );
}
