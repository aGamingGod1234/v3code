import type {
  OrchestratorConfig,
  OrchestratorRole,
  OrchestratorRoleConfig,
} from "@v3tools/contracts/orchestrator-config";
import { BoxesIcon, ListChecksIcon, RouteIcon } from "lucide-react";
import { useState } from "react";

import { useSettings, useUpdateSettings } from "../../../hooks/useSettings";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import { OrchestratorRoles } from "./OrchestratorRoles";
import { PlanningConfig } from "./PlanningConfig";
import { SubAgentConfig } from "./SubAgentConfig";

type OrchestratorSettingsTab = "roles" | "sub-agents" | "planning";

const TABS: ReadonlyArray<{
  id: OrchestratorSettingsTab;
  label: string;
  icon: typeof RouteIcon;
}> = [
  { id: "roles", label: "Roles", icon: RouteIcon },
  { id: "sub-agents", label: "Sub-agents", icon: BoxesIcon },
  { id: "planning", label: "Planning", icon: ListChecksIcon },
];

export function OrchestratorSettings() {
  const config = useSettings((settings) => settings.orchestratorConfig);
  const { updateSettings } = useUpdateSettings();
  const [activeTab, setActiveTab] = useState<OrchestratorSettingsTab>("roles");

  const updateConfig = (recipe: (current: OrchestratorConfig) => OrchestratorConfig) => {
    updateSettings({ orchestratorConfig: recipe(config) });
  };

  const updateRole = (role: OrchestratorRole, value: OrchestratorRoleConfig) => {
    updateConfig((current) => ({
      ...current,
      [role]: value,
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1 rounded-lg border border-border/70 bg-card p-1">
        {TABS.map((tab) => {
          const TabIcon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <Button
              key={tab.id}
              type="button"
              size="sm"
              variant={active ? "default" : "ghost"}
              className={cn("min-w-0 justify-center", active ? "" : "text-muted-foreground")}
              onClick={() => setActiveTab(tab.id)}
            >
              <TabIcon className="size-4" />
              {tab.label}
            </Button>
          );
        })}
      </div>

      {activeTab === "roles" ? (
        <OrchestratorRoles config={config} onRoleChange={updateRole} />
      ) : null}

      {activeTab === "sub-agents" ? (
        <SubAgentConfig
          config={config}
          onChange={(subAgents) => updateConfig((current) => ({ ...current, subAgents }))}
        />
      ) : null}

      {activeTab === "planning" ? (
        <PlanningConfig
          config={config}
          onChange={(patch) => updateConfig((current) => ({ ...current, ...patch }))}
        />
      ) : null}
    </div>
  );
}
