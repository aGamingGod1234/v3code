import { ServerIcon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { useShouldShowConfigureBanner } from "../../hooks/useShouldShowConfigureBanner";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";

export function ConfigureServerBanner() {
  const navigate = useNavigate();
  const { dismissForNow, dismissPermanently, driveSnapshot, visible } =
    useShouldShowConfigureBanner();

  if (!visible || driveSnapshot === null) {
    return null;
  }

  const deviceCount = driveSnapshot.devices.length;

  return (
    <div className="border-b border-border/70 bg-background/95 px-3 py-2 sm:px-4">
      <Alert className="border-primary/20 bg-primary/6">
        <ServerIcon />
        <AlertTitle>Connect your devices with a server node</AlertTitle>
        <AlertDescription>
          {deviceCount} devices are linked to this Google account, but Drive App Data does not yet
          advertise a shared V3 server URL. Finish setup on one device to turn on cross-device sync.
        </AlertDescription>
        <AlertAction className="flex flex-wrap gap-2">
          <Button size="xs" onClick={() => void navigate({ to: "/setup" })}>
            Configure server
          </Button>
          <Button size="xs" variant="outline" onClick={() => dismissForNow()}>
            Remind me later
          </Button>
          <Button size="xs" variant="ghost" onClick={() => dismissPermanently()}>
            Keep single-device
          </Button>
        </AlertAction>
      </Alert>
    </div>
  );
}
