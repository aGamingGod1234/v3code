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
        <AlertTitle>Finish online node setup</AlertTitle>
        <AlertDescription>
          <span>
            {deviceCount} devices are linked to this Google account, but no shared V3 server URL is
            published yet.
          </span>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Pick the machine that stays online and run the server-node setup wizard.</li>
            <li>Sign in with Google so the node can publish its URL for this account.</li>
            <li>
              Open v3.agaminggod.com/app and sign in there to view and control chats through the
              published server node.
            </li>
            <li>Sign in on each device; the Devices page will show which clients are online.</li>
          </ol>
        </AlertDescription>
        <AlertAction className="gap-2">
          <Button className="min-w-32" size="xs" onClick={() => void navigate({ to: "/setup" })}>
            Configure server
          </Button>
          <Button className="min-w-32" size="xs" variant="outline" onClick={() => dismissForNow()}>
            Remind me later
          </Button>
          <Button
            className="min-w-32"
            size="xs"
            variant="ghost"
            onClick={() => dismissPermanently()}
          >
            Keep single-device
          </Button>
        </AlertAction>
      </Alert>
    </div>
  );
}
