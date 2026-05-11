import type { OrchestratorConfig } from "@v3tools/contracts";

import { CLIProcess, type CLIProcessOptions } from "./CLIProcess.ts";
import { AgentRouter, type AgentTask } from "./AgentRouter.ts";
import { TaskQueue } from "./TaskQueue.ts";

export type OrchestratorRole = "orchestrator" | "implementation" | "assistant";

export type OrchestratorProcessFactory = (
  role: OrchestratorRole,
  config: OrchestratorConfig["roles"][OrchestratorRole],
) => CLIProcessOptions | null;

export interface OrchestratorSessionOptions {
  readonly config: OrchestratorConfig;
  readonly processFactory: OrchestratorProcessFactory;
  readonly taskQueue?: TaskQueue;
}

export class OrchestratorSession {
  readonly #config: OrchestratorConfig;
  readonly #processFactory: OrchestratorProcessFactory;
  readonly #processes = new Map<OrchestratorRole, CLIProcess>();

  readonly router = new AgentRouter();
  readonly taskQueue: TaskQueue;

  constructor(options: OrchestratorSessionOptions) {
    this.#config = options.config;
    this.#processFactory = options.processFactory;
    this.taskQueue = options.taskQueue ?? new TaskQueue();
  }

  startRole(role: OrchestratorRole): CLIProcess | null {
    const existing = this.#processes.get(role);
    if (existing?.running) {
      return existing;
    }

    const processOptions = this.#processFactory(role, this.#config.roles[role]);
    if (!processOptions) {
      return null;
    }

    const cli = new CLIProcess({ ...processOptions, label: processOptions.label ?? role });
    cli.start();
    this.#processes.set(role, cli);
    return cli;
  }

  stopRole(role: OrchestratorRole): void {
    this.#processes.get(role)?.stop();
    this.#processes.delete(role);
  }

  stopAll(): void {
    for (const role of this.#processes.keys()) {
      this.stopRole(role);
    }
  }

  sleepOrchestrator(): void {
    this.stopRole("orchestrator");
  }

  async dispatch(task: AgentTask): Promise<unknown> {
    return this.router.route(task);
  }
}
