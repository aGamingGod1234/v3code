import {
  ServerSettings,
  type ClaudeModelOptions,
  type CodexModelOptions,
  type CursorModelOptions,
  type OpenCodeModelOptions,
  type OrchestratorProvider,
  type OrchestratorRole,
  type OrchestratorRoleConfig,
  type ServerSettingsPatch,
} from "@v3tools/contracts";
import { Schema } from "effect";
import { deepMerge } from "./Struct.ts";
import { fromLenientJson } from "./schemaJson.ts";

const ServerSettingsJson = fromLenientJson(ServerSettings);

export interface PersistedServerObservabilitySettings {
  readonly otlpTracesUrl: string | undefined;
  readonly otlpMetricsUrl: string | undefined;
}

export function normalizePersistedServerSettingString(
  value: string | null | undefined,
): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

export function extractPersistedServerObservabilitySettings(input: {
  readonly observability?: {
    readonly otlpTracesUrl?: string;
    readonly otlpMetricsUrl?: string;
  };
}): PersistedServerObservabilitySettings {
  return {
    otlpTracesUrl: normalizePersistedServerSettingString(input.observability?.otlpTracesUrl),
    otlpMetricsUrl: normalizePersistedServerSettingString(input.observability?.otlpMetricsUrl),
  };
}

export function parsePersistedServerObservabilitySettings(
  raw: string,
): PersistedServerObservabilitySettings {
  try {
    const decoded = Schema.decodeUnknownSync(ServerSettingsJson)(raw);
    return extractPersistedServerObservabilitySettings(decoded);
  } catch {
    return { otlpTracesUrl: undefined, otlpMetricsUrl: undefined };
  }
}

function shouldReplaceTextGenerationModelSelection(
  patch: ServerSettingsPatch["textGenerationModelSelection"] | undefined,
): boolean {
  return Boolean(patch && (patch.provider !== undefined || patch.model !== undefined));
}

const withModelSelectionOptions = <Options>(options: Options | undefined) =>
  options ? { options } : {};

const ORCHESTRATOR_ROLES: ReadonlyArray<OrchestratorRole> = [
  "orchestrator",
  "implementation",
  "assistant",
];

const DEFAULT_ROLE_CONFIG_BY_PROVIDER: Record<OrchestratorProvider, OrchestratorRoleConfig> = {
  claude_code: {
    provider: "claude_code",
    model: "claude-sonnet-4-6",
    effort: "high",
    mode: null,
  },
  codex: {
    provider: "codex",
    model: "gpt-5.4",
    effort: "high",
    mode: "default",
  },
  gemini: {
    provider: "gemini",
    model: "gemini-2.5-pro",
    effort: "standard",
    mode: null,
  },
  custom: {
    provider: "custom",
    model: "auto",
    effort: "auto",
    mode: null,
  },
};

function normalizeOrchestratorRolePatch(input: {
  readonly current: OrchestratorRoleConfig;
  readonly patch: Partial<OrchestratorRoleConfig> | undefined;
  readonly merged: OrchestratorRoleConfig;
}): OrchestratorRoleConfig {
  if (!input.patch?.provider || input.patch.provider === input.current.provider) {
    return input.merged;
  }
  return {
    ...DEFAULT_ROLE_CONFIG_BY_PROVIDER[input.patch.provider],
    ...input.patch,
  };
}

function normalizeOrchestratorConfigPatch(
  current: ServerSettings,
  patch: ServerSettingsPatch,
  next: ServerSettings,
): ServerSettings {
  const configPatch = patch.orchestratorConfig;
  if (!configPatch) {
    return next;
  }

  const roleUpdates: Partial<Record<OrchestratorRole, OrchestratorRoleConfig>> = {};
  for (const role of ORCHESTRATOR_ROLES) {
    const rolePatch = configPatch[role];
    if (!rolePatch) {
      continue;
    }
    const normalizedRole = normalizeOrchestratorRolePatch({
      current: current.orchestratorConfig[role],
      patch: rolePatch,
      merged: next.orchestratorConfig[role],
    });
    if (normalizedRole !== next.orchestratorConfig[role]) {
      roleUpdates[role] = normalizedRole;
    }
  }

  return Object.keys(roleUpdates).length === 0
    ? next
    : {
        ...next,
        orchestratorConfig: {
          ...next.orchestratorConfig,
          ...roleUpdates,
        },
      };
}

/**
 * Applies a server settings patch while treating textGenerationModelSelection as
 * replace-on-provider/model updates. This prevents stale nested options from
 * surviving a reset patch that intentionally omits options.
 */
export function applyServerSettingsPatch(
  current: ServerSettings,
  patch: ServerSettingsPatch,
): ServerSettings {
  const selectionPatch = patch.textGenerationModelSelection;
  const next = normalizeOrchestratorConfigPatch(current, patch, deepMerge(current, patch));
  if (!selectionPatch || !shouldReplaceTextGenerationModelSelection(selectionPatch)) {
    return next;
  }

  const provider = selectionPatch.provider ?? current.textGenerationModelSelection.provider;
  const model = selectionPatch.model ?? current.textGenerationModelSelection.model;

  return {
    ...next,
    textGenerationModelSelection:
      provider === "codex"
        ? {
            provider,
            model,
            ...withModelSelectionOptions(selectionPatch.options as CodexModelOptions | undefined),
          }
        : provider === "claudeAgent"
          ? {
              provider,
              model,
              ...withModelSelectionOptions(
                selectionPatch.options as ClaudeModelOptions | undefined,
              ),
            }
          : provider === "cursor"
            ? {
                provider,
                model,
                ...withModelSelectionOptions(
                  selectionPatch.options as CursorModelOptions | undefined,
                ),
              }
            : {
                provider,
                model,
                ...withModelSelectionOptions(
                  selectionPatch.options as OpenCodeModelOptions | undefined,
                ),
              },
  };
}
