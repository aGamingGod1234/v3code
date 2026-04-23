/**
 * OrchestrationEventStore - Event store interface for orchestration events.
 *
 * Owns durable append/replay access to the orchestration event stream. It does
 * not reduce events into read models or apply command validation rules.
 *
 * Uses Effect `Context.Service` for dependency injection and exposes typed
 * persistence/decode errors for event append and replay operations.
 *
 * @module OrchestrationEventStore
 */
import {
  OrchestrationEvent,
  TrimmedNonEmptyString,
  type CommandId,
  type DeviceId,
  type IsoDateTime,
  type ProjectId,
  type ThreadId,
} from "@v3tools/contracts";
import { Context } from "effect";
import type { Effect, Stream } from "effect";

import type { OrchestrationEventStoreError } from "../Errors.ts";

/**
 * Input for fork-copying a thread's event log into a new stream.
 *
 * Copies every `aggregate_kind='thread'` event from `sourceThreadId` to
 * `targetThreadId`, rewriting `payload.threadId` and tagging
 * `metadata.forkedFromChatId`. The copy preserves stream_version so the
 * target stream has the same per-thread sequence as the source plus the
 * appended `thread.forked` event at the next stream_version.
 */
export interface ForkThreadEventsInput {
  readonly sourceThreadId: ThreadId;
  readonly targetThreadId: ThreadId;
  readonly newProjectId?: ProjectId | undefined;
  readonly newTitle?: typeof TrimmedNonEmptyString.Type | undefined;
  readonly newBranch?: typeof TrimmedNonEmptyString.Type | null | undefined;
  readonly newWorktreePath?: typeof TrimmedNonEmptyString.Type | null | undefined;
  readonly newHostDeviceId?: DeviceId | null | undefined;
  readonly forkOccurredAt: IsoDateTime;
  readonly forkCommandId: CommandId;
  readonly parentDeviceId: DeviceId | null;
}

export interface ForkThreadEventsResult {
  readonly copiedEventCount: number;
  readonly forkedEvent: OrchestrationEvent;
  readonly highestSourceStreamVersion: number;
}

/**
 * OrchestrationEventStoreShape - Service API for orchestration event persistence.
 */
export interface OrchestrationEventStoreShape {
  /**
   * Persist a new orchestration event.
   *
   * @param event - Event payload without sequence (assigned by storage).
   * @returns Effect containing the stored event with assigned sequence.
   *
   * Actor kind is inferred from command/metadata before persistence.
   */
  readonly append: (
    event: Omit<OrchestrationEvent, "sequence">,
  ) => Effect.Effect<OrchestrationEvent, OrchestrationEventStoreError>;

  /**
   * Replay events after the provided sequence.
   *
   * @param sequenceExclusive - Sequence cursor (exclusive).
   * @param limit - Maximum number of events to emit.
   * @returns Stream containing ordered events.
   *
   * Reads in fixed-size pages and normalizes non-integer/negative limits.
   */
  readonly readFromSequence: (
    sequenceExclusive: number,
    limit?: number,
  ) => Stream.Stream<OrchestrationEvent, OrchestrationEventStoreError>;

  /**
   * Replay events for a single thread after the provided per-thread stream version.
   */
  readonly readThreadStream: (
    threadId: string,
    streamVersionExclusive: number,
    limit?: number,
  ) => Stream.Stream<OrchestrationEvent, OrchestrationEventStoreError>;

  /**
   * Replay all events for a single thread from the start of the stream.
   *
   * Unlike `readThreadStream`, the initial cursor is inclusive — the event at
   * `stream_version 0` (typically `thread.created`) is returned. Used by fork
   * replay paths that need the full seeded history of a freshly forked
   * thread.
   */
  readonly readThreadStreamAll: (
    threadId: string,
  ) => Stream.Stream<OrchestrationEvent, OrchestrationEventStoreError>;

  /**
   * Return the latest persisted stream version for a thread.
   */
  readonly getLatestThreadStreamVersion: (
    threadId: string,
  ) => Effect.Effect<number, OrchestrationEventStoreError>;

  /**
   * Read all events from the beginning of the stream.
   *
   * @returns Stream containing all stored events.
   */
  readonly readAll: () => Stream.Stream<OrchestrationEvent, OrchestrationEventStoreError>;

  /**
   * Fork a thread's event log into a new stream.
   *
   * Copies every event from the source thread to the target thread preserving
   * `stream_version`, rewriting `payload.threadId` (and optionally projectId,
   * title, branch, worktreePath, hostDeviceId on `thread.created`/`thread.meta-updated`),
   * and tagging `metadata.forkedFromChatId` on every copied event. Then appends
   * a `thread.forked` event to the new stream at the next stream_version.
   *
   * Idempotent via the supplied `forkCommandId` (callers should guard with
   * `OrchestrationCommandReceiptRepository`).
   *
   * Must be called inside a SQL transaction so the copy and the trailing
   * `thread.forked` append commit atomically.
   */
  readonly forkThreadEvents: (
    input: ForkThreadEventsInput,
  ) => Effect.Effect<ForkThreadEventsResult, OrchestrationEventStoreError>;
}

/**
 * OrchestrationEventStore - Service tag for orchestration event persistence.
 *
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   const events = yield* OrchestrationEventStore
 *   return yield* Stream.runCollect(events.readAll())
 * })
 * ```
 */
export class OrchestrationEventStore extends Context.Service<
  OrchestrationEventStore,
  OrchestrationEventStoreShape
>()("t3/persistence/Services/OrchestrationEventStore") {}
