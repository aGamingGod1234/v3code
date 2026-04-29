import { createFileRoute } from "@tanstack/react-router";

import { ConnectionsSettings } from "../components/settings/ConnectionsSettings";

// Phase 1: the Environments tab renders the existing Connections panel,
// which already hosts "Remote environments" + "Manage local backend".
// A dedicated Environments panel + section extraction is a follow-up.
export const Route = createFileRoute("/settings/environments")({
  component: ConnectionsSettings,
});
