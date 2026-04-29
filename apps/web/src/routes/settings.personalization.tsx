import { createFileRoute } from "@tanstack/react-router";

import { PersonalizationSettings } from "../components/settings/PersonalizationSettings";

export const Route = createFileRoute("/settings/personalization")({
  component: PersonalizationSettings,
});
