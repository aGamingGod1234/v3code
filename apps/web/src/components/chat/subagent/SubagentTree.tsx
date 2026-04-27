// V3 Phase 10 — recursive tree renderer for the subagent forest.
//
// `MessagesTimeline` calls this at the parent Agent tool_use slot.
// It just iterates the top-level nodes and renders `SubagentCard`s;
// nested children render recursively inside each card's expanded
// body (see `SubagentCard.tsx`).
//
// Kept as a thin wrapper so the parent component doesn't need to
// know about the forest shape — it always gets a single React
// element regardless of how many subagent runs are present.

import { useMemo } from "react";

import type { OrchestrationThreadActivity } from "@v3tools/contracts";

import { cn } from "~/lib/utils";

import { SubagentCard } from "./SubagentCard";
import { deriveSubagentTree, type SubagentNode } from "./subagentDerivation.ts";

export interface SubagentTreeProps {
  readonly activities: ReadonlyArray<OrchestrationThreadActivity>;
  readonly onElementPicked?: ((subagentId: string) => void) | undefined;
  readonly className?: string;
}

export function SubagentTree({ activities, onElementPicked, className }: SubagentTreeProps) {
  const tree = useMemo(() => deriveSubagentTree(activities), [activities]);
  if (tree.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-2", className)} data-slot="subagent-tree">
      {tree.map((node: SubagentNode) => (
        <SubagentCard key={node.id} node={node} onElementPicked={onElementPicked} />
      ))}
    </div>
  );
}
