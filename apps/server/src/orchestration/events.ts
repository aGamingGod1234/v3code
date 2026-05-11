import { CommandId, type MessageId, type ThreadId } from "@v3tools/contracts";
import { Effect } from "effect";

import type { OrchestrationEngineShape } from "./Services/OrchestrationEngine.ts";

const commandId = (tag: string): CommandId =>
  CommandId.make(`orchestrator:${tag}:${crypto.randomUUID()}`);

export const publishOrchestratorTurnStarted = (input: {
  readonly engine: OrchestrationEngineShape;
  readonly threadId: ThreadId;
  readonly messageId: MessageId;
  readonly createdAt: string;
}) => {
  const taskId = `turn:${input.messageId}`;
  return Effect.all(
    [
      input.engine.dispatch({
        type: "orchestrator.task.create",
        commandId: commandId("task-create"),
        threadId: input.threadId,
        taskId,
        title: "Plan and delegate user request",
        agentRole: "orchestrator",
        createdAt: input.createdAt,
      }),
      input.engine.dispatch({
        type: "orchestrator.task.assign",
        commandId: commandId("task-assign"),
        threadId: input.threadId,
        taskId,
        agentRole: "implementation",
        createdAt: input.createdAt,
      }),
      input.engine.dispatch({
        type: "agent.lane.chunk",
        commandId: commandId("lane-fallback"),
        threadId: input.threadId,
        lane: "orchestrator",
        role: "orchestrator",
        chunk: "Orchestrated mode active. Routing through the active provider runtime.",
        createdAt: input.createdAt,
      }),
    ],
    { discard: true },
  );
};
