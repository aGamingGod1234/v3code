import { createFileRoute } from "@tanstack/react-router";

import { StubPanel } from "../components/settings/StubPanel";

export const Route = createFileRoute("/settings/mcp")({
  component: () => (
    <StubPanel
      title="MCP servers"
      description="Manage Model Context Protocol servers — install, enable, configure environment variables."
      bullets={[
        "Install servers from registries",
        "Per-server enable/disable",
        "Per-thread overrides",
      ]}
    />
  ),
});
