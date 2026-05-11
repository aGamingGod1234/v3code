import { ClockIcon, GaugeIcon, HashIcon, WrenchIcon } from "lucide-react";

import {
  formatModelStatDuration,
  formatTokenRate,
  formatTokens,
  type ModelRunStats,
  type ModelRunStatsAggregate,
} from "../../lib/modelRunStats";
import { cn } from "../../lib/utils";

function StatChip({
  label,
  value,
  className,
}: {
  readonly label: string;
  readonly value: string;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full border border-border/55 bg-background/45 px-2 text-[10px] font-medium text-muted-foreground",
        className,
      )}
    >
      <span className="text-muted-foreground/60">{label}</span>
      <span className="text-foreground/80">{value}</span>
    </span>
  );
}

export function AssistantModelRunStats({ stats }: { readonly stats: ModelRunStats }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <StatChip label="TTFT" value={formatModelStatDuration(stats.timeToFirstTokenMs)} />
      <StatChip label="Speed" value={formatTokenRate(stats.tokensPerSecond)} />
      <StatChip label="Tokens" value={formatTokens(stats.totalTokens)} />
      <StatChip label="Tools" value={String(stats.toolCalls)} />
    </div>
  );
}

export function ChatModelRunStatsStrip({
  stats,
  compact = false,
}: {
  readonly stats: ModelRunStatsAggregate;
  readonly compact?: boolean;
}) {
  if (stats.runs === 0) return null;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center justify-center gap-1.5 text-[10px] text-muted-foreground",
        compact ? "max-w-full" : "max-w-[44rem]",
      )}
      title="Detailed model specs for completed assistant turns in this chat"
    >
      <span className="inline-flex items-center gap-1 rounded-full border border-border/55 bg-card/45 px-2 py-1">
        <ClockIcon className="size-3" />
        TTFT {formatModelStatDuration(stats.timeToFirstTokenMs)}
      </span>
      <span className="inline-flex items-center gap-1 rounded-full border border-border/55 bg-card/45 px-2 py-1">
        <GaugeIcon className="size-3" />
        {formatTokenRate(stats.tokensPerSecond)}
      </span>
      <span className="inline-flex items-center gap-1 rounded-full border border-border/55 bg-card/45 px-2 py-1">
        <HashIcon className="size-3" />
        {formatTokens(stats.totalTokens)} tokens
      </span>
      <span className="inline-flex items-center gap-1 rounded-full border border-border/55 bg-card/45 px-2 py-1">
        <WrenchIcon className="size-3" />
        {stats.toolCalls} tools
      </span>
    </div>
  );
}
