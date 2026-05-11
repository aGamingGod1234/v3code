import { EventId, type OrchestrationThreadActivity, type TurnId } from "@v3tools/contracts";

export const ORCHESTRATOR_ACTIVITY_KINDS = {
  taskCreated: "orchestrator_task_created",
  taskAssigned: "orchestrator_task_assigned",
  taskCompleted: "orchestrator_task_completed",
  agentLaneChunk: "agent_lane_chunk",
} as const;

export type OrchestratorActivityKind =
  (typeof ORCHESTRATOR_ACTIVITY_KINDS)[keyof typeof ORCHESTRATOR_ACTIVITY_KINDS];

export type AgentLaneId = "orchestrator" | "implementation" | "assistant";

export function makeOrchestratorActivity(input: {
  readonly id?: EventId;
  readonly kind: OrchestratorActivityKind;
  readonly summary: string;
  readonly lane: AgentLaneId;
  readonly taskId?: string;
  readonly chunk?: string;
  readonly status?: string;
  readonly turnId?: TurnId | null;
  readonly createdAt: string;
  readonly sequence?: number;
  readonly payload?: Record<string, unknown>;
}): OrchestrationThreadActivity {
  return {
    id: input.id ?? EventId.make(crypto.randomUUID()),
    tone: input.kind === ORCHESTRATOR_ACTIVITY_KINDS.agentLaneChunk ? "tool" : "info",
    kind: input.kind,
    summary: input.summary,
    payload: {
      lane: input.lane,
      ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
      ...(input.chunk !== undefined ? { chunk: input.chunk } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...input.payload,
    },
    turnId: input.turnId ?? null,
    createdAt: input.createdAt,
    ...(input.sequence !== undefined ? { sequence: input.sequence } : {}),
  };
}
