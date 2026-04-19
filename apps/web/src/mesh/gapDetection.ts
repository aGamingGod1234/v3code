export interface MeshGapCursor {
  readonly lastStreamVersion: number;
}

export type MeshGapDecision =
  | {
      readonly type: "apply";
      readonly state: MeshGapCursor;
    }
  | {
      readonly type: "ignore";
      readonly state: MeshGapCursor;
    }
  | {
      readonly type: "resubscribe";
      readonly fromStreamVersionExclusive: number;
      readonly expectedStreamVersion: number;
      readonly actualStreamVersion: number;
      readonly state: MeshGapCursor;
    };

export function createMeshGapCursor(lastStreamVersion = 0): MeshGapCursor {
  return {
    lastStreamVersion: Math.max(0, Math.floor(lastStreamVersion)),
  };
}

export function updateMeshGapCursorFromSnapshot(
  cursor: MeshGapCursor,
  latestStreamVersion: number,
): MeshGapCursor {
  return createMeshGapCursor(Math.max(cursor.lastStreamVersion, latestStreamVersion));
}

export function applyMeshGapDetection(
  cursor: MeshGapCursor,
  nextStreamVersion: number,
): MeshGapDecision {
  const normalizedStreamVersion = Math.max(0, Math.floor(nextStreamVersion));
  if (normalizedStreamVersion <= cursor.lastStreamVersion) {
    return {
      type: "ignore",
      state: cursor,
    };
  }

  const expectedStreamVersion = cursor.lastStreamVersion + 1;
  if (normalizedStreamVersion !== expectedStreamVersion) {
    return {
      type: "resubscribe",
      fromStreamVersionExclusive: cursor.lastStreamVersion,
      expectedStreamVersion,
      actualStreamVersion: normalizedStreamVersion,
      state: cursor,
    };
  }

  return {
    type: "apply",
    state: createMeshGapCursor(normalizedStreamVersion),
  };
}
