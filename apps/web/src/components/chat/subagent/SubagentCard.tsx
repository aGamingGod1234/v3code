// V3 Phase 10 — primary subagent UI.
//
// Renders a single `SubagentNode` as a collapsible card inline in
// `MessagesTimeline` at the parent Agent tool_use position. Header
// always shows the Devin-style live status; expanded body surfaces
// prompt / result / error / nested children.
//
// Keeps all branching logic local — the parent timeline just slots
// `<SubagentCard node={...} />` next to the other timeline row kinds.

import { ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "~/lib/utils";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import { SubagentInlineStatus } from "./SubagentInlineStatus";
import { SubagentSummaryChip } from "./SubagentSummaryChip";
import type { SubagentNode } from "./subagentDerivation.ts";

const borderToneClass = {
  running: "border-info/40 bg-info/4",
  completed: "border-success/40 bg-success/4",
  failed: "border-destructive/50 bg-destructive/6",
} as const;

export interface SubagentCardProps {
  readonly node: SubagentNode;
  readonly defaultExpanded?: boolean;
  readonly depth?: number;
  readonly onElementPicked?: ((nodeId: string) => void) | undefined;
  readonly className?: string;
}

export function SubagentCard({
  node,
  defaultExpanded = false,
  depth = 0,
  onElementPicked,
  className,
}: SubagentCardProps) {
  const [open, setOpen] = useState<boolean>(defaultExpanded || node.status === "running");

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-slot="subagent-card"
      data-status={node.status}
      className={cn(
        "rounded-md border p-2 transition-colors",
        borderToneClass[node.status],
        className,
      )}
      style={depth > 0 ? { marginInlineStart: `${Math.min(depth, 4) * 16}px` } : undefined}
    >
      <CollapsibleTrigger
        aria-label={`Toggle subagent ${node.label}`}
        className="flex w-full items-center gap-2 rounded-sm px-1 py-1 text-left hover:bg-card/60"
        onClick={() => onElementPicked?.(node.id)}
      >
        <ChevronRightIcon
          className={cn(
            "size-3.5 text-muted-foreground transition-transform",
            open ? "rotate-90" : undefined,
          )}
          aria-hidden
        />
        <SubagentInlineStatus
          node={node}
          className="flex-1"
          trailing={
            <SubagentSummaryChip
              toolCount={node.toolCount}
              elapsedSeconds={node.elapsedSeconds}
              usage={node.usage}
            />
          }
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-2 border-t border-border/50 px-1 pt-2">
          {node.prompt !== null ? (
            <Section title="Prompt">
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-sm bg-muted/40 p-2 text-xs font-mono text-foreground/80">
                {node.prompt}
              </pre>
            </Section>
          ) : null}
          {node.summary !== null ? (
            <Section title="Summary">
              <p className="text-sm text-foreground/90">{node.summary}</p>
            </Section>
          ) : null}
          {node.result !== null ? (
            <Section title="Result">
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-sm bg-muted/40 p-2 text-xs text-foreground/80">
                {node.result}
              </pre>
            </Section>
          ) : null}
          {node.errorMessage !== null ? (
            <Section title="Error">
              <p className="text-sm text-destructive">{node.errorMessage}</p>
            </Section>
          ) : null}
          {node.children.length > 0 ? (
            <Section title={`Subagents (${node.children.length})`}>
              <ul className="space-y-2">
                {node.children.map((child) => (
                  <li key={child.id}>
                    <SubagentCard
                      node={child}
                      depth={depth + 1}
                      onElementPicked={onElementPicked}
                    />
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          {node.model !== null || node.agentType !== null ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {node.agentType !== null ? (
                <span>
                  <span className="uppercase tracking-wider">agent</span>{" "}
                  <code className="font-mono text-foreground/80">{node.agentType}</code>
                </span>
              ) : null}
              {node.model !== null ? (
                <span>
                  <span className="uppercase tracking-wider">model</span>{" "}
                  <code className="font-mono text-foreground/80">{node.model}</code>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section>
    <h3 className="mb-1 text-[0.6rem] uppercase tracking-[0.15em] text-muted-foreground">
      {title}
    </h3>
    {children}
  </section>
);
