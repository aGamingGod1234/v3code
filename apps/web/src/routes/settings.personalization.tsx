import { createFileRoute } from "@tanstack/react-router";

import { PersonalizationSettings } from "../components/settings/PersonalizationSettings";
import { SettingsPageContainer } from "../components/settings/settingsLayout";

export const Route = createFileRoute("/settings/personalization")({
  component: () => (
    <SettingsPageContainer>
      <PersonalizationSettings />
    </SettingsPageContainer>
  ),
});
