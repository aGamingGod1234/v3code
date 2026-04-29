import { createFileRoute } from "@tanstack/react-router";

import { StubPanel } from "../components/settings/StubPanel";

export const Route = createFileRoute("/settings/worktrees")({
  component: () => (
    <StubPanel
      title="Worktrees"
      description="Manage parallel git worktrees so the agent can iterate on multiple branches in isolation."
      bullets={["Create + delete worktrees", "Per-thread worktree binding"]}
    />
  ),
});
