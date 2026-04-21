import { HardDriveDownloadIcon, LogOutIcon, ServerIcon } from "lucide-react";

import { useAccountState } from "../../hooks/useAccountState";
import { endV3GoogleSignInLocally } from "../../v3/auth/googleSignIn";
import { V3ConnectGitHubButton } from "../../v3/ui/ConnectGitHubButton";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

interface SignedInBarProps {
  readonly account: ReturnType<typeof useAccountState>;
}

export function SignedInBar({ account }: SignedInBarProps) {
  if (!account.isSignedIn || account.email === null) {
    return null;
  }

  const initial = (account.displayName ?? account.email).slice(0, 1).toUpperCase();
  const serverReady = account.driveSnapshot?.serverUrl !== null && account.driveSnapshot?.serverUrl;

  return (
    <div className="rounded-2xl border border-border/70 bg-card/70 p-3 shadow-sm/4">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground">{account.displayName}</div>
          <div className="truncate text-xs text-muted-foreground">{account.email}</div>
        </div>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label="Sign out of V3"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => endV3GoogleSignInLocally()}
        >
          <LogOutIcon className="size-3.5" />
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge size="sm" variant="outline">
          <ServerIcon className="size-3" />
          {account.serverMode}
        </Badge>
        <Badge size="sm" variant={serverReady ? "success" : "warning"}>
          <HardDriveDownloadIcon className="size-3" />
          {serverReady ? "Server linked" : "Setup pending"}
        </Badge>
        {account.currentDevice ? (
          <Badge size="sm" variant={account.pendingApproval ? "warning" : "outline"}>
            {account.currentDevice.name}
          </Badge>
        ) : null}
      </div>

      <div className="mt-3">
        <V3ConnectGitHubButton className="w-full justify-center" />
      </div>
    </div>
  );
}
