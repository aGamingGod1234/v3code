import { OrchestrationEvent } from "@v3tools/contracts";
import { Context } from "effect";
import type { Effect } from "effect";

export interface MeshPublisherShape {
  readonly publishThreadEvent: (event: OrchestrationEvent) => Effect.Effect<void>;
}

export class MeshPublisher extends Context.Service<MeshPublisher, MeshPublisherShape>()(
  "v3/mesh/Services/MeshPublisher",
) {}
