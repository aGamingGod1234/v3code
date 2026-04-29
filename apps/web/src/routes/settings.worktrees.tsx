import { createFileRoute } from "@tanstack/react-router";

import { SettingsPageContainer } from "../components/settings/settingsLayout";
import { WorktreesSettings } from "../components/settings/WorktreesSettings";

export const Route = createFileRoute("/settings/worktrees")({
  component: () => (
    <SettingsPageContainer>
      <WorktreesSettings />
    </SettingsPageContainer>
  ),
});
