import { createFileRoute } from "@tanstack/react-router";

import { StubPanel } from "../components/settings/StubPanel";

export const Route = createFileRoute("/settings/usage")({
  component: () => (
    <StubPanel
      title="Usage"
      description="Token / cost / runtime telemetry across providers, environments, and projects."
      bullets={["Daily / weekly summaries", "Per-provider breakdowns", "Export to CSV"]}
    />
  ),
});
