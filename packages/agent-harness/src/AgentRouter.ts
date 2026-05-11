export type AgentType = "orchestrator" | "implementation" | "assistant" | string;

export interface AgentTask {
  readonly id: string;
  readonly type: AgentType;
  readonly prompt: string;
  readonly metadata?: Record<string, unknown>;
}

export type AgentTaskHandler<Result = unknown> = (task: AgentTask) => Promise<Result>;

export class AgentRouter {
  readonly #handlers = new Map<AgentType, AgentTaskHandler>();
  #fallbackHandler: AgentTaskHandler | null = null;

  register(type: AgentType, handler: AgentTaskHandler): void {
    this.#handlers.set(type, handler);
  }

  setFallback(handler: AgentTaskHandler): void {
    this.#fallbackHandler = handler;
  }

  async route(task: AgentTask): Promise<unknown> {
    const handler = this.#handlers.get(task.type) ?? this.#fallbackHandler;
    if (!handler) {
      throw new Error(`No agent handler registered for task type '${task.type}'.`);
    }
    return handler(task);
  }
}
