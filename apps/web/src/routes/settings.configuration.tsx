import { createFileRoute } from "@tanstack/react-router";

import { ConfigurationSettings } from "../components/settings/ConfigurationSettings";
import { SettingsPageContainer } from "../components/settings/settingsLayout";

export const Route = createFileRoute("/settings/configuration")({
  component: () => (
    <SettingsPageContainer>
      <ConfigurationSettings />
    </SettingsPageContainer>
  ),
});
