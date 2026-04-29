import { createFileRoute } from "@tanstack/react-router";

import { McpServersSettings } from "../components/settings/McpServersSettings";
import { SettingsPageContainer } from "../components/settings/settingsLayout";

export const Route = createFileRoute("/settings/mcp")({
  component: () => (
    <SettingsPageContainer>
      <McpServersSettings />
    </SettingsPageContainer>
  ),
});
