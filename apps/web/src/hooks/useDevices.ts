import {
  type DeviceInfo,
  V3ApproveDeviceResult,
  V3DeviceListResult,
  V3RemoveDeviceResult,
} from "@v3tools/contracts";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { Schema } from "effect";

import { resolvePrimaryEnvironmentHttpUrl } from "../environments/primary";
import { useV3SignInSnapshot } from "../v3/auth/signInState";

export const v3DeviceQueryKeys = {
  all: ["v3", "devices"] as const,
  list: () => ["v3", "devices", "list"] as const,
};

export interface DeviceListSnapshot {
  readonly currentDeviceId: DeviceInfo["id"];
  readonly devices: ReadonlyArray<DeviceInfo>;
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function getErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    return body.error;
  }
  return fallback;
}

async function fetchDevices(): Promise<DeviceListSnapshot> {
  const response = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/v3/devices"), {
    credentials: "include",
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(getErrorMessage(body, `Failed to load devices (${response.status}).`));
  }
  return Schema.decodeUnknownSync(V3DeviceListResult)(body);
}

async function postDeviceAction(pathname: string, deviceId: string): Promise<boolean> {
  const response = await fetch(resolvePrimaryEnvironmentHttpUrl(pathname), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ deviceId }),
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(getErrorMessage(body, `Device action failed (${response.status}).`));
  }
  return pathname.endsWith("/approve")
    ? Schema.decodeUnknownSync(V3ApproveDeviceResult)(body).approved
    : Schema.decodeUnknownSync(V3RemoveDeviceResult)(body).removed;
}

function devicesQueryOptions(enabled: boolean) {
  return queryOptions({
    queryKey: v3DeviceQueryKeys.list(),
    queryFn: fetchDevices,
    enabled,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

// Stable shared reference for the "not signed in" / "data still loading"
// case. Returning a fresh `[]` every render makes `devices` fail
// reference equality in downstream `useEffect` deps (see
// meshSubscriptions), which can chain into a render loop once another
// effect sets an atom on each render.
const EMPTY_DEVICES: ReadonlyArray<DeviceInfo> = Object.freeze([]);

export function useDevices() {
  const signInSnapshot = useV3SignInSnapshot();
  const query = useQuery(devicesQueryOptions(signInSnapshot.email !== null));
  const isSignedIn = signInSnapshot.email !== null;
  const devices = isSignedIn ? (query.data?.devices ?? EMPTY_DEVICES) : EMPTY_DEVICES;
  const currentDeviceId = isSignedIn ? (query.data?.currentDeviceId ?? null) : null;

  return {
    ...query,
    currentDeviceId,
    currentDevice: devices.find((device) => device.id === currentDeviceId) ?? null,
    devices,
  };
}

function useInvalidateDevices() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: v3DeviceQueryKeys.all });
}

export function useApproveDevice(): UseMutationResult<boolean, Error, string> {
  const invalidateDevices = useInvalidateDevices();

  return useMutation({
    mutationFn: (deviceId: string) => postDeviceAction("/api/v3/devices/approve", deviceId),
    onSuccess: () => invalidateDevices(),
  });
}

export function useRemoveDevice(): UseMutationResult<boolean, Error, string> {
  const invalidateDevices = useInvalidateDevices();

  return useMutation({
    mutationFn: (deviceId: string) => postDeviceAction("/api/v3/devices/remove", deviceId),
    onSuccess: () => invalidateDevices(),
  });
}
