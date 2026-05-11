import type {
  OrchestratorConfig,
  OrchestratorProvider,
  OrchestratorRole,
  OrchestratorRoleConfig,
} from "@v3tools/contracts";
import { AgentRouter, type OrchestratorTaskRequest } from "./AgentRouter.ts";
import { CLIProcess } from "./CLIProcess.ts";
import { TaskQueue, type OrchestratorQueuedTask } from "./TaskQueue.ts";

export interface OrchestratorSessionRoleProcess {
  readonly role: OrchestratorRole;
  readonly config: OrchestratorRoleConfig;
  readonly process: CLIProcess;
}

export interface OrchestratorSessionEvent {
  readonly type:
    | "task.created"
    | "task.assigned"
    | "task.completed"
    | "task.failed"
    | "agent.stdout"
    | "agent.stderr";
  readonly role?: OrchestratorRole;
  readonly task?: OrchestratorQueuedTask;
  readonly chunk?: string;
  readonly error?: string;
  readonly createdAt: string;
}

export interface OrchestratorSessionOptions {
  readonly config: OrchestratorConfig;
  readonly cwd?: string;
  readonly onEvent?: (event: OrchestratorSessionEvent) => void;
}

const DEFAULT_COMMAND_BY_PROVIDER: Record<OrchestratorProvider, string> = {
  claude_code: "claude",
  codex: "codex",
  gemini: "gemini",
  custom: "",
};

function buildCliArgs(role: OrchestratorRoleConfig): string[] {
  const args: string[] = [];
  if (role.model) {
    args.push("--model", role.model);
  }
  if (role.effort) {
    args.push("--effort", role.effort);
  }
  if (role.mode) {
    args.push("--mode", role.mode);
  }
  return args;
}

export class OrchestratorSession {
  readonly #options: OrchestratorSessionOptions;
  readonly #router: AgentRouter;
  readonly #queue = new TaskQueue();
  readonly #processes = new Map<OrchestratorRole, OrchestratorSessionRoleProcess>();

  constructor(options: OrchestratorSessionOptions) {
    this.#options = options;
    this.#router = new AgentRouter(options.config);
  }

  get tasks(): ReadonlyArray<OrchestratorQueuedTask> {
    return this.#queue.list();
  }

  start(): void {
    for (const role of ["orchestrator", "implementation", "assistant"] as const) {
      const config = this.#options.config[role];
      const command = DEFAULT_COMMAND_BY_PROVIDER[config.provider];
      if (!command) {
        continue;
      }
      const process = new CLIProcess({
        command,
        args: buildCliArgs(config),
        ...(this.#options.cwd !== undefined ? { cwd: this.#options.cwd } : {}),
      });
      process.on("stdout", (chunk) =>
        this.#emit({ type: "agent.stdout", role, chunk, createdAt: new Date().toISOString() }),
      );
      process.on("stderr", (chunk) =>
        this.#emit({ type: "agent.stderr", role, chunk, createdAt: new Date().toISOString() }),
      );
      this.#processes.set(role, { role, config, process });
      process.start();
    }
  }

  async runTask(task: OrchestratorTaskRequest): Promise<OrchestratorQueuedTask> {
    const created = this.#queue.create(task);
    this.#emit({ type: "task.created", task: created, createdAt: created.createdAt });

    const role = this.#router.route(task);
    const assigned = this.#queue.assign(task.id, role);
    this.#emit({ type: "task.assigned", role, task: assigned, createdAt: assigned.updatedAt });

    const roleProcess = this.#processes.get(role);
    if (!roleProcess) {
      const failed = this.#queue.fail(task.id, `No CLI process is available for ${role}.`);
      this.#emit({
        type: "task.failed",
        role,
        task: failed,
        ...(failed.error !== null ? { error: failed.error } : {}),
        createdAt: failed.updatedAt,
      });
      return failed;
    }

    roleProcess.process.write(`${task.prompt.trim()}\n`);
    return assigned;
  }

  completeTask(taskId: string): OrchestratorQueuedTask {
    const completed = this.#queue.complete(taskId);
    this.#emit({
      type: "task.completed",
      ...(completed.assignedRole !== null ? { role: completed.assignedRole } : {}),
      task: completed,
      createdAt: completed.updatedAt,
    });
    return completed;
  }

  failTask(taskId: string, error: string): OrchestratorQueuedTask {
    const failed = this.#queue.fail(taskId, error);
    this.#emit({
      type: "task.failed",
      ...(failed.assignedRole !== null ? { role: failed.assignedRole } : {}),
      task: failed,
      error,
      createdAt: failed.updatedAt,
    });
    return failed;
  }

  stop(): void {
    for (const roleProcess of this.#processes.values()) {
      roleProcess.process.stop();
    }
    this.#processes.clear();
  }

  #emit(event: OrchestratorSessionEvent): void {
    this.#options.onEvent?.(event);
  }
}
