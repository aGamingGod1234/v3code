import { DeviceId, OrchestrationEvent, ThreadId } from "@v3tools/contracts";
import { Context, Schema } from "effect";
import type { Effect, Stream } from "effect";

import type { OrchestrationEventStoreError } from "../../persistence/Errors.ts";

export const ChatSubscriptionInput = Schema.Struct({
  threadId: ThreadId,
  fromStreamVersionExclusive: Schema.Number,
  subscriberDeviceId: Schema.optionalKey(Schema.NullOr(DeviceId)),
});
export type ChatSubscriptionInput = typeof ChatSubscriptionInput.Type;

export interface ChatSubscriptionManagerShape {
  readonly publishThreadEvent: (event: OrchestrationEvent) => Effect.Effect<void>;
  readonly subscribeThread: (
    input: ChatSubscriptionInput,
  ) => Stream.Stream<OrchestrationEvent, OrchestrationEventStoreError>;
}

export class ChatSubscriptionManager extends Context.Service<
  ChatSubscriptionManager,
  ChatSubscriptionManagerShape
>()("v3/mesh/Services/ChatSubscriptionManager") {}
