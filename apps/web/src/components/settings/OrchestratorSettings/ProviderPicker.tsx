import type {
  OrchestratorProvider,
  OrchestratorRoleConfig,
} from "@v3tools/contracts/orchestrator-config";
import { useEffect, useState } from "react";

import { Input } from "../../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../../ui/select";

export const ORCHESTRATOR_PROVIDER_OPTIONS: ReadonlyArray<{
  value: OrchestratorProvider;
  label: string;
  models: ReadonlyArray<string>;
  efforts: ReadonlyArray<string>;
  modes: ReadonlyArray<string>;
}> = [
  {
    value: "claude_code",
    label: "Claude Code",
    models: ["claude-opus-4-7", "claude-opus-4-6", "claude-sonnet-4-6", "claude-haiku-4-5"],
    efforts: ["xhigh", "high", "medium", "low"],
    modes: [],
  },
  {
    value: "codex",
    label: "Codex",
    models: ["gpt-5.5", "gpt-5.4", "gpt-5.3-codex", "gpt-5.3-codex-spark"],
    efforts: ["xhigh", "high", "medium", "low"],
    modes: ["fast", "default"],
  },
  {
    value: "gemini",
    label: "Gemini",
    models: ["gemini-3-pro", "gemini-2.5-pro", "gemini-2.5-flash"],
    efforts: ["thinking", "standard"],
    modes: [],
  },
  {
    value: "custom",
    label: "Custom",
    models: ["auto"],
    efforts: ["auto", "standard"],
    modes: [],
  },
];

const optionByProvider = new Map(
  ORCHESTRATOR_PROVIDER_OPTIONS.map((option) => [option.value, option]),
);

export function providerLabel(provider: OrchestratorProvider): string {
  return optionByProvider.get(provider)?.label ?? provider;
}

export function normalizeRoleForProvider(
  provider: OrchestratorProvider,
  previous: OrchestratorRoleConfig,
): OrchestratorRoleConfig {
  const option = optionByProvider.get(provider) ?? ORCHESTRATOR_PROVIDER_OPTIONS[0]!;
  const model = option.models.includes(previous.model)
    ? previous.model
    : (option.models[0] ?? "auto");
  const effort = previous.effort ?? "";
  const mode = previous.mode ?? "";
  return {
    provider,
    model,
    effort: option.efforts.includes(effort) ? effort : (option.efforts[0] ?? "auto"),
    mode:
      option.modes.length > 0
        ? option.modes.includes(mode)
          ? mode
          : (option.modes[0] ?? null)
        : null,
  };
}

export function ProviderPicker(props: {
  idPrefix: string;
  value: OrchestratorRoleConfig;
  onChange: (value: OrchestratorRoleConfig) => void;
}) {
  const option = optionByProvider.get(props.value.provider) ?? ORCHESTRATOR_PROVIDER_OPTIONS[0]!;
  const modelListId = `${props.idPrefix}-models`;
  const [modelDraft, setModelDraft] = useState(props.value.model);

  useEffect(() => {
    setModelDraft(props.value.model);
  }, [props.value.model, props.value.provider]);

  const commitModelDraft = () => {
    const nextModel = modelDraft.trim();
    if (nextModel.length === 0) {
      setModelDraft(props.value.model);
      return;
    }
    if (nextModel !== props.value.model) {
      props.onChange({ ...props.value, model: nextModel });
    }
  };

  return (
    <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(9rem,0.9fr)_minmax(12rem,1.25fr)_minmax(7rem,0.7fr)_minmax(7rem,0.7fr)]">
      <label className="grid min-w-0 gap-1 text-xs">
        <span className="font-medium text-foreground/80">Provider</span>
        <Select
          value={props.value.provider}
          onValueChange={(value) => {
            if (!value) return;
            props.onChange(normalizeRoleForProvider(value as OrchestratorProvider, props.value));
          }}
        >
          <SelectTrigger size="sm" aria-label="Provider">
            <SelectValue>{providerLabel(props.value.provider)}</SelectValue>
          </SelectTrigger>
          <SelectPopup alignItemWithTrigger={false}>
            {ORCHESTRATOR_PROVIDER_OPTIONS.map((providerOption) => (
              <SelectItem key={providerOption.value} value={providerOption.value}>
                {providerOption.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </label>

      <label className="grid min-w-0 gap-1 text-xs">
        <span className="font-medium text-foreground/80">Model</span>
        <Input
          nativeInput
          size="sm"
          list={modelListId}
          value={modelDraft}
          onBlur={commitModelDraft}
          onChange={(event) => setModelDraft(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.currentTarget.blur();
          }}
        />
        <datalist id={modelListId}>
          {option.models.map((model) => (
            <option key={model} value={model} />
          ))}
        </datalist>
      </label>

      <label className="grid min-w-0 gap-1 text-xs">
        <span className="font-medium text-foreground/80">Effort</span>
        <Select
          value={props.value.effort ?? option.efforts[0] ?? "auto"}
          onValueChange={(value) => props.onChange({ ...props.value, effort: value ?? null })}
        >
          <SelectTrigger size="sm" aria-label="Effort">
            <SelectValue>{props.value.effort ?? option.efforts[0] ?? "auto"}</SelectValue>
          </SelectTrigger>
          <SelectPopup alignItemWithTrigger={false}>
            {option.efforts.map((effort) => (
              <SelectItem key={effort} value={effort}>
                {effort}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </label>

      {option.modes.length > 0 ? (
        <label className="grid min-w-0 gap-1 text-xs">
          <span className="font-medium text-foreground/80">Mode</span>
          <Select
            value={props.value.mode ?? option.modes[0] ?? "default"}
            onValueChange={(value) => props.onChange({ ...props.value, mode: value ?? null })}
          >
            <SelectTrigger size="sm" aria-label="Mode">
              <SelectValue>{props.value.mode ?? option.modes[0] ?? "default"}</SelectValue>
            </SelectTrigger>
            <SelectPopup alignItemWithTrigger={false}>
              {option.modes.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {mode}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </label>
      ) : null}
    </div>
  );
}
