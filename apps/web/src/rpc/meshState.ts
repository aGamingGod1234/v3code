import { useAtomValue } from "@effect/atom-react";
import { type DeviceInfo } from "@v3tools/contracts";
import { Atom } from "effect/unstable/reactivity";

import { appAtomRegistry } from "./atomRegistry";

export interface MeshDeviceSnapshot {
  readonly currentDeviceId: DeviceInfo["id"] | null;
  readonly devices: ReadonlyArray<DeviceInfo>;
  readonly isPending: boolean;
  readonly errorMessage: string | null;
}

const EMPTY_DEVICES: ReadonlyArray<DeviceInfo> = [];
const EMPTY_MESH_DEVICE_SNAPSHOT: MeshDeviceSnapshot = {
  currentDeviceId: null,
  devices: EMPTY_DEVICES,
  isPending: false,
  errorMessage: null,
};

const meshDeviceSnapshotAtom = Atom.make(EMPTY_MESH_DEVICE_SNAPSHOT).pipe(
  Atom.keepAlive,
  Atom.withLabel("mesh-device-snapshot"),
);

export function getMeshDeviceSnapshot(): MeshDeviceSnapshot {
  return appAtomRegistry.get(meshDeviceSnapshotAtom);
}

export function setMeshDeviceSnapshot(snapshot: MeshDeviceSnapshot): void {
  appAtomRegistry.set(meshDeviceSnapshotAtom, snapshot);
}

export function resetMeshStateForTests(): void {
  appAtomRegistry.set(meshDeviceSnapshotAtom, EMPTY_MESH_DEVICE_SNAPSHOT);
}

export function useMeshDeviceSnapshot(): MeshDeviceSnapshot {
  return useAtomValue(meshDeviceSnapshotAtom);
}

export function useMeshCurrentDeviceId(): DeviceInfo["id"] | null {
  return useAtomValue(meshDeviceSnapshotAtom, (snapshot) => snapshot.currentDeviceId);
}
