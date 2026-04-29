import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";

import { IS_CLOUD_MODE } from "../build-flags";
import { PairingPendingSurface, PairingRouteSurface } from "../components/auth/PairingRouteSurface";

export const Route = createFileRoute("/pair")({
  beforeLoad: async ({ context }) => {
    const { authGateState } = context;
    if (authGateState.status === "authenticated") {
      throw redirect({ to: "/", replace: true });
    }
    // V3 Phase 7 — loopback pairing is a single-device flow; in cloud
    // mode the user must sign in via Google so redirect them home so
    // the `V3SignInButton` / nudge drives the browser flow instead.
    if (IS_CLOUD_MODE) {
      throw redirect({ to: "/login", replace: true });
    }
    return {
      authGateState,
    };
  },
  component: PairRouteView,
  pendingComponent: PairRoutePendingView,
});

function PairRouteView() {
  const { authGateState } = Route.useRouteContext();
  const navigate = useNavigate();

  if (!authGateState) {
    return null;
  }

  return (
    <PairingRouteSurface
      auth={authGateState.auth}
      onAuthenticated={() => {
        void navigate({ to: "/", replace: true });
      }}
      {...(authGateState.errorMessage ? { initialErrorMessage: authGateState.errorMessage } : {})}
    />
  );
}

function PairRoutePendingView() {
  return <PairingPendingSurface />;
}
