import { createFileRoute } from "@tanstack/react-router";

import { ConnectionsSettings } from "../components/settings/ConnectionsSettings";

export const Route = createFileRoute("/settings/environments")({
  component: () => <ConnectionsSettings showChatImport={false} />,
});
