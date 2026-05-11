import type {
  OrchestratorConfig,
  OrchestratorProvider,
  OrchestratorRoleConfig,
} from "@v3tools/contracts";

import { SettingsRow, SettingsSection } from "../settingsLayout";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../../ui/select";
import { ProviderPicker, type ProviderModelOption } from "./ProviderPicker";

const ROLE_LABELS: Record<keyof OrchestratorConfig["roles"], string> = {
  orchestrator: "Orchestrator",
  implementation: "Implementation",
  assistant: "Assistant",
};

const ROLE_DESCRIPTIONS: Record<keyof OrchestratorConfig["roles"], string> = {
  orchestrator: "Plans, delegates, monitors progress, and performs the final review pass.",
  implementation: "Owns code changes and verification work for the active task.",
  assistant: "Handles focused support work and sub-agent coordination.",
};

export const EFFORT_OPTIONS_BY_PROVIDER: Record<OrchestratorProvider, ReadonlyArray<string>> = {
  claude_code: ["default", "think", "ultrathink"],
  codex: ["low", "medium", "high", "xhigh"],
  gemini: ["default"],
  custom: ["default"],
};

export const MODE_OPTIONS_BY_PROVIDER: Partial<
  Record<OrchestratorProvider, ReadonlyArray<string>>
> = {
  codex: ["default", "fast"],
};

export function normalizeRoleForProvider(
  role: OrchestratorRoleConfig,
  provider: OrchestratorProvider,
): OrchestratorRoleConfig {
  const efforts = EFFORT_OPTIONS_BY_PROVIDER[provider];
  const modes = MODE_OPTIONS_BY_PROVIDER[provider] ?? [];
  return {
    ...role,
    provider,
    effort: efforts.includes(role.effort) ? role.effort : (efforts[0] ?? ""),
    mode: modes.length === 0 ? "" : modes.includes(role.mode) ? role.mode : (modes[0] ?? ""),
  };
}

export function OrchestratorRoles({
  config,
  modelOptionsByProvider,
  onChange,
}: {
  readonly config: OrchestratorConfig;
  readonly modelOptionsByProvider: Record<OrchestratorProvider, ReadonlyArray<ProviderModelOption>>;
  readonly onChange: (config: OrchestratorConfig) => void;
}) {
  const updateRole = (
    roleName: keyof OrchestratorConfig["roles"],
    nextRole: OrchestratorRoleConfig,
  ) => {
    onChange({
      ...config,
      roles: {
        ...config.roles,
        [roleName]: nextRole,
      },
    });
  };

  return (
    <SettingsSection title="Roles">
      {(Object.keys(config.roles) as Array<keyof OrchestratorConfig["roles"]>).map((roleName) => {
        const role = config.roles[roleName];
        const effortOptions = EFFORT_OPTIONS_BY_PROVIDER[role.provider];
        const modeOptions = MODE_OPTIONS_BY_PROVIDER[role.provider] ?? [];

        return (
          <SettingsRow
            key={roleName}
            title={ROLE_LABELS[roleName]}
            description={ROLE_DESCRIPTIONS[roleName]}
          >
            <div className="grid gap-3 pb-4 sm:grid-cols-[minmax(0,1fr)_9rem_8rem]">
              <ProviderPicker
                provider={role.provider}
                model={role.model}
                modelOptions={modelOptionsByProvider[role.provider]}
                onProviderChange={(provider) =>
                  updateRole(roleName, normalizeRoleForProvider(role, provider))
                }
                onModelChange={(model) => updateRole(roleName, { ...role, model })}
              />

              <Select
                value={role.effort}
                onValueChange={(effort) => {
                  if (effort) updateRole(roleName, { ...role, effort });
                }}
              >
                <SelectTrigger aria-label={`${ROLE_LABELS[roleName]} effort`}>
                  <SelectValue>{role.effort || "Effort"}</SelectValue>
                </SelectTrigger>
                <SelectPopup alignItemWithTrigger={false}>
                  {effortOptions.map((effort) => (
                    <SelectItem key={effort} hideIndicator value={effort}>
                      {effort}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>

              {modeOptions.length > 0 ? (
                <Select
                  value={role.mode}
                  onValueChange={(mode) => {
                    if (mode) updateRole(roleName, { ...role, mode });
                  }}
                >
                  <SelectTrigger aria-label={`${ROLE_LABELS[roleName]} mode`}>
                    <SelectValue>{role.mode || "Mode"}</SelectValue>
                  </SelectTrigger>
                  <SelectPopup alignItemWithTrigger={false}>
                    {modeOptions.map((mode) => (
                      <SelectItem key={mode} hideIndicator value={mode}>
                        {mode}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              ) : null}
            </div>
          </SettingsRow>
        );
      })}
    </SettingsSection>
  );
}
