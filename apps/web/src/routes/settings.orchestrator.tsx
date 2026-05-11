import { createFileRoute } from "@tanstack/react-router";

import { OrchestratorSettings } from "../components/settings/OrchestratorSettings";
import { SettingsPageContainer } from "../components/settings/settingsLayout";

export const Route = createFileRoute("/settings/orchestrator")({
  component: () => (
    <SettingsPageContainer>
      <OrchestratorSettings />
    </SettingsPageContainer>
  ),
});
