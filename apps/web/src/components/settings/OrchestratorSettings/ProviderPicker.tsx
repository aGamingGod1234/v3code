import type { OrchestratorProvider } from "@v3tools/contracts";
import { useId } from "react";

import { Input } from "../../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../../ui/select";

export interface ProviderModelOption {
  readonly slug: string;
  readonly name: string;
}

export const ORCHESTRATOR_PROVIDER_LABELS: Record<OrchestratorProvider, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
  gemini: "Gemini",
  custom: "Custom",
};

const ORCHESTRATOR_PROVIDERS: ReadonlyArray<OrchestratorProvider> = [
  "claude_code",
  "codex",
  "gemini",
  "custom",
];

export function ProviderPicker({
  provider,
  model,
  modelOptions,
  onProviderChange,
  onModelChange,
}: {
  readonly provider: OrchestratorProvider;
  readonly model: string;
  readonly modelOptions: ReadonlyArray<ProviderModelOption>;
  readonly onProviderChange: (provider: OrchestratorProvider) => void;
  readonly onModelChange: (model: string) => void;
}) {
  const listId = useId();

  return (
    <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[11rem_minmax(12rem,1fr)]">
      <Select
        value={provider}
        onValueChange={(value) => onProviderChange(value as OrchestratorProvider)}
      >
        <SelectTrigger aria-label="Provider" className="w-full">
          <SelectValue>{ORCHESTRATOR_PROVIDER_LABELS[provider]}</SelectValue>
        </SelectTrigger>
        <SelectPopup alignItemWithTrigger={false}>
          {ORCHESTRATOR_PROVIDERS.map((option) => (
            <SelectItem key={option} hideIndicator value={option}>
              {ORCHESTRATOR_PROVIDER_LABELS[option]}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>

      <div className="min-w-0">
        <Input
          aria-label="Model"
          list={listId}
          nativeInput
          placeholder="Model"
          value={model}
          onChange={(event) => onModelChange(event.currentTarget.value)}
        />
        <datalist id={listId}>
          {modelOptions.map((option) => (
            <option key={option.slug} value={option.slug}>
              {option.name}
            </option>
          ))}
        </datalist>
      </div>
    </div>
  );
}
