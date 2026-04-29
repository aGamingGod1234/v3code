import { createFileRoute } from "@tanstack/react-router";

import { GitSettings } from "../components/settings/GitSettings";
import { SettingsPageContainer } from "../components/settings/settingsLayout";

export const Route = createFileRoute("/settings/git")({
  component: () => (
    <SettingsPageContainer>
      <GitSettings />
    </SettingsPageContainer>
  ),
});
