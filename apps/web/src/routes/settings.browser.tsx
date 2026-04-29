import { createFileRoute } from "@tanstack/react-router";

import { BrowserUseSettings } from "../components/settings/BrowserUseSettings";
import { SettingsPageContainer } from "../components/settings/settingsLayout";

export const Route = createFileRoute("/settings/browser")({
  component: () => (
    <SettingsPageContainer>
      <BrowserUseSettings />
    </SettingsPageContainer>
  ),
});
