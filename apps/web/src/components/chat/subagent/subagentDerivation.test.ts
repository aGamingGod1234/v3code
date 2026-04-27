import type { OrchestrationThreadActivity } from "@v3tools/contracts";
import { describe, expect, it } from "vitest";

import {
  aggregateSubagents,
  deriveSubagentTree,
  flattenSubagentTree,
} from "./subagentDerivation.ts";

const makeActivity = (
  kind: string,
  payload: Record<string, unknown>,
  createdAt: string,
  id: string,
): OrchestrationThreadActivity =>
  ({
    id,
    tone: "info" as const,
    kind,
    summary: (payload.summary as string | undefined) ?? "activity",
    payload,
    turnId: null,
    createdAt,
  }) as unknown as OrchestrationThreadActivity;

describe("deriveSubagentTree", () => {
  it("produces an empty forest for an empty activity feed", () => {
    expect(deriveSubagentTree([])).toEqual([]);
  });

  it("turns a started → completed sequence into a single completed node", () => {
    const activities = [
      makeActivity(
        "subagent.started",
        {
          subagentId: "sub-1",
          agentType: "code-explorer",
          label: "Explorer",
          prompt: "Investigate auth module",
          model: "claude-sonnet-4-6",
        },
        "2026-04-22T10:00:00.000Z",
        "ev-1",
      ),
      makeActivity(
        "subagent.progress",
        {
          subagentId: "sub-1",
          lastToolName: "Grep",
          toolCount: 3,
          elapsedSeconds: 2.5,
        },
        "2026-04-22T10:00:02.500Z",
        "ev-2",
      ),
      makeActivity(
        "subagent.completed",
        {
          subagentId: "sub-1",
          summary: "Found 2 suspects",
          toolCount: 6,
          elapsedSeconds: 8.1,
          usage: { input_tokens: 1200, output_tokens: 340 },
          result: "# Findings\n- …",
        },
        "2026-04-22T10:00:08.100Z",
        "ev-3",
      ),
    ];
    const tree = deriveSubagentTree(activities);
    expect(tree).toHaveLength(1);
    const root = tree[0]!;
    expect(root.status).toBe("completed");
    expect(root.label).toBe("Explorer");
    expect(root.agentType).toBe("code-explorer");
    expect(root.toolCount).toBe(6);
    expect(root.elapsedSeconds).toBeCloseTo(8.1, 2);
    expect(root.usage.inputTokens).toBe(1200);
    expect(root.usage.outputTokens).toBe(340);
    expect(root.result).toContain("Findings");
  });

  it("nests a Claude Agent-inside-Agent hierarchy via parentSubagentId", () => {
    const activities = [
      makeActivity(
        "subagent.started",
        {
          subagentId: "sub-root",
          agentType: "code-reviewer",
          label: "Reviewer",
        },
        "2026-04-22T10:00:00.000Z",
        "ev-1",
      ),
      makeActivity(
        "subagent.started",
        {
          subagentId: "sub-child",
          parentSubagentId: "sub-root",
          agentType: "code-explorer",
        },
        "2026-04-22T10:00:01.000Z",
        "ev-2",
      ),
      makeActivity(
        "subagent.completed",
        { subagentId: "sub-child", summary: "done" },
        "2026-04-22T10:00:05.000Z",
        "ev-3",
      ),
      makeActivity(
        "subagent.completed",
        { subagentId: "sub-root", summary: "done" },
        "2026-04-22T10:00:08.000Z",
        "ev-4",
      ),
    ];
    const tree = deriveSubagentTree(activities);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.id).toBe("sub-root");
    expect(tree[0]!.children).toHaveLength(1);
    expect(tree[0]!.children[0]!.id).toBe("sub-child");
  });

  it("recovers when a subagent.completed arrives without a matching started", () => {
    const activities = [
      makeActivity(
        "subagent.completed",
        {
          subagentId: "sub-orphan",
          summary: "Finished without start",
          toolCount: 2,
        },
        "2026-04-22T10:00:00.000Z",
        "ev-1",
      ),
    ];
    const tree = deriveSubagentTree(activities);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.status).toBe("completed");
    expect(tree[0]!.toolCount).toBe(2);
  });

  it("captures failure reason + error message", () => {
    const activities = [
      makeActivity("subagent.started", { subagentId: "sub-1" }, "2026-04-22T10:00:00.000Z", "ev-1"),
      makeActivity(
        "subagent.failed",
        {
          subagentId: "sub-1",
          reason: "timeout",
          errorMessage: "30s timeout",
        },
        "2026-04-22T10:00:30.000Z",
        "ev-2",
      ),
    ];
    const tree = deriveSubagentTree(activities);
    expect(tree[0]!.status).toBe("failed");
    expect(tree[0]!.failureReason).toBe("timeout");
    expect(tree[0]!.errorMessage).toBe("30s timeout");
  });

  it("orders roots deterministically by startedAt ascending", () => {
    const activities = [
      makeActivity("subagent.started", { subagentId: "sub-b" }, "2026-04-22T10:00:02.000Z", "ev-1"),
      makeActivity("subagent.started", { subagentId: "sub-a" }, "2026-04-22T10:00:01.000Z", "ev-2"),
    ];
    const tree = deriveSubagentTree(activities);
    expect(tree.map((n) => n.id)).toEqual(["sub-a", "sub-b"]);
  });

  it("ignores payloads missing a subagentId", () => {
    const activities = [
      makeActivity("subagent.started", { agentType: "x" }, "2026-04-22T10:00:00.000Z", "ev-1"),
    ];
    expect(deriveSubagentTree(activities)).toEqual([]);
  });
});

describe("flattenSubagentTree", () => {
  it("walks parents before children", () => {
    const activities = [
      makeActivity("subagent.started", { subagentId: "a" }, "2026-04-22T10:00:00.000Z", "ev-1"),
      makeActivity(
        "subagent.started",
        { subagentId: "a-1", parentSubagentId: "a" },
        "2026-04-22T10:00:01.000Z",
        "ev-2",
      ),
      makeActivity(
        "subagent.started",
        { subagentId: "a-1-1", parentSubagentId: "a-1" },
        "2026-04-22T10:00:02.000Z",
        "ev-3",
      ),
      makeActivity("subagent.started", { subagentId: "b" }, "2026-04-22T10:00:03.000Z", "ev-4"),
    ];
    const flat = flattenSubagentTree(deriveSubagentTree(activities));
    expect(flat.map((entry) => ({ id: entry.node.id, depth: entry.depth }))).toEqual([
      { id: "a", depth: 0 },
      { id: "a-1", depth: 1 },
      { id: "a-1-1", depth: 2 },
      { id: "b", depth: 0 },
    ]);
  });
});

describe("aggregateSubagents", () => {
  it("counts statuses and sums tool counts / usage across nesting", () => {
    const activities = [
      makeActivity("subagent.started", { subagentId: "a" }, "2026-04-22T10:00:00.000Z", "ev-1"),
      makeActivity(
        "subagent.started",
        { subagentId: "b", parentSubagentId: "a" },
        "2026-04-22T10:00:01.000Z",
        "ev-2",
      ),
      makeActivity(
        "subagent.completed",
        {
          subagentId: "b",
          toolCount: 3,
          elapsedSeconds: 5,
          usage: { inputTokens: 100, outputTokens: 50 },
        },
        "2026-04-22T10:00:06.000Z",
        "ev-3",
      ),
      makeActivity(
        "subagent.failed",
        { subagentId: "a", reason: "error", toolCount: 7, elapsedSeconds: 9 },
        "2026-04-22T10:00:09.000Z",
        "ev-4",
      ),
    ];
    const agg = aggregateSubagents(deriveSubagentTree(activities));
    expect(agg.running).toBe(0);
    expect(agg.completed).toBe(1);
    expect(agg.failed).toBe(1);
    expect(agg.totalToolCount).toBe(10);
    expect(agg.totalElapsedSeconds).toBe(14);
    expect(agg.totalUsage.inputTokens).toBe(100);
  });
});
