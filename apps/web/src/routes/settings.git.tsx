import { createFileRoute } from "@tanstack/react-router";

import { GitSettings } from "../components/settings/GitSettings";

export const Route = createFileRoute("/settings/git")({
  component: GitSettings,
});
