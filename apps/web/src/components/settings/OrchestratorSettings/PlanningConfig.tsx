import type {
  OrchestratorConfig,
  OrchestratorPlanningBudget,
} from "@v3tools/contracts/orchestrator-config";

import { Input } from "../../ui/input";
import { Switch } from "../../ui/switch";
import { SettingsRow, SettingsSection } from "../settingsLayout";

function parsePlanningBudget(value: string): OrchestratorPlanningBudget {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.toLowerCase() === "auto") {
    return "auto";
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : "auto";
}

export function PlanningConfig(props: {
  config: OrchestratorConfig;
  onChange: (patch: Partial<OrchestratorConfig>) => void;
}) {
  const budgetValue =
    props.config.planningBudget === "auto" ? "auto" : String(props.config.planningBudget);

  return (
    <SettingsSection title="Planning">
      <SettingsRow
        title="Fast mode"
        description="Routes directly to implementation and skips the explicit planning lane message."
        control={
          <Switch
            checked={props.config.fastMode}
            onCheckedChange={(checked) => props.onChange({ fastMode: Boolean(checked) })}
          />
        }
      />
      <SettingsRow
        title="Planning budget"
        description="Use auto for adaptive planning, or enter a provider-specific thinking budget."
        control={
          <div className="w-full sm:w-36">
            <Input
              nativeInput
              size="sm"
              list="orchestrator-planning-budget-options"
              value={budgetValue}
              onChange={(event) =>
                props.onChange({ planningBudget: parsePlanningBudget(event.currentTarget.value) })
              }
            />
            <datalist id="orchestrator-planning-budget-options">
              <option value="auto" />
              <option value="4000" />
              <option value="8000" />
              <option value="16000" />
            </datalist>
          </div>
        }
      />
    </SettingsSection>
  );
}
