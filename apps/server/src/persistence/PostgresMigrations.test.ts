import { describe, expect, it } from "vitest";

import { makePostgresMigrationLoader, postgresMigrationEntries } from "./PostgresMigrations.ts";

// Name of every SQLite upstream migration, in id order. The Postgres
// ports are `SQLite_N + 1` because `V3IdentityBaseline` claims id 1.
const UPSTREAM_PORT_NAMES = [
  "OrchestrationEvents",
  "OrchestrationCommandReceipts",
  "CheckpointDiffBlobs",
  "ProviderSessionRuntime",
  "Projections",
  "ProjectionThreadSessionRuntimeModeColumns",
  "ProjectionThreadMessageAttachments",
  "ProjectionThreadActivitySequence",
  "ProviderSessionRuntimeMode",
  "ProjectionThreadsRuntimeMode",
  "OrchestrationThreadCreatedRuntimeMode",
  "ProjectionThreadsInteractionMode",
  "ProjectionThreadProposedPlans",
  "ProjectionThreadProposedPlanImplementation",
  "ProjectionTurnsSourceProposedPlan",
  "CanonicalizeModelSelections",
  "ProjectionThreadsArchivedAt",
  "ProjectionThreadsArchivedAtIndex",
  "ProjectionSnapshotLookupIndexes",
  "AuthAccessManagement",
  "AuthSessionClientMetadata",
  "AuthSessionLastConnectedAt",
  "ProjectionThreadShellSummary",
  "BackfillProjectionThreadShellSummary",
  "CleanupInvalidProjectionPendingApprovals",
  "ProjectionThreadsMeshSync",
  "ProjectionThreadMessageSourceDevice",
  "ProjectionThreadsForkLineage",
  "V3UserGitHubScopes",
] as const;

describe("PostgresMigrations", () => {
  it("registers the V3 identity baseline as migration 001", () => {
    const [firstId, firstName] = postgresMigrationEntries[0]!;
    expect(firstId).toBe(1);
    expect(firstName).toBe("V3IdentityBaseline");
  });

  it("registers the upstream-port migrations as ids 2+ after the V3 baseline", () => {
    expect(postgresMigrationEntries).toHaveLength(1 + UPSTREAM_PORT_NAMES.length);
    for (let index = 0; index < UPSTREAM_PORT_NAMES.length; index += 1) {
      const [id, name] = postgresMigrationEntries[index + 1]!;
      expect(id).toBe(index + 2);
      expect(name).toBe(UPSTREAM_PORT_NAMES[index]);
    }
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
