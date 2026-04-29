import { createFileRoute, redirect } from "@tanstack/react-router";

import { IS_CLOUD_MODE } from "../build-flags";
import { V3AdminPage } from "./admin";

export const Route = createFileRoute("/control")({
  beforeLoad: ({ context }) => {
    if (IS_CLOUD_MODE && context.authGateState.status !== "authenticated") {
      throw redirect({ to: "/login", replace: true });
    }
  },
  component: V3AdminPage,
});
