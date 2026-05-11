import type { OrchestrationThread } from "@v3tools/contracts";

const ORCHESTRATOR_PROMPT = [
  "You are running inside V3 Code orchestrated mode.",
  "Follow this loop: plan, delegate, monitor, review.",
  "Keep orchestrator output minimal between plan and review passes.",
  "Use the implementation lane for code changes and the assistant lane for focused support work.",
  "If only one runtime adapter is available, emulate lanes clearly and continue through the active provider.",
].join("\n");

export function isOrchestratedThread(thread: Pick<OrchestrationThread, "sessionMode">): boolean {
  return thread.sessionMode === "orchestrated";
}

export function buildOrchestratedTurnInput(input: {
  readonly thread: Pick<OrchestrationThread, "sessionMode" | "orchestratorConfig">;
  readonly messageText: string;
}): string {
  if (!isOrchestratedThread(input.thread)) {
    return input.messageText;
  }

  const config = input.thread.orchestratorConfig;
  const roleLines = config
    ? [
        `Orchestrator role: ${config.roles.orchestrator.provider} ${config.roles.orchestrator.model}`.trim(),
        `Implementation role: ${config.roles.implementation.provider} ${config.roles.implementation.model}`.trim(),
        `Assistant role: ${config.roles.assistant.provider} ${config.roles.assistant.model}`.trim(),
      ]
    : [];

  return [ORCHESTRATOR_PROMPT, ...roleLines, "", "User task:", input.messageText].join("\n");
}
