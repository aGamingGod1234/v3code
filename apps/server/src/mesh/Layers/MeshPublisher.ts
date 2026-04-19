import { Effect, Layer, Stream } from "effect";

import { OrchestrationEngineService } from "../../orchestration/Services/OrchestrationEngine.ts";
import { ChatSubscriptionManager } from "../Services/ChatSubscriptionManager.ts";
import { MeshPublisher, type MeshPublisherShape } from "../Services/MeshPublisher.ts";

const makeMeshPublisher = Effect.gen(function* () {
  const orchestrationEngine = yield* OrchestrationEngineService;
  const chatSubscriptions = yield* ChatSubscriptionManager;

  yield* orchestrationEngine.streamDomainEvents.pipe(
    Stream.runForEach((event) => chatSubscriptions.publishThreadEvent(event)),
    Effect.forkScoped,
  );

  return {
    publishThreadEvent: chatSubscriptions.publishThreadEvent,
  } satisfies MeshPublisherShape;
});

export const MeshPublisherLive = Layer.effect(MeshPublisher, makeMeshPublisher);
