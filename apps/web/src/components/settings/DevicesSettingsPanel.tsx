import { CheckIcon, LoaderIcon, ShieldCheckIcon, Trash2Icon } from "lucide-react";

import { useAccountState } from "../../hooks/useAccountState";
import { useApproveDevice, useRemoveDevice } from "../../hooks/useDevices";
import { V3SignInButton } from "../../v3/ui/SignInButton";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { toastManager } from "../ui/toast";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

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

  return (
    <SettingsPageContainer>
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
          const approvePending = approveDevice.isPending && approveDevice.variables === device.id;
          const removePending = removeDevice.isPending && removeDevice.variables === device.id;

          return (
            <SettingsRow
              key={device.id}
              title={
                <span className="inline-flex items-center gap-2">
                  <span>{device.name}</span>
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
                  {!device.approved ? (
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
                </div>
              }
            >
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
