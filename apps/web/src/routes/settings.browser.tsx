import { createFileRoute } from "@tanstack/react-router";

import { StubPanel } from "../components/settings/StubPanel";

export const Route = createFileRoute("/settings/browser")({
  component: () => (
    <StubPanel
      title="Browser use"
      description="Let the agent drive a real browser to test UI changes, scrape, or fetch login-gated content."
      bullets={["Headless / headed toggle", "Per-domain allowlist", "Cookie isolation"]}
    />
  ),
});
