import { Effect, Layer, PubSub, Queue, Ref, Stream } from "effect";

import { OrchestrationEventStore } from "../../persistence/Services/OrchestrationEventStore.ts";
import {
  ChatSubscriptionManager,
  type ChatSubscriptionManagerShape,
} from "../Services/ChatSubscriptionManager.ts";

const makeChatSubscriptionManager = Effect.gen(function* () {
  const eventStore = yield* OrchestrationEventStore;
  const channelsRef = yield* Ref.make(
    new Map<
      string,
      PubSub.PubSub<Parameters<ChatSubscriptionManagerShape["publishThreadEvent"]>[0]>
    >(),
  );
  const subscribersByThreadRef = yield* Ref.make(new Map<string, Map<string, number>>());

  const getOrCreateChannel = (threadId: string) =>
    Effect.gen(function* () {
      const existing = (yield* Ref.get(channelsRef)).get(threadId);
      if (existing) {
        return existing;
      }
      const created =
        yield* PubSub.unbounded<
          Parameters<ChatSubscriptionManagerShape["publishThreadEvent"]>[0]
        >();
      yield* Ref.update(channelsRef, (current) => {
        if (current.has(threadId)) {
          return current;
        }
        const next = new Map(current);
        next.set(threadId, created);
        return next;
      });
      return (yield* Ref.get(channelsRef)).get(threadId) ?? created;
    });

  const incrementSubscriber = (threadId: string, deviceId: string) =>
    Ref.update(subscribersByThreadRef, (current) => {
      const next = new Map(current);
      const nextSubscribers = new Map(next.get(threadId) ?? []);
      nextSubscribers.set(deviceId, (nextSubscribers.get(deviceId) ?? 0) + 1);
      next.set(threadId, nextSubscribers);
      return next;
    });

  const decrementSubscriber = (threadId: string, deviceId: string) =>
    Ref.update(subscribersByThreadRef, (current) => {
      const existing = current.get(threadId);
      const existingCount = existing?.get(deviceId) ?? 0;
      if (existingCount <= 1) {
        if (!existing || !existing.has(deviceId)) {
          return current;
        }
        const next = new Map(current);
        const nextSubscribers = new Map(existing);
        nextSubscribers.delete(deviceId);
        if (nextSubscribers.size === 0) {
          next.delete(threadId);
        } else {
          next.set(threadId, nextSubscribers);
        }
        return next;
      }
      if (!existing) {
        return current;
      }
      const next = new Map(current);
      const nextSubscribers = new Map(existing);
      nextSubscribers.set(deviceId, existingCount - 1);
      next.set(threadId, nextSubscribers);
      return next;
    });

  const trackSubscriber = (threadId: string, deviceId: string) =>
    incrementSubscriber(threadId, deviceId).pipe(
      Effect.flatMap(() =>
        Effect.addFinalizer(() => decrementSubscriber(threadId, deviceId).pipe(Effect.asVoid)),
      ),
    );

  return {
    publishThreadEvent: (event) =>
      Effect.gen(function* () {
        if (event.aggregateKind !== "thread") {
          return;
        }
        const channel = (yield* Ref.get(channelsRef)).get(event.aggregateId);
        if (!channel) {
          return;
        }
        yield* PubSub.publish(channel, event).pipe(Effect.asVoid);
      }),
    subscribeThread: (input) =>
      Stream.unwrap(
        Effect.gen(function* () {
          const channel = yield* getOrCreateChannel(input.threadId);
          const deliveredStreamVersion = yield* Ref.make(input.fromStreamVersionExclusive);
          const liveOutbox =
            yield* Queue.unbounded<
              Parameters<ChatSubscriptionManagerShape["publishThreadEvent"]>[0]
            >();
          if (input.subscriberDeviceId) {
            yield* trackSubscriber(input.threadId, input.subscriberDeviceId);
          }

          yield* Stream.fromPubSub(channel).pipe(
            Stream.runForEach((event) => Queue.offer(liveOutbox, event).pipe(Effect.asVoid)),
            Effect.forkScoped,
          );

          const replay = eventStore
            .readThreadStream(input.threadId, input.fromStreamVersionExclusive)
            .pipe(
              Stream.tap((event) =>
                event.streamVersion !== undefined
                  ? Ref.set(deliveredStreamVersion, event.streamVersion)
                  : Effect.void,
              ),
            );

          const live = Stream.fromQueue(liveOutbox).pipe(
            Stream.filterEffect((event) =>
              Ref.get(deliveredStreamVersion).pipe(
                Effect.map(
                  (cursor) => (event.streamVersion ?? input.fromStreamVersionExclusive) > cursor,
                ),
              ),
            ),
            Stream.tap((event) =>
              event.streamVersion !== undefined
                ? Ref.set(deliveredStreamVersion, event.streamVersion)
                : Effect.void,
            ),
          );

          return Stream.concat(replay, live);
        }),
      ),
  } satisfies ChatSubscriptionManagerShape;
});

export const ChatSubscriptionManagerLive = Layer.effect(
  ChatSubscriptionManager,
  makeChatSubscriptionManager,
);
