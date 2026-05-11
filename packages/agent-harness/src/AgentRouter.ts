import type { OrchestratorConfig, OrchestratorRole } from "@v3tools/contracts";

export type OrchestratorTaskType = "planning" | "implementation" | "review" | "assistant";

export interface OrchestratorTaskRequest {
  readonly id: string;
  readonly type: OrchestratorTaskType;
  readonly prompt: string;
}

const ROLE_BY_TASK_TYPE: Record<OrchestratorTaskType, OrchestratorRole> = {
  planning: "orchestrator",
  implementation: "implementation",
  review: "assistant",
  assistant: "assistant",
};

export class AgentRouter {
  readonly #config: OrchestratorConfig;

  constructor(config: OrchestratorConfig) {
    this.#config = config;
  }

  route(task: OrchestratorTaskRequest): OrchestratorRole {
    if (this.#config.fastMode && task.type === "planning") {
      return "implementation";
    }
    return ROLE_BY_TASK_TYPE[task.type];
  }
}
