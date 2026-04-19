import {
  ClientOrchestrationCommand,
  DeviceId,
  OrchestrationDispatchCommandError,
} from "@v3tools/contracts";
import { Context } from "effect";
import type { Effect } from "effect";

export interface MeshEventIngestionShape {
  readonly publishCommand: (input: {
    readonly command: ClientOrchestrationCommand;
    readonly deviceId: DeviceId | null;
  }) => Effect.Effect<{ readonly sequence: number }, OrchestrationDispatchCommandError>;
}

export class MeshEventIngestion extends Context.Service<
  MeshEventIngestion,
  MeshEventIngestionShape
>()("v3/orchestration/Services/MeshEventIngestion") {}
