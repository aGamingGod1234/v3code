import { createFileRoute } from "@tanstack/react-router";

import { ConfigurationSettings } from "../components/settings/ConfigurationSettings";

export const Route = createFileRoute("/settings/configuration")({
  component: ConfigurationSettings,
});
