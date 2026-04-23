import {
  ArrowRightIcon,
  CheckIcon,
  LoaderIcon,
  ServerIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { useAccountState } from "../../hooks/useAccountState";
import { useApproveDevice, useRemoveDevice } from "../../hooks/useDevices";
import { V3SignInButton } from "../../v3/ui/SignInButton";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { toastManager } from "../ui/toast";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

// Shown when a Google account has 2+ devices registered but the
// Drive-published v3_config.json blob still has no shared server URL.
// In that state each device is running its own local V3 server and can't
// see the others' chats — the right next step is to pick one device as
// the server node and run the wizard, which is what this block nudges
// the user toward instead of silently listing the devices.
function ServerNodeSetupPrompt({
  deviceCount,
  onStartSetup,
}: {
  readonly deviceCount: number;
  readonly onStartSetup: () => void;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/50">
          <span className="inline-block h-px w-3 bg-border" aria-hidden />
          Server node
        </h2>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-primary/6 p-5 text-sm">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <ServerIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h3 className="text-[13px] font-semibold tracking-[-0.01em] text-foreground">
                {deviceCount} devices on this Google account — set up a server node
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Each device is running its own local V3 server right now, so chats and sessions
                don't follow you between them. Pick one always-on machine to host a server node and
                the rest will connect to it.
              </p>
            </div>
            <ol className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              <li className="flex gap-2">
                <span className="mt-px inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground/70">
                  1
                </span>
                <span>
                  On the device that stays online, open the setup wizard and work through the
                  pre-flight checks (Docker, free port, cloudflared for a public URL).
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-px inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground/70">
                  2
                </span>
                <span>
                  Pick a data directory, then let the wizard write{" "}
                  <code className="rounded bg-muted/60 px-1 py-0.5 text-[10px]">config.toml</code>{" "}
                  and generate an encryption key.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-px inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground/70">
                  3
                </span>
                <span>
                  The wizard publishes the new server URL to this Google account's Drive App Data so
                  every other device picks it up automatically on next sign-in.
                </span>
              </li>
            </ol>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button size="xs" onClick={onStartSetup} className="gap-1.5">
                Start setup
                <ArrowRightIcon className="size-3.5" />
              </Button>
              <a
                href="https://github.com/openai/codex/tree/main/docs"
                target="_blank"
                rel="noreferrer noopener"
                className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Learn what a server node does
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DeviceStatusBadge({
  isCurrent,
  approved,
  online,
}: {
  readonly approved: boolean;
  readonly isCurrent: boolean;
  readonly online: boolean;
}) {
  if (isCurrent) {
    return (
      <Badge size="sm" variant={approved ? "outline" : "warning"}>
        This device
      </Badge>
    );
  }
  if (!approved) {
    return (
      <Badge size="sm" variant="warning">
        Pending approval
      </Badge>
    );
  }
  return (
    <Badge size="sm" variant={online ? "success" : "outline"}>
      {online ? "Online" : "Offline"}
    </Badge>
  );
}

export function DevicesSettingsPanel() {
  const account = useAccountState();
  const approveDevice = useApproveDevice();
  const removeDevice = useRemoveDevice();
  const navigate = useNavigate();

  if (!account.isSignedIn) {
    return (
      <SettingsPageContainer>
        <SettingsSection title="Devices">
          <div className="p-6">
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Sign in to manage V3 devices</EmptyTitle>
                <EmptyDescription>
                  Device approval and removal are only available once this client is linked to a V3
                  Google account.
                </EmptyDescription>
              </EmptyHeader>
              <V3SignInButton />
            </Empty>
          </div>
        </SettingsSection>
      </SettingsPageContainer>
    );
  }

  const sortedDevices = account.devices.toSorted((left, right) => {
    if (left.id === account.currentDeviceId) {
      return -1;
    }
    if (right.id === account.currentDeviceId) {
      return 1;
    }
    return left.name.localeCompare(right.name);
  });

  // Cross-device sync needs exactly one device to run a server node;
  // if we see multiple devices on the Google account but no published
  // server URL yet, nudge the user toward the wizard instead of letting
  // the devices panel look like a passive status list.
  const driveDeviceCount = account.driveSnapshot?.devices.length ?? 0;
  const shouldPromptServerSetup =
    account.driveSnapshot !== null &&
    account.driveSnapshot.serverUrl === null &&
    driveDeviceCount >= 2;

  return (
    <SettingsPageContainer>
      {shouldPromptServerSetup ? (
        <ServerNodeSetupPrompt
          deviceCount={driveDeviceCount}
          onStartSetup={() => void navigate({ to: "/setup" })}
        />
      ) : null}

      <SettingsSection
        title="Devices"
        headerAction={
          account.isDeviceStatePending ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <LoaderIcon className="size-3 animate-spin" />
              Refreshing
            </span>
          ) : null
        }
      >
        {account.error ? (
          <div className="border-t border-border/60 px-4 py-4 text-sm text-destructive sm:px-5">
            {account.error instanceof Error ? account.error.message : "Failed to load devices."}
          </div>
        ) : null}

        {sortedDevices.length === 0 && !account.isDeviceStatePending ? (
          <div className="border-t border-border/60 px-4 py-4 text-sm text-muted-foreground sm:px-5">
            No V3 devices are registered yet.
          </div>
        ) : null}

        {sortedDevices.map((device) => {
          const isCurrent = device.id === account.currentDeviceId;
          const isCloudShell = device.kind === "cloud";
          const approvePending = approveDevice.isPending && approveDevice.variables === device.id;
          const removePending = removeDevice.isPending && removeDevice.variables === device.id;

          return (
            <SettingsRow
              key={device.id}
              title={
                <span className="inline-flex items-center gap-2">
                  <span>{device.name}</span>
                  {isCloudShell ? (
                    <Badge size="sm" variant="outline">
                      Cloud shell
                    </Badge>
                  ) : null}
                  <DeviceStatusBadge
                    approved={device.approved}
                    isCurrent={isCurrent}
                    online={device.online}
                  />
                </span>
              }
              description={`${device.kind} · ${device.platform}`}
              status={`Capabilities: ${
                device.capabilities.length > 0 ? device.capabilities.join(", ") : "none"
              }`}
              control={
                <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                  {!isCloudShell && !device.approved ? (
                    <Button
                      size="xs"
                      disabled={approvePending || !account.currentDevice?.approved}
                      onClick={() => {
                        approveDevice.mutate(device.id, {
                          onSuccess: (approved) => {
                            toastManager.add({
                              type: approved ? "success" : "warning",
                              title: approved ? "Device approved" : "Device was not approved",
                              description: approved
                                ? `${device.name} can now join the mesh.`
                                : `${device.name} could not be approved.`,
                            });
                          },
                          onError: (error) => {
                            toastManager.add({
                              type: "error",
                              title: "Approve failed",
                              description: error.message,
                            });
                          },
                        });
                      }}
                    >
                      {approvePending ? (
                        <LoaderIcon className="size-3.5 animate-spin" />
                      ) : (
                        <CheckIcon className="size-3.5" />
                      )}
                      Approve
                    </Button>
                  ) : null}

                  {!isCloudShell ? (
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={isCurrent || removePending || !account.currentDevice?.approved}
                      onClick={() => {
                        removeDevice.mutate(device.id, {
                          onSuccess: (removed) => {
                            toastManager.add({
                              type: removed ? "success" : "warning",
                              title: removed ? "Device removed" : "Device was not removed",
                              description: removed
                                ? `${device.name} will no longer reconnect automatically.`
                                : `${device.name} could not be removed.`,
                            });
                          },
                          onError: (error) => {
                            toastManager.add({
                              type: "error",
                              title: "Remove failed",
                              description: error.message,
                            });
                          },
                        });
                      }}
                    >
                      {removePending ? (
                        <LoaderIcon className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2Icon className="size-3.5" />
                      )}
                      Remove
                    </Button>
                  ) : null}
                </div>
              }
            >
              {isCloudShell ? (
                <div className="mt-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  This represents the server-node cloud role and is not directly selectable.
                </div>
              ) : null}
              {!account.currentDevice?.approved && isCurrent ? (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/8 px-3 py-2 text-xs text-muted-foreground">
                  <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0 text-warning-foreground" />
                  <span>
                    This device is waiting for approval from another already-approved V3 device.
                  </span>
                </div>
              ) : null}
            </SettingsRow>
          );
        })}
      </SettingsSection>
    </SettingsPageContainer>
  );
}
