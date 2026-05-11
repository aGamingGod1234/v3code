import type {
  OrchestratorConfig,
  OrchestratorProvider,
  SubAgentDefinition,
} from "@v3tools/contracts";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../../ui/select";
import { Switch } from "../../ui/switch";
import { SettingsRow, SettingsSection } from "../settingsLayout";
import {
  EFFORT_OPTIONS_BY_PROVIDER,
  MODE_OPTIONS_BY_PROVIDER,
  normalizeRoleForProvider,
} from "./OrchestratorRoles";
import { ProviderPicker, type ProviderModelOption } from "./ProviderPicker";

const createSubAgent = (): SubAgentDefinition => ({
  id: crypto.randomUUID(),
  name: "Assistant",
  role: "support",
  provider: "custom",
  model: "",
  effort: "default",
  mode: "",
  enabled: true,
});

function normalizeSubAgentForProvider(
  agent: SubAgentDefinition,
  provider: OrchestratorProvider,
): SubAgentDefinition {
  return {
    ...agent,
    ...normalizeRoleForProvider(agent, provider),
  };
}

function withOptionalDescription(
  agent: SubAgentDefinition,
  description: string,
): SubAgentDefinition {
  const trimmed = description.trim();
  if (!trimmed) {
    const { description: _description, ...withoutDescription } = agent;
    return withoutDescription;
  }
  return { ...agent, description };
}

export function SubAgentConfig({
  config,
  modelOptionsByProvider,
  onChange,
}: {
  readonly config: OrchestratorConfig;
  readonly modelOptionsByProvider: Record<OrchestratorProvider, ReadonlyArray<ProviderModelOption>>;
  readonly onChange: (config: OrchestratorConfig) => void;
}) {
  const updateSubAgents = (subAgents: ReadonlyArray<SubAgentDefinition>) => {
    onChange({ ...config, subAgents: [...subAgents] });
  };

  const updateAgent = (agentId: string, nextAgent: SubAgentDefinition) => {
    updateSubAgents(config.subAgents.map((agent) => (agent.id === agentId ? nextAgent : agent)));
  };

  return (
    <SettingsSection
      title="Sub-agents"
      headerAction={
        <Button
          size="xs"
          variant="outline"
          onClick={() => updateSubAgents([...config.subAgents, createSubAgent()])}
        >
          <PlusIcon className="size-3.5" />
          Add
        </Button>
      }
    >
      {config.subAgents.length === 0 ? (
        <SettingsRow
          title="No sub-agents"
          description="Add optional helper agents for research, review, tests, or other support lanes."
        />
      ) : (
        config.subAgents.map((agent) => {
          const effortOptions = EFFORT_OPTIONS_BY_PROVIDER[agent.provider];
          const modeOptions = MODE_OPTIONS_BY_PROVIDER[agent.provider] ?? [];

          return (
            <SettingsRow
              key={agent.id}
              title={agent.name || "Sub-agent"}
              description={agent.role || "Support lane"}
              control={
                <div className="flex items-center gap-2">
                  <Switch
                    aria-label={`${agent.name || "Sub-agent"} enabled`}
                    checked={agent.enabled}
                    onCheckedChange={(enabled) => updateAgent(agent.id, { ...agent, enabled })}
                  />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove ${agent.name || "sub-agent"}`}
                    onClick={() =>
                      updateSubAgents(
                        config.subAgents.filter((candidate) => candidate.id !== agent.id),
                      )
                    }
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>
              }
            >
              <div className="grid gap-3 pb-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    nativeInput
                    aria-label="Sub-agent name"
                    placeholder="Name"
                    value={agent.name}
                    onChange={(event) =>
                      updateAgent(agent.id, { ...agent, name: event.currentTarget.value })
                    }
                  />
                  <Input
                    nativeInput
                    aria-label="Sub-agent role"
                    placeholder="Role"
                    value={agent.role}
                    onChange={(event) =>
                      updateAgent(agent.id, { ...agent, role: event.currentTarget.value })
                    }
                  />
                </div>
                <ProviderPicker
                  provider={agent.provider}
                  model={agent.model}
                  modelOptions={modelOptionsByProvider[agent.provider]}
                  onProviderChange={(provider) =>
                    updateAgent(agent.id, normalizeSubAgentForProvider(agent, provider))
                  }
                  onModelChange={(model) => updateAgent(agent.id, { ...agent, model })}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select
                    value={agent.effort}
                    onValueChange={(effort) => {
                      if (effort) updateAgent(agent.id, { ...agent, effort });
                    }}
                  >
                    <SelectTrigger aria-label="Sub-agent effort">
                      <SelectValue>{agent.effort || "Effort"}</SelectValue>
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
                      value={agent.mode}
                      onValueChange={(mode) => {
                        if (mode) updateAgent(agent.id, { ...agent, mode });
                      }}
                    >
                      <SelectTrigger aria-label="Sub-agent mode">
                        <SelectValue>{agent.mode || "Mode"}</SelectValue>
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
                <Input
                  nativeInput
                  aria-label="Sub-agent description"
                  placeholder="Description"
                  value={agent.description ?? ""}
                  onChange={(event) =>
                    updateAgent(agent.id, withOptionalDescription(agent, event.currentTarget.value))
                  }
                />
              </div>
            </SettingsRow>
          );
        })
      )}
    </SettingsSection>
  );
}
