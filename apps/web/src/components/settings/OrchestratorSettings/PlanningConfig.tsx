import type { OrchestratorConfig } from "@v3tools/contracts";

import { Input } from "../../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../../ui/select";
import { Switch } from "../../ui/switch";
import { SettingsRow, SettingsSection } from "../settingsLayout";

const MIN_PLANNING_TURNS = 1;

export function PlanningConfig({
  config,
  onChange,
}: {
  readonly config: OrchestratorConfig;
  readonly onChange: (config: OrchestratorConfig) => void;
}) {
  const planning = config.planning;
  const updatePlanning = (nextPlanning: OrchestratorConfig["planning"]) => {
    onChange({ ...config, planning: nextPlanning });
  };
  const fixedTurns = planning.budget.kind === "fixed" ? planning.budget.turns : MIN_PLANNING_TURNS;

  return (
    <SettingsSection title="Planning">
      <SettingsRow
        title="Codex fast mode"
        description="Use the Codex fast mode field when Codex is selected for an orchestrator role."
        control={
          <Switch
            checked={planning.codexFastMode}
            onCheckedChange={(codexFastMode) => updatePlanning({ ...planning, codexFastMode })}
          />
        }
      />
      <SettingsRow
        title="Planning budget"
        description="Keep planning automatic, or set a fixed number of planning passes before implementation."
      >
        <div className="grid gap-2 pb-4 sm:grid-cols-[12rem_8rem]">
          <Select
            value={planning.budget.kind}
            onValueChange={(kind) =>
              updatePlanning({
                ...planning,
                budget: kind === "fixed" ? { kind: "fixed", turns: fixedTurns } : { kind: "auto" },
              })
            }
          >
            <SelectTrigger aria-label="Planning budget mode">
              <SelectValue>{planning.budget.kind}</SelectValue>
            </SelectTrigger>
            <SelectPopup alignItemWithTrigger={false}>
              <SelectItem hideIndicator value="auto">
                auto
              </SelectItem>
              <SelectItem hideIndicator value="fixed">
                fixed
              </SelectItem>
            </SelectPopup>
          </Select>
          {planning.budget.kind === "fixed" ? (
            <Input
              nativeInput
              aria-label="Planning turns"
              min={MIN_PLANNING_TURNS}
              type="number"
              value={fixedTurns}
              onChange={(event) => {
                const turns = Math.max(
                  MIN_PLANNING_TURNS,
                  Number.parseInt(event.currentTarget.value, 10) || MIN_PLANNING_TURNS,
                );
                updatePlanning({ ...planning, budget: { kind: "fixed", turns } });
              }}
            />
          ) : null}
        </div>
      </SettingsRow>
    </SettingsSection>
  );
}
