import type {
  OrchestratorConfig,
  OrchestratorProvider,
  ProviderKind,
  ServerProvider,
} from "@v3tools/contracts";
import { EMPTY_ORCHESTRATOR_CONFIG } from "@v3tools/contracts";
import { useMemo } from "react";

import { useSettings, useUpdateSettings } from "../../../hooks/useSettings";
import { useServerProviders } from "../../../rpc/serverState";
import { Button } from "../../ui/button";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "../settingsLayout";
import { OrchestratorRoles } from "./OrchestratorRoles";
import { PlanningConfig } from "./PlanningConfig";
import type { ProviderModelOption } from "./ProviderPicker";
import { SubAgentConfig } from "./SubAgentConfig";

const SERVER_PROVIDER_BY_ORCHESTRATOR_PROVIDER: Partial<
  Record<OrchestratorProvider, ProviderKind>
> = {
  claude_code: "claudeAgent",
  codex: "codex",
};

function getModelOptionsByProvider(
  serverProviders: ReadonlyArray<ServerProvider>,
): Record<OrchestratorProvider, ReadonlyArray<ProviderModelOption>> {
  const options: Record<OrchestratorProvider, ProviderModelOption[]> = {
    claude_code: [],
    codex: [],
    gemini: [],
    custom: [],
  };

  for (const orchestratorProvider of Object.keys(options) as OrchestratorProvider[]) {
    const serverProviderKind = SERVER_PROVIDER_BY_ORCHESTRATOR_PROVIDER[orchestratorProvider];
    if (!serverProviderKind) continue;
    const serverProvider = serverProviders.find(
      (candidate) => candidate.provider === serverProviderKind,
    );
    options[orchestratorProvider] =
      serverProvider?.models.map((model) => ({ slug: model.slug, name: model.name })) ?? [];
  }

  return options;
}

export function OrchestratorSettings() {
  const orchestratorConfig = useSettings((settings) => settings.orchestratorConfig);
  const { updateSettings } = useUpdateSettings();
  const serverProviders = useServerProviders();
  const modelOptionsByProvider = useMemo(
    () => getModelOptionsByProvider(serverProviders),
    [serverProviders],
  );

  const updateConfig = (config: OrchestratorConfig) => {
    updateSettings({ orchestratorConfig: config });
  };

  return (
    <SettingsPageContainer>
      <SettingsSection
        title="Orchestrator"
        headerAction={
          <Button
            size="xs"
            variant="outline"
            onClick={() => updateSettings({ orchestratorConfig: EMPTY_ORCHESTRATOR_CONFIG })}
          >
            Reset
          </Button>
        }
      >
        <SettingsRow
          title="Session mode"
          description="Selecting Orchestrator in the chat model picker starts new turns in orchestrated mode with the saved role configuration."
        />
      </SettingsSection>

      <OrchestratorRoles
        config={orchestratorConfig}
        modelOptionsByProvider={modelOptionsByProvider}
        onChange={updateConfig}
      />
      <PlanningConfig config={orchestratorConfig} onChange={updateConfig} />
      <SubAgentConfig
        config={orchestratorConfig}
        modelOptionsByProvider={modelOptionsByProvider}
        onChange={updateConfig}
      />
    </SettingsPageContainer>
  );
}
