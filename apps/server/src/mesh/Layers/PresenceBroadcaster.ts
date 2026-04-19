import { Effect, Layer, PubSub, Stream } from "effect";

import {
  PresenceBroadcaster,
  type PresenceBroadcasterShape,
} from "../Services/PresenceBroadcaster.ts";

const makePresenceBroadcaster = Effect.gen(function* () {
  const pubsub = yield* PubSub.unbounded<Parameters<PresenceBroadcasterShape["publish"]>[0]>();

  return {
    publish: (update) => PubSub.publish(pubsub, update).pipe(Effect.asVoid),
    get stream() {
      return Stream.fromPubSub(pubsub);
    },
  } satisfies PresenceBroadcasterShape;
});

export const PresenceBroadcasterLive = Layer.effect(PresenceBroadcaster, makePresenceBroadcaster);
