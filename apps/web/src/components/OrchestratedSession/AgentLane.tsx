import type { ReactNode } from "react";

import { cn } from "~/lib/utils";

export interface AgentLaneEntry {
  readonly id: string;
  readonly text: string;
  readonly at: string | null;
  readonly tone?: "info" | "tool" | "approval" | "error";
}

export function AgentLane({
  title,
  badge,
  entries,
  emptyText,
  className,
}: {
  readonly title: string;
  readonly badge: ReactNode;
  readonly entries: ReadonlyArray<AgentLaneEntry>;
  readonly emptyText: string;
  readonly className?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden border-border/70 border-r bg-background last:border-r-0",
        className,
      )}
    >
      <div className="flex min-h-11 items-center gap-2 border-border/70 border-b px-3">
        <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">
          {title}
        </h2>
        {badge}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {entries.length === 0 ? (
          <div className="flex h-full min-h-36 items-center justify-center rounded-md border border-dashed border-border/70 px-4 text-center text-muted-foreground text-xs">
            {emptyText}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map((entry) => (
              <article
                key={entry.id}
                className={cn(
                  "rounded-md border border-border/70 bg-card px-3 py-2 text-card-foreground text-xs shadow-sm/4",
                  entry.tone === "error" && "border-destructive/40",
                )}
              >
                <div className="whitespace-pre-wrap break-words leading-relaxed">{entry.text}</div>
                {entry.at ? (
                  <div className="mt-1 text-[10px] text-muted-foreground/70">{entry.at}</div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
