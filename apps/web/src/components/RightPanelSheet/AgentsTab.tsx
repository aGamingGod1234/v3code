// V3 Phase 10 — Kilo-style two-column agents panel.
//
// Lives inside the `RightPanelSheet` as a secondary "power view" for
// inspecting every subagent a thread has spawned. Column 1 is a
// flat indented list of all nodes across the forest; column 2 shows
// the selected node's full detail (prompt, summary, result, children).
//
// Rendered from the same activity feed the inline `SubagentCard`
// consumes — derivation is memoised so switching between the inline
// timeline and this panel doesn't recompute the tree.

import { useMemo, useState } from "react";

import type { OrchestrationThreadActivity } from "@v3tools/contracts";

import { cn } from "~/lib/utils";

import { SubagentCard } from "../chat/subagent/SubagentCard";
import { SubagentInlineStatus } from "../chat/subagent/SubagentInlineStatus";
import { SubagentSummaryChip } from "../chat/subagent/SubagentSummaryChip";
import {
  aggregateSubagents,
  deriveSubagentTree,
  flattenSubagentTree,
  type FlatSubagentEntry,
  type SubagentNode,
} from "../chat/subagent/subagentDerivation.ts";

export interface AgentsTabProps {
  readonly activities: ReadonlyArray<OrchestrationThreadActivity>;
  readonly className?: string;
}

export function AgentsTab({ activities, className }: AgentsTabProps) {
  const tree = useMemo(() => deriveSubagentTree(activities), [activities]);
  const flat = useMemo(() => flattenSubagentTree(tree), [tree]);
  const aggregate = useMemo(() => aggregateSubagents(tree), [tree]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(() => {
    if (selectedId === null) return null;
    return findNodeById(tree, selectedId);
  }, [selectedId, tree]);

  if (flat.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full min-h-0 flex-col items-center justify-center gap-2 p-6 text-sm text-muted-foreground",
          className,
        )}
        data-slot="agents-tab-empty"
      >
        <p>No subagents have run in this thread yet.</p>
        <p>
          They appear here as soon as the primary agent spawns one (Claude’s{" "}
          <code className="font-mono">Agent</code> tool or Codex nested sessions).
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)} data-slot="agents-tab">
      <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Subagents</h2>
          <p className="text-xs text-muted-foreground">
            {aggregate.running} running · {aggregate.completed} done · {aggregate.failed} failed
          </p>
        </div>
        <SubagentSummaryChip
          toolCount={aggregate.totalToolCount}
          elapsedSeconds={aggregate.totalElapsedSeconds}
          usage={aggregate.totalUsage}
        />
      </header>
      <div className="flex min-h-0 flex-1 gap-0">
        <aside className="flex w-60 shrink-0 flex-col overflow-y-auto border-r border-border/60 p-2 text-sm">
          {flat.map((entry: FlatSubagentEntry) => (
            <AgentRow
              key={entry.node.id}
              entry={entry}
              active={entry.node.id === selectedId}
              onSelect={() => setSelectedId(entry.node.id)}
            />
          ))}
        </aside>
        <section className="min-w-0 flex-1 overflow-y-auto p-4">
          {selected === null ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a subagent on the left to view detail.
            </div>
          ) : (
            <SubagentCard node={selected} defaultExpanded className="max-w-none" />
          )}
        </section>
      </div>
    </div>
  );
}

const AgentRow = ({
  entry,
  active,
  onSelect,
}: {
  readonly entry: FlatSubagentEntry;
  readonly active: boolean;
  readonly onSelect: () => void;
}) => (
  <button
    type="button"
    onClick={onSelect}
    className={cn(
      "flex items-center gap-1 rounded-sm px-1.5 py-1 text-left text-xs transition-colors",
      active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
    )}
    style={{ paddingInlineStart: `${8 + Math.min(entry.depth, 6) * 12}px` }}
  >
    <SubagentInlineStatus node={entry.node} className="text-xs" />
  </button>
);

const findNodeById = (nodes: ReadonlyArray<SubagentNode>, id: string): SubagentNode | null => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findNodeById(node.children, id);
    if (child !== null) return child;
  }
  return null;
};
