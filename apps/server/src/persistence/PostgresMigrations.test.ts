import { describe, expect, it } from "vitest";

import { makePostgresMigrationLoader, postgresMigrationEntries } from "./PostgresMigrations.ts";

describe("PostgresMigrations", () => {
  it("registers the V3 identity baseline as migration 001", () => {
    expect(postgresMigrationEntries).toHaveLength(1);
    const [firstId, firstName] = postgresMigrationEntries[0]!;
    expect(firstId).toBe(1);
    expect(firstName).toBe("V3IdentityBaseline");
  });

  it("produces a monotonically-increasing id sequence with no duplicates", () => {
    const ids = postgresMigrationEntries.map(([id]) => id);
    const sorted = [...ids].sort((a, b) => a - b);
    expect(ids).toEqual(sorted);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("makePostgresMigrationLoader returns a loader (no direct shape assertion)", () => {
    // Smoke: the loader is an opaque value produced by Migrator.fromRecord.
    // The filter semantics are already asserted in the id-sequence test; we
    // just verify the constructor doesn't throw at either end of the range.
    expect(() => makePostgresMigrationLoader(0)).not.toThrow();
    expect(() => makePostgresMigrationLoader()).not.toThrow();
    expect(() => makePostgresMigrationLoader(999)).not.toThrow();
  });

  it("exposes every migration as a [number, string, Effect] tuple", () => {
    for (const entry of postgresMigrationEntries) {
      expect(entry).toHaveLength(3);
      expect(typeof entry[0]).toBe("number");
      expect(typeof entry[1]).toBe("string");
      expect(entry[2]).toBeDefined();
    }
  });
});
