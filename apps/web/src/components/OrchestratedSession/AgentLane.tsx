import type { OrchestratorRole } from "@v3tools/contracts/orchestrator-config";

import { AgentBadge } from "./AgentBadge";

export interface AgentLaneChunk {
  readonly id: string;
  readonly text: string;
  readonly createdAt: string;
}

export function AgentLane(props: {
  role: OrchestratorRole;
  modelLabel: string;
  status: string;
  chunks: ReadonlyArray<AgentLaneChunk>;
}) {
  return (
    <section className="flex min-h-40 min-w-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-card">
      <div className="border-b border-border/60 px-3 py-2">
        <AgentBadge role={props.role} modelLabel={props.modelLabel} status={props.status} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {props.chunks.length === 0 ? (
          <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed border-border/80 px-3 text-center text-xs text-muted-foreground">
            Waiting for lane output.
          </div>
        ) : (
          props.chunks.map((chunk) => (
            <div
              key={chunk.id}
              className="whitespace-pre-wrap rounded-md bg-muted/45 px-2.5 py-2 text-xs leading-relaxed text-foreground"
            >
              {chunk.text}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
