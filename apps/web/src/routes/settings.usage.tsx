import { createFileRoute } from "@tanstack/react-router";

import { SettingsPageContainer } from "../components/settings/settingsLayout";
import { UsageSettings } from "../components/settings/UsageSettings";

export const Route = createFileRoute("/settings/usage")({
  component: () => (
    <SettingsPageContainer>
      <UsageSettings />
    </SettingsPageContainer>
  ),
});
