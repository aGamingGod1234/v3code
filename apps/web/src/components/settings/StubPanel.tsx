// Reusable "Coming soon" panel for settings tabs that aren't wired up yet.
// Per Phase 1 rule: don't render persisted toggles for unwired functionality —
// the placeholder is honest about what works and what doesn't.

import { ConstructionIcon } from "lucide-react";

interface StubPanelProps {
  readonly title: string;
  readonly description: string;
  readonly bullets?: ReadonlyArray<string>;
}

export function StubPanel({ title, description, bullets }: StubPanelProps) {
  return (
    <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-8">
      <div className="flex items-start gap-3">
        <ConstructionIcon className="size-5 shrink-0 text-muted-foreground" />
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
          {bullets && bullets.length > 0 ? (
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              {bullets.map((bullet) => (
                <li key={bullet} className="flex items-center gap-2">
                  <span className="size-1 rounded-full bg-muted-foreground/60" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-muted-foreground/80">Coming soon.</p>
        </div>
      </div>
    </div>
  );
}
