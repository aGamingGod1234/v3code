import { createFileRoute } from "@tanstack/react-router";

import { MultiChatWorkspace } from "../components/multiChat/MultiChatWorkspace";

function ChatIndexRouteView() {
  return <MultiChatWorkspace routeThreadRef={null} />;
}

export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});
