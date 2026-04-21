import * as Crypto from "node:crypto";

import { DateTime, Effect, Layer, Option, Ref } from "effect";

import type { GoogleTokenHandoffConsumeResult } from "@v3tools/contracts";

import {
  GoogleTokenHandoffStore,
  type GoogleTokenHandoffStoreShape,
} from "../Services/GoogleTokenHandoffStore.ts";

const GOOGLE_TOKEN_HANDOFF_TTL_MS = 2 * 60 * 1000;

interface StoredGoogleTokenHandoff {
  readonly expiresAtMs: number;
  readonly value: GoogleTokenHandoffConsumeResult;
}

const pruneExpiredEntries = (
  current: Map<string, StoredGoogleTokenHandoff>,
  nowMs: number,
): Map<string, StoredGoogleTokenHandoff> => {
  const next = new Map<string, StoredGoogleTokenHandoff>();
  for (const [id, entry] of current.entries()) {
    if (entry.expiresAtMs > nowMs) {
      next.set(id, entry);
    }
  }
  return next;
};

export const makeGoogleTokenHandoffStore = Effect.gen(function* () {
  const state = yield* Ref.make(new Map<string, StoredGoogleTokenHandoff>());

  const issue: GoogleTokenHandoffStoreShape["issue"] = (input) =>
    Ref.modify(state, (current) => {
      const nowMs = DateTime.toEpochMillis(input.now);
      const handoffId = Crypto.randomUUID();
      const next = pruneExpiredEntries(current, nowMs);
      next.set(handoffId, {
        expiresAtMs: nowMs + GOOGLE_TOKEN_HANDOFF_TTL_MS,
        value: {
          snapshot: input.snapshot,
          tokens: input.tokens,
        },
      });
      return [handoffId, next] as const;
    });

  const consume: GoogleTokenHandoffStoreShape["consume"] = (input) =>
    Ref.modify(state, (current) => {
      const nowMs = DateTime.toEpochMillis(input.now);
      const next = pruneExpiredEntries(current, nowMs);
      const entry = next.get(input.id);
      if (!entry) {
        return [Option.none(), next] as const;
      }
      next.delete(input.id);
      return [Option.some(entry.value), next] as const;
    });

  return {
    issue,
    consume,
  } satisfies GoogleTokenHandoffStoreShape;
});

export const GoogleTokenHandoffStoreLive = Layer.effect(
  GoogleTokenHandoffStore,
  makeGoogleTokenHandoffStore,
);
