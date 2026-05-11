export type OrchestratorTaskStatus = "pending" | "in_progress" | "done" | "failed";

export interface OrchestratorTaskRecord {
  readonly id: string;
  readonly title: string;
  readonly agentRole: string;
  readonly status: OrchestratorTaskStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly result?: string;
}

export type TaskQueueEvent =
  | {
      readonly type: "orchestrator_task_created";
      readonly taskId: string;
      readonly title: string;
      readonly agentRole: string;
      readonly createdAt: string;
    }
  | {
      readonly type: "orchestrator_task_assigned";
      readonly taskId: string;
      readonly agentRole: string;
      readonly createdAt: string;
    }
  | {
      readonly type: "orchestrator_task_completed";
      readonly taskId: string;
      readonly result?: string;
      readonly createdAt: string;
    };

export interface TaskQueueEventStore {
  readonly append: (event: TaskQueueEvent) => Promise<void>;
  readonly read: () => Promise<ReadonlyArray<TaskQueueEvent>>;
}

export class TaskQueue {
  readonly #tasks = new Map<string, OrchestratorTaskRecord>();
  readonly #store: TaskQueueEventStore | null;

  constructor(store?: TaskQueueEventStore) {
    this.#store = store ?? null;
  }

  async hydrate(): Promise<void> {
    if (!this.#store) {
      return;
    }
    for (const event of await this.#store.read()) {
      this.apply(event);
    }
  }

  list(): ReadonlyArray<OrchestratorTaskRecord> {
    return [...this.#tasks.values()].toSorted((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
  }

  async create(input: {
    readonly id: string;
    readonly title: string;
    readonly agentRole: string;
    readonly createdAt: string;
  }): Promise<void> {
    await this.#appendAndApply({
      type: "orchestrator_task_created",
      taskId: input.id,
      title: input.title,
      agentRole: input.agentRole,
      createdAt: input.createdAt,
    });
  }

  async assign(input: {
    readonly id: string;
    readonly agentRole: string;
    readonly createdAt: string;
  }): Promise<void> {
    await this.#appendAndApply({
      type: "orchestrator_task_assigned",
      taskId: input.id,
      agentRole: input.agentRole,
      createdAt: input.createdAt,
    });
  }

  async complete(input: {
    readonly id: string;
    readonly result?: string;
    readonly createdAt: string;
  }): Promise<void> {
    await this.#appendAndApply({
      type: "orchestrator_task_completed",
      taskId: input.id,
      ...(input.result !== undefined ? { result: input.result } : {}),
      createdAt: input.createdAt,
    });
  }

  apply(event: TaskQueueEvent): void {
    if (event.type === "orchestrator_task_created") {
      this.#tasks.set(event.taskId, {
        id: event.taskId,
        title: event.title,
        agentRole: event.agentRole,
        status: "pending",
        createdAt: event.createdAt,
        updatedAt: event.createdAt,
      });
      return;
    }

    const existing = this.#tasks.get(event.taskId);
    if (!existing) {
      return;
    }

    if (event.type === "orchestrator_task_assigned") {
      this.#tasks.set(event.taskId, {
        ...existing,
        agentRole: event.agentRole,
        status: "in_progress",
        updatedAt: event.createdAt,
      });
      return;
    }

    this.#tasks.set(event.taskId, {
      ...existing,
      status: "done",
      ...(event.result !== undefined ? { result: event.result } : {}),
      updatedAt: event.createdAt,
    });
  }

  async #appendAndApply(event: TaskQueueEvent): Promise<void> {
    await this.#store?.append(event);
    this.apply(event);
  }
}
