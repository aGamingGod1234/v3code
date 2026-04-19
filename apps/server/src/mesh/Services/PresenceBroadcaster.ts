import { PresenceUpdatePayload } from "@v3tools/contracts";
import { Context } from "effect";
import type { Effect, Stream } from "effect";

export interface PresenceBroadcasterShape {
  readonly publish: (update: PresenceUpdatePayload) => Effect.Effect<void>;
  readonly stream: Stream.Stream<PresenceUpdatePayload>;
}

export class PresenceBroadcaster extends Context.Service<
  PresenceBroadcaster,
  PresenceBroadcasterShape
>()("v3/mesh/Services/PresenceBroadcaster") {}
