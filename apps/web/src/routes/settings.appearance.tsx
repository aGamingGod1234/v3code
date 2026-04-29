import { createFileRoute } from "@tanstack/react-router";

import { AppearanceSettings } from "../components/settings/AppearanceSettings";
import { SettingsPageContainer } from "../components/settings/settingsLayout";

export const Route = createFileRoute("/settings/appearance")({
  component: () => (
    <SettingsPageContainer>
      <AppearanceSettings />
    </SettingsPageContainer>
  ),
});
