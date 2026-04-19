import { type MeshPromptStreamItem } from "@v3tools/contracts";
import { Effect, Layer, Queue, Ref, Stream } from "effect";

import { PromptRouter, type PromptRouterShape } from "../Services/PromptRouter.ts";

const makePromptRouter = Effect.gen(function* () {
  const outboxesRef = yield* Ref.make(new Map<string, Queue.Queue<MeshPromptStreamItem>>());

  const getOrCreateOutbox = (sessionId: string) =>
    Effect.gen(function* () {
      const existing = (yield* Ref.get(outboxesRef)).get(sessionId);
      if (existing) {
        return existing;
      }
      const created = yield* Queue.unbounded<MeshPromptStreamItem>();
      yield* Ref.update(outboxesRef, (current) => {
        if (current.has(sessionId)) {
          return current;
        }
        const next = new Map(current);
        next.set(sessionId, created);
        return next;
      });
      return (yield* Ref.get(outboxesRef)).get(sessionId) ?? created;
    });

  return {
    publishToSession: ({ sessionId, item }) =>
      getOrCreateOutbox(sessionId).pipe(
        Effect.flatMap((outbox) => Queue.offer(outbox, item).pipe(Effect.asVoid)),
      ),
    subscribeSession: (sessionId) =>
      Stream.unwrap(
        getOrCreateOutbox(sessionId).pipe(Effect.map((outbox) => Stream.fromQueue(outbox))),
      ),
  } satisfies PromptRouterShape;
});

export const PromptRouterLive = Layer.effect(PromptRouter, makePromptRouter);
