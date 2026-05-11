import {
  type ModelSelection,
  type OrchestratorConfig,
  type OrchestratorProvider,
  type OrchestratorRoleConfig,
  type ProviderKind,
} from "@v3tools/contracts";
import { createModelSelection } from "@v3tools/shared/model";

const GENERIC_PROVIDER_LABELS: Record<OrchestratorProvider, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
  gemini: "Gemini",
  custom: "Custom",
};

const RUNTIME_PROVIDER_LABELS: Record<ProviderKind, string> = {
  claudeAgent: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  opencode: "OpenCode",
};

function isOpenAiEffort(value: string | null): value is "xhigh" | "high" | "medium" | "low" {
  return value === "xhigh" || value === "high" || value === "medium" || value === "low";
}

function isClaudeEffort(
  value: string | null,
): value is "xhigh" | "high" | "medium" | "low" | "max" | "ultrathink" {
  return (
    value === "xhigh" ||
    value === "high" ||
    value === "medium" ||
    value === "low" ||
    value === "max" ||
    value === "ultrathink"
  );
}

export function genericProviderLabel(provider: OrchestratorProvider): string {
  return GENERIC_PROVIDER_LABELS[provider];
}

export function roleConfigLabel(role: OrchestratorRoleConfig): string {
  const parts = [genericProviderLabel(role.provider), role.model];
  if (role.effort) {
    parts.push(role.effort);
  }
  if (role.mode) {
    parts.push(role.mode);
  }
  return parts.join(" / ");
}

export function modelSelectionLabel(modelSelection: ModelSelection): string {
  const parts = [RUNTIME_PROVIDER_LABELS[modelSelection.provider], modelSelection.model];
  if (modelSelection.options) {
    if ("reasoningEffort" in modelSelection.options && modelSelection.options.reasoningEffort) {
      parts.push(modelSelection.options.reasoningEffort);
    }
    if ("effort" in modelSelection.options && modelSelection.options.effort) {
      parts.push(modelSelection.options.effort);
    }
    if ("fastMode" in modelSelection.options && modelSelection.options.fastMode === true) {
      parts.push("fast");
    }
  }
  return parts.join(" / ");
}

export function implementationRoleToModelSelection(
  role: OrchestratorRoleConfig,
): ModelSelection | null {
  if (role.provider === "codex") {
    return createModelSelection(role.provider, role.model, {
      ...(isOpenAiEffort(role.effort) ? { reasoningEffort: role.effort } : {}),
      ...(role.mode === "fast" ? { fastMode: true } : {}),
    });
  }
  if (role.provider === "claude_code") {
    return createModelSelection("claudeAgent", role.model, {
      ...(isClaudeEffort(role.effort) ? { effort: role.effort } : {}),
      ...(role.mode === "fast" ? { fastMode: true } : {}),
    });
  }
  return null;
}

export function resolveImplementationDispatch(input: {
  readonly role: OrchestratorRoleConfig;
  readonly fallbackModelSelection: ModelSelection;
}): {
  readonly modelSelection: ModelSelection;
  readonly fallbackReason: string | null;
} {
  const configuredModelSelection = implementationRoleToModelSelection(input.role);
  if (configuredModelSelection) {
    return {
      modelSelection: configuredModelSelection,
      fallbackReason: null,
    };
  }

  return {
    modelSelection: input.fallbackModelSelection,
    fallbackReason: `${genericProviderLabel(input.role.provider)} is configured for the implementation lane, but this server build only has runtime adapters for ${Object.values(RUNTIME_PROVIDER_LABELS).join(", ")}. Routing implementation through ${modelSelectionLabel(input.fallbackModelSelection)} for this turn.`,
  };
}

export function buildOrchestratedImplementationPrompt(input: {
  readonly config: OrchestratorConfig;
  readonly fallbackReason?: string | null;
  readonly runtimeModelSelection?: ModelSelection;
  readonly userMessage: string;
}): string {
  const planningDirective = input.config.fastMode
    ? "Fast mode is enabled: skip a separate planning pass and route directly to implementation."
    : "Use a concise internal planning pass before implementation, then execute decisively.";
  const budget =
    input.config.planningBudget === "auto"
      ? "auto"
      : `${Math.max(0, Math.floor(input.config.planningBudget))}`;

  return [
    "You are the implementation lane in a V3 orchestrated session.",
    planningDirective,
    `Planning budget: ${budget}.`,
    `Orchestrator lane: ${roleConfigLabel(input.config.orchestrator)}.`,
    `Implementation lane: ${roleConfigLabel(input.config.implementation)}.`,
    ...(input.runtimeModelSelection
      ? [`Runtime dispatch: ${modelSelectionLabel(input.runtimeModelSelection)}.`]
      : []),
    ...(input.fallbackReason ? [`Runtime fallback: ${input.fallbackReason}`] : []),
    `Assistant/review lane: ${roleConfigLabel(input.config.assistant)}.`,
    "Optimize for correctness, lower duplicate work, and fast feedback. Keep tool use scoped and avoid unnecessary expensive reasoning once the path is clear.",
    "",
    "User request:",
    input.userMessage,
  ].join("\n");
}
