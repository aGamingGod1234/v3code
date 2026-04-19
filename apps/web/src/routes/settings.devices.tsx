import { createFileRoute } from "@tanstack/react-router";

import { DevicesSettingsPanel } from "../components/settings/DevicesSettingsPanel";

export const Route = createFileRoute("/settings/devices")({
  component: DevicesSettingsPanel,
});
