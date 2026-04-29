import type { ModelSelection, ProviderInteractionMode, RuntimeMode } from "@v3tools/contracts";
import type { UnifiedSettings } from "@v3tools/contracts/settings";

export function runtimeModeFromCodexSettings(settings: UnifiedSettings): RuntimeMode {
  switch (settings.codexRuntime.sandboxMode) {
    case "read-only":
      return "approval-required";
    case "workspace-write":
      return "auto-accept-edits";
    case "danger-full-access":
      return "full-access";
  }
}

export function interactionModeFromCodexSettings(
  settings: UnifiedSettings,
): ProviderInteractionMode {
  return settings.codexRuntime.planModeByDefault ? "plan" : "default";
}

export function applyCodexRuntimeModelDefaults(
  selection: ModelSelection,
  settings: UnifiedSettings,
): ModelSelection {
  if (selection.provider !== "codex") {
    return selection;
  }
  if (selection.options?.reasoningEffort) {
    return selection;
  }

  return {
    ...selection,
    options: {
      ...selection.options,
      reasoningEffort: settings.codexRuntime.reasoningEffort,
    },
  };
}
