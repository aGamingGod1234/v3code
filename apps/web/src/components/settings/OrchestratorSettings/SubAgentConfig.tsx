import type {
  OrchestratorConfig,
  SubAgentDefinition,
} from "@v3tools/contracts/orchestrator-config";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Switch } from "../../ui/switch";
import { Textarea } from "../../ui/textarea";
import { SettingsRow, SettingsSection } from "../settingsLayout";
import { ProviderPicker, providerLabel } from "./ProviderPicker";

function newSubAgent(): SubAgentDefinition {
  const id = `sub-agent-${crypto.randomUUID()}`;
  return {
    id,
    name: "new-sub-agent",
    provider: "codex",
    model: "gpt-5.4",
    effort: "medium",
    mode: "default",
    description: "",
    prompt: "",
    enabled: true,
  };
}

function updateSubAgent(
  subAgents: ReadonlyArray<SubAgentDefinition>,
  id: string,
  patch: Partial<SubAgentDefinition>,
): SubAgentDefinition[] {
  return subAgents.map((subAgent) => (subAgent.id === id ? { ...subAgent, ...patch } : subAgent));
}

export function SubAgentConfig(props: {
  config: OrchestratorConfig;
  onChange: (subAgents: SubAgentDefinition[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const subAgents = props.config.subAgents;

  return (
    <SettingsSection
      title="Sub-agents"
      headerAction={
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            const subAgent = newSubAgent();
            props.onChange([...subAgents, subAgent]);
            setEditingId(subAgent.id);
          }}
        >
          <PlusIcon className="size-3.5" />
          Add sub-agent
        </Button>
      }
    >
      {subAgents.length === 0 ? (
        <SettingsRow
          title="No sub-agents"
          description="Add optional specialist roles such as file indexers, test runners, or reviewers."
        />
      ) : null}

      {subAgents.map((subAgent) => {
        const isEditing = editingId === subAgent.id;
        return (
          <SettingsRow
            key={subAgent.id}
            title={subAgent.name}
            description={`${providerLabel(subAgent.provider)} / ${subAgent.model} / ${subAgent.effort ?? "auto"}`}
            control={
              <div className="flex items-center gap-1.5">
                <Switch
                  checked={subAgent.enabled}
                  onCheckedChange={(checked) =>
                    props.onChange(
                      updateSubAgent(subAgents, subAgent.id, { enabled: Boolean(checked) }),
                    )
                  }
                />
                <Button
                  size="icon-xs"
                  variant={isEditing ? "default" : "ghost"}
                  aria-label={`Edit ${subAgent.name}`}
                  onClick={() => setEditingId(isEditing ? null : subAgent.id)}
                >
                  <PencilIcon className="size-3.5" />
                </Button>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Remove ${subAgent.name}`}
                  onClick={() => {
                    props.onChange(subAgents.filter((entry) => entry.id !== subAgent.id));
                    if (editingId === subAgent.id) {
                      setEditingId(null);
                    }
                  }}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            }
          >
            {isEditing ? (
              <div className="mt-4 grid gap-3 pb-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs">
                    <span className="font-medium text-foreground/80">Name</span>
                    <Input
                      nativeInput
                      size="sm"
                      value={subAgent.name}
                      onChange={(event) => {
                        const nextName = event.currentTarget.value;
                        if (nextName.trim().length === 0) {
                          return;
                        }
                        props.onChange(
                          updateSubAgent(subAgents, subAgent.id, {
                            name: nextName,
                          }),
                        );
                      }}
                    />
                  </label>
                  <label className="grid gap-1 text-xs">
                    <span className="font-medium text-foreground/80">Description</span>
                    <Input
                      nativeInput
                      size="sm"
                      value={subAgent.description}
                      onChange={(event) =>
                        props.onChange(
                          updateSubAgent(subAgents, subAgent.id, {
                            description: event.currentTarget.value,
                          }),
                        )
                      }
                    />
                  </label>
                </div>
                <ProviderPicker
                  idPrefix={`sub-agent-${subAgent.id}`}
                  value={subAgent}
                  onChange={(value) =>
                    props.onChange(updateSubAgent(subAgents, subAgent.id, value))
                  }
                />
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-foreground/80">Prompt</span>
                  <Textarea
                    size="sm"
                    value={subAgent.prompt}
                    onChange={(event) =>
                      props.onChange(
                        updateSubAgent(subAgents, subAgent.id, {
                          prompt: event.currentTarget.value,
                        }),
                      )
                    }
                  />
                </label>
              </div>
            ) : null}
          </SettingsRow>
        );
      })}
    </SettingsSection>
  );
}
