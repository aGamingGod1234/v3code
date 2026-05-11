import type { OrchestratorProvider, OrchestratorRoleConfig } from "@v3tools/contracts";

import { cn } from "~/lib/utils";

const PROVIDER_LABEL: Record<OrchestratorProvider, string> = {
  claude_code: "Claude Code",
  codex: "Codex",
  gemini: "Gemini",
  custom: "Custom",
};

export function AgentBadge({
  role,
  config,
  status,
  className,
}: {
  readonly role: string;
  readonly config: OrchestratorRoleConfig | null;
  readonly status: "active" | "idle" | "done";
  readonly className?: string;
}) {
  const label = config
    ? `${PROVIDER_LABEL[config.provider]}${config.model ? ` / ${config.model}` : ""}`
    : "Unconfigured";

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[11px] text-muted-foreground",
        className,
      )}
      title={`${role}: ${label}`}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          status === "active"
            ? "bg-emerald-500"
            : status === "done"
              ? "bg-sky-500"
              : "bg-muted-foreground/45",
        )}
        aria-hidden="true"
      />
      <span className="truncate">{label}</span>
    </span>
  );
}
