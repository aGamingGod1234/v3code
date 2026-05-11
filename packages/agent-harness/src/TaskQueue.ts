import type { OrchestratorRole } from "@v3tools/contracts";
import type { OrchestratorTaskRequest } from "./AgentRouter.ts";

export type OrchestratorTaskState = "pending" | "assigned" | "done" | "failed";

export interface OrchestratorQueuedTask extends OrchestratorTaskRequest {
  readonly state: OrchestratorTaskState;
  readonly assignedRole: OrchestratorRole | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly error: string | null;
}

export class TaskQueue {
  readonly #tasks = new Map<string, OrchestratorQueuedTask>();

  create(
    task: OrchestratorTaskRequest,
    createdAt = new Date().toISOString(),
  ): OrchestratorQueuedTask {
    const queued: OrchestratorQueuedTask = {
      ...task,
      state: "pending",
      assignedRole: null,
      createdAt,
      updatedAt: createdAt,
      completedAt: null,
      error: null,
    };
    this.#tasks.set(task.id, queued);
    return queued;
  }

  assign(
    taskId: string,
    role: OrchestratorRole,
    updatedAt = new Date().toISOString(),
  ): OrchestratorQueuedTask {
    const existing = this.#requireTask(taskId);
    const next: OrchestratorQueuedTask = {
      ...existing,
      state: "assigned",
      assignedRole: role,
      updatedAt,
    };
    this.#tasks.set(taskId, next);
    return next;
  }

  complete(taskId: string, completedAt = new Date().toISOString()): OrchestratorQueuedTask {
    const existing = this.#requireTask(taskId);
    const next: OrchestratorQueuedTask = {
      ...existing,
      state: "done",
      updatedAt: completedAt,
      completedAt,
      error: null,
    };
    this.#tasks.set(taskId, next);
    return next;
  }

  fail(
    taskId: string,
    error: string,
    completedAt = new Date().toISOString(),
  ): OrchestratorQueuedTask {
    const existing = this.#requireTask(taskId);
    const next: OrchestratorQueuedTask = {
      ...existing,
      state: "failed",
      updatedAt: completedAt,
      completedAt,
      error,
    };
    this.#tasks.set(taskId, next);
    return next;
  }

  list(): ReadonlyArray<OrchestratorQueuedTask> {
    return [...this.#tasks.values()].toSorted((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
  }

  #requireTask(taskId: string): OrchestratorQueuedTask {
    const task = this.#tasks.get(taskId);
    if (!task) {
      throw new Error(`Unknown orchestrator task '${taskId}'.`);
    }
    return task;
  }
}
