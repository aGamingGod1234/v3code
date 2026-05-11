import { createFileRoute } from "@tanstack/react-router";

import { OrchestratorSettings } from "../components/settings/OrchestratorSettings";

export const Route = createFileRoute("/settings/orchestrator")({
  component: OrchestratorSettings,
});
