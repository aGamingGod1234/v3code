import { describe, expect, it } from "vitest";

import {
  applyMeshGapDetection,
  createMeshGapCursor,
  updateMeshGapCursorFromSnapshot,
} from "./gapDetection";

describe("gapDetection", () => {
  it("advances the cursor for the next contiguous event", () => {
    const decision = applyMeshGapDetection(createMeshGapCursor(4), 5);

    expect(decision).toEqual({
      type: "apply",
      state: {
        lastStreamVersion: 5,
      },
    });
  });

  it("ignores duplicate or stale events", () => {
    const decision = applyMeshGapDetection(createMeshGapCursor(8), 8);

    expect(decision).toEqual({
      type: "ignore",
      state: {
        lastStreamVersion: 8,
      },
    });
  });

  it("flags a gap and requests a resubscribe from the last applied cursor", () => {
    const decision = applyMeshGapDetection(createMeshGapCursor(2), 5);

    expect(decision).toEqual({
      type: "resubscribe",
      fromStreamVersionExclusive: 2,
      expectedStreamVersion: 3,
      actualStreamVersion: 5,
      state: {
        lastStreamVersion: 2,
      },
    });
  });

  it("uses the latest snapshot cursor as the new replay baseline", () => {
    expect(updateMeshGapCursorFromSnapshot(createMeshGapCursor(3), 9)).toEqual({
      lastStreamVersion: 9,
    });
  });
});
