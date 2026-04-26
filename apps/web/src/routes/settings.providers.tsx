import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { GeneralSettingsPanel } from "../components/settings/SettingsPanels";

function ProvidersSettingsRoute() {
  useEffect(() => {
    const target = document.getElementById("providers-section");
    if (target) {
      target.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }, []);

  return <GeneralSettingsPanel />;
}

export const Route = createFileRoute("/settings/providers")({
  component: ProvidersSettingsRoute,
});
