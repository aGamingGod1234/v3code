import type {
  OrchestratorConfig,
  OrchestratorRole,
  OrchestratorRoleConfig,
} from "@v3tools/contracts/orchestrator-config";

import { SettingsRow, SettingsSection } from "../settingsLayout";
import { ProviderPicker } from "./ProviderPicker";

const ROLE_LABELS: Record<OrchestratorRole, string> = {
  orchestrator: "Orchestrator",
  implementation: "Implementation",
  assistant: "Assistant",
};

const ROLE_DESCRIPTIONS: Record<OrchestratorRole, string> = {
  orchestrator: "Plans, routes, and keeps the session focused.",
  implementation: "Runs the primary coding turn through the existing provider session.",
  assistant: "Provides review, explanation, and lower-cost support alongside implementation.",
};

const ROLES: ReadonlyArray<OrchestratorRole> = ["orchestrator", "implementation", "assistant"];

export function OrchestratorRoles(props: {
  config: OrchestratorConfig;
  onRoleChange: (role: OrchestratorRole, value: OrchestratorRoleConfig) => void;
}) {
  return (
    <SettingsSection title="Roles">
      {ROLES.map((role) => (
        <SettingsRow key={role} title={ROLE_LABELS[role]} description={ROLE_DESCRIPTIONS[role]}>
          <div className="mt-4 pb-4">
            <ProviderPicker
              idPrefix={`orchestrator-${role}`}
              value={props.config[role]}
              onChange={(value) => props.onRoleChange(role, value)}
            />
          </div>
        </SettingsRow>
      ))}
    </SettingsSection>
  );
}
