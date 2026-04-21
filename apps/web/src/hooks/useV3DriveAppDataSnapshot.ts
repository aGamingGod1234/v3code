import { useSyncExternalStore } from "react";

import {
  getV3DriveAppDataSnapshot,
  subscribeV3DriveAppDataSnapshot,
  type V3DriveAppDataSnapshot,
} from "../v3/auth/driveAppData";

export function useV3DriveAppDataSnapshot(): V3DriveAppDataSnapshot | null {
  return useSyncExternalStore(
    subscribeV3DriveAppDataSnapshot,
    getV3DriveAppDataSnapshot,
    getV3DriveAppDataSnapshot,
  );
}
