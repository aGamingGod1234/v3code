// V3 Phase 10 — per-subagent stats badge.
//
// Cline-style summary chips that render the tool count, wall-clock
// duration, and token usage. Kept dumb so both the inline
// `SubagentCard` header and the `AgentsTab` detail view can consume
// them without duplicating formatting logic.

import { type ReactNode } from "react";

import { cn } from "~/lib/utils";

import type { SubagentUsage } from "./subagentDerivation.ts";

const formatDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds - mins * 60);
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
};

const formatTokens = (count: number): string => {
  if (!Number.isFinite(count) || count <= 0) return "0";
  if (count < 1_000) return String(count);
  if (count < 1_000_000) return `${(count / 1_000).toFixed(count < 10_000 ? 1 : 0)}k`;
  return `${(count / 1_000_000).toFixed(1)}M`;
};

const formatUsage = (usage: SubagentUsage): string => {
  const total = usage.inputTokens + usage.outputTokens;
  if (total === 0) return "0 tok";
  return `${formatTokens(total)} tok`;
};

export interface SubagentSummaryChipProps {
  readonly toolCount: number;
  readonly elapsedSeconds: number;
  readonly usage: SubagentUsage;
  readonly className?: string;
}

const Item = ({ label, value }: { label: string; value: ReactNode }) => (
  <span className="inline-flex items-baseline gap-1">
    <span className="font-mono text-xs tabular-nums text-foreground/80">{value}</span>
    <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">{label}</span>
  </span>
);

export function SubagentSummaryChip(props: SubagentSummaryChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-3 rounded-sm border border-border/60 bg-card/40 px-2 py-0.5 text-xs",
        props.className,
      )}
      data-slot="subagent-summary-chip"
    >
      <Item label="tools" value={props.toolCount} />
      <Item label="elapsed" value={formatDuration(props.elapsedSeconds)} />
      <Item label="usage" value={formatUsage(props.usage)} />
    </span>
  );
}
