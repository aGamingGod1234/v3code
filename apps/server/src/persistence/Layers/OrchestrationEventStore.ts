import {
  CommandId,
  EventId,
  IsoDateTime,
  NonNegativeInt,
  OrchestrationActorKind,
  OrchestrationAggregateKind,
  OrchestrationEvent,
  OrchestrationEventMetadata,
  OrchestrationEventType,
  ProjectId,
  ThreadId,
} from "@v3tools/contracts";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import { Effect, Layer, Schema, Stream } from "effect";

import {
  toPersistenceDecodeError,
  toPersistenceSqlError,
  type OrchestrationEventStoreError,
} from "../Errors.ts";
import {
  OrchestrationEventStore,
  type ForkThreadEventsInput,
  type ForkThreadEventsResult,
  type OrchestrationEventStoreShape,
} from "../Services/OrchestrationEventStore.ts";

const decodeEvent = Schema.decodeUnknownEffect(OrchestrationEvent);
const UnknownFromJsonString = Schema.fromJsonString(Schema.Unknown);
const EventMetadataFromJsonString = Schema.fromJsonString(OrchestrationEventMetadata);

const AppendEventRequestSchema = Schema.Struct({
  eventId: EventId,
  aggregateKind: OrchestrationAggregateKind,
  streamId: Schema.Union([ProjectId, ThreadId]),
  type: OrchestrationEventType,
  causationEventId: Schema.NullOr(EventId),
  correlationId: Schema.NullOr(CommandId),
  actorKind: OrchestrationActorKind,
  occurredAt: IsoDateTime,
  commandId: Schema.NullOr(CommandId),
  payloadJson: UnknownFromJsonString,
  metadataJson: EventMetadataFromJsonString,
});

const OrchestrationEventPersistedRowSchema = Schema.Struct({
  sequence: NonNegativeInt,
  streamVersion: NonNegativeInt,
  eventId: EventId,
  type: OrchestrationEventType,
  aggregateKind: OrchestrationAggregateKind,
  aggregateId: Schema.Union([ProjectId, ThreadId]),
  occurredAt: IsoDateTime,
  commandId: Schema.NullOr(CommandId),
  causationEventId: Schema.NullOr(EventId),
  correlationId: Schema.NullOr(CommandId),
  payload: UnknownFromJsonString,
  metadata: EventMetadataFromJsonString,
});

const ReadFromSequenceRequestSchema = Schema.Struct({
  sequenceExclusive: NonNegativeInt,
  limit: Schema.Number,
});
const ReadThreadStreamRequestSchema = Schema.Struct({
  threadId: ThreadId,
  streamVersionExclusive: NonNegativeInt,
  limit: Schema.Number,
});
const LatestThreadStreamVersionRequestSchema = Schema.Struct({
  threadId: ThreadId,
});
const LatestThreadStreamVersionRowSchema = Schema.Struct({
  latestStreamVersion: NonNegativeInt,
});
const DEFAULT_READ_FROM_SEQUENCE_LIMIT = 1_000;
const READ_PAGE_SIZE = 500;

function inferActorKind(
  event: Omit<OrchestrationEvent, "sequence">,
): Schema.Schema.Type<typeof OrchestrationActorKind> {
  if (event.commandId !== null && event.commandId.startsWith("provider:")) {
    return "provider";
  }
  if (event.commandId !== null && event.commandId.startsWith("server:")) {
    return "server";
  }
  if (
    event.metadata.providerTurnId !== undefined ||
    event.metadata.providerItemId !== undefined ||
    event.metadata.adapterKey !== undefined
  ) {
    return "provider";
  }
  if (event.commandId === null) {
    return "server";
  }
  return "client";
}

function toPersistenceSqlOrDecodeError(sqlOperation: string, decodeOperation: string) {
  return (cause: unknown): OrchestrationEventStoreError =>
    Schema.isSchemaError(cause)
      ? toPersistenceDecodeError(decodeOperation)(cause)
      : toPersistenceSqlError(sqlOperation)(cause);
}

interface ForkRewriteOverrides {
  readonly projectId?: string | undefined;
  readonly title?: string | undefined;
  readonly branch?: string | null | undefined;
  readonly worktreePath?: string | null | undefined;
  readonly hostDeviceId?: string | null | undefined;
}

interface ForkRewrittenRow {
  readonly eventId: string;
  readonly streamVersion: number;
  readonly type: typeof OrchestrationEventType.Type;
  readonly occurredAt: typeof IsoDateTime.Type;
  readonly commandId: typeof CommandId.Type | null;
  readonly causationEventId: typeof EventId.Type | null;
  readonly correlationId: typeof CommandId.Type | null;
  readonly actorKind: typeof OrchestrationActorKind.Type;
  readonly payloadJson: unknown;
  readonly metadataJson: typeof OrchestrationEventMetadata.Type;
}

function rewritePayloadForFork({
  payload,
  eventType,
  targetThreadId,
  overrides,
}: {
  readonly payload: unknown;
  readonly eventType: typeof OrchestrationEventType.Type;
  readonly targetThreadId: string;
  readonly overrides: ForkRewriteOverrides;
}): unknown {
  if (typeof payload !== "object" || payload === null) {
    return payload;
  }

  const next: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
  if ("threadId" in next) {
    next.threadId = targetThreadId;
  }

  if (eventType === "thread.created") {
    if (overrides.projectId !== undefined) {
      next.projectId = overrides.projectId;
    }
    if (overrides.title !== undefined) {
      next.title = overrides.title;
    }
    if (overrides.branch !== undefined) {
      next.branch = overrides.branch;
    }
    if (overrides.worktreePath !== undefined) {
      next.worktreePath = overrides.worktreePath;
    }
    if (overrides.hostDeviceId !== undefined) {
      next.hostDeviceId = overrides.hostDeviceId;
    }
  }

  if (eventType === "thread.meta-updated") {
    if (overrides.title !== undefined) {
      next.title = overrides.title;
    }
    if (overrides.branch !== undefined) {
      next.branch = overrides.branch;
    }
    if (overrides.worktreePath !== undefined) {
      next.worktreePath = overrides.worktreePath;
    }
    if (overrides.hostDeviceId !== undefined) {
      next.hostDeviceId = overrides.hostDeviceId;
    }
  }

  return next;
}

function rewriteEventForFork({
  event,
  targetThreadId,
  sourceThreadId,
  forkCommandId,
  overrides,
}: {
  readonly event: OrchestrationEvent;
  readonly targetThreadId: string;
  readonly sourceThreadId: string;
  readonly forkCommandId: typeof CommandId.Type;
  readonly overrides: ForkRewriteOverrides;
}): ForkRewrittenRow {
  const rewrittenPayload = rewritePayloadForFork({
    payload: event.payload,
    eventType: event.type,
    targetThreadId,
    overrides,
  });

  const baseMetadata = (event.metadata ?? {}) as Record<string, unknown>;
  const rewrittenMetadata = {
    ...baseMetadata,
    forkedFromChatId: sourceThreadId,
  } as typeof OrchestrationEventMetadata.Type;

  return {
    eventId: crypto.randomUUID(),
    streamVersion: event.streamVersion ?? 0,
    type: event.type,
    occurredAt: event.occurredAt,
    commandId: forkCommandId,
    causationEventId: event.eventId,
    correlationId: forkCommandId,
    actorKind: inferActorKind(event),
    payloadJson: rewrittenPayload,
    metadataJson: rewrittenMetadata,
  } satisfies ForkRewrittenRow;
}

const ForkRewrittenRowRequestSchema = Schema.Struct({
  eventId: EventId,
  streamId: ThreadId,
  streamVersion: NonNegativeInt,
  type: OrchestrationEventType,
  occurredAt: IsoDateTime,
  commandId: Schema.NullOr(CommandId),
  causationEventId: Schema.NullOr(EventId),
  correlationId: Schema.NullOr(CommandId),
  actorKind: OrchestrationActorKind,
  payloadJson: UnknownFromJsonString,
  metadataJson: EventMetadataFromJsonString,
});

const makeEventStore = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const appendEventRow = SqlSchema.findOne({
    Request: AppendEventRequestSchema,
    Result: OrchestrationEventPersistedRowSchema,
    execute: (request) =>
      sql`
        INSERT INTO orchestration_events (
          event_id,
          aggregate_kind,
          stream_id,
          stream_version,
          event_type,
          occurred_at,
          command_id,
          causation_event_id,
          correlation_id,
          actor_kind,
          payload_json,
          metadata_json
        )
        VALUES (
          ${request.eventId},
          ${request.aggregateKind},
          ${request.streamId},
          COALESCE(
            (
              SELECT stream_version + 1
              FROM orchestration_events
              WHERE aggregate_kind = ${request.aggregateKind}
                AND stream_id = ${request.streamId}
              ORDER BY stream_version DESC
              LIMIT 1
            ),
            0
          ),
          ${request.type},
          ${request.occurredAt},
          ${request.commandId},
          ${request.causationEventId},
          ${request.correlationId},
          ${request.actorKind},
          ${request.payloadJson},
          ${request.metadataJson}
        )
        RETURNING
          sequence,
          stream_version AS "streamVersion",
          event_id AS "eventId",
          event_type AS "type",
          aggregate_kind AS "aggregateKind",
          stream_id AS "aggregateId",
          occurred_at AS "occurredAt",
          command_id AS "commandId",
          causation_event_id AS "causationEventId",
          correlation_id AS "correlationId",
          payload_json AS "payload",
          metadata_json AS "metadata"
      `,
  });

  const readEventRowsFromSequence = SqlSchema.findAll({
    Request: ReadFromSequenceRequestSchema,
    Result: OrchestrationEventPersistedRowSchema,
    execute: (request) =>
      sql`
        SELECT
          sequence,
          stream_version AS "streamVersion",
          event_id AS "eventId",
          event_type AS "type",
          aggregate_kind AS "aggregateKind",
          stream_id AS "aggregateId",
          occurred_at AS "occurredAt",
          command_id AS "commandId",
          causation_event_id AS "causationEventId",
          correlation_id AS "correlationId",
          payload_json AS "payload",
          metadata_json AS "metadata"
        FROM orchestration_events
        WHERE sequence > ${request.sequenceExclusive}
        ORDER BY sequence ASC
        LIMIT ${request.limit}
      `,
  });

  const readThreadRowsFromStreamVersion = SqlSchema.findAll({
    Request: ReadThreadStreamRequestSchema,
    Result: OrchestrationEventPersistedRowSchema,
    execute: (request) =>
      sql`
        SELECT
          sequence,
          stream_version AS "streamVersion",
          event_id AS "eventId",
          event_type AS "type",
          aggregate_kind AS "aggregateKind",
          stream_id AS "aggregateId",
          occurred_at AS "occurredAt",
          command_id AS "commandId",
          causation_event_id AS "causationEventId",
          correlation_id AS "correlationId",
          payload_json AS "payload",
          metadata_json AS "metadata"
        FROM orchestration_events
        WHERE aggregate_kind = 'thread'
          AND stream_id = ${request.threadId}
          AND stream_version > ${request.streamVersionExclusive}
        ORDER BY stream_version ASC
        LIMIT ${request.limit}
      `,
  });

  const getLatestThreadStreamVersionRow = SqlSchema.findOne({
    Request: LatestThreadStreamVersionRequestSchema,
    Result: LatestThreadStreamVersionRowSchema,
    execute: ({ threadId }) =>
      sql`
        SELECT
          COALESCE(MAX(stream_version), 0) AS "latestStreamVersion"
        FROM orchestration_events
        WHERE aggregate_kind = 'thread'
          AND stream_id = ${threadId}
      `,
  });

  const append: OrchestrationEventStoreShape["append"] = (event) =>
    appendEventRow({
      eventId: event.eventId,
      aggregateKind: event.aggregateKind,
      streamId: event.aggregateId,
      type: event.type,
      causationEventId: event.causationEventId,
      correlationId: event.correlationId,
      actorKind: inferActorKind(event),
      occurredAt: event.occurredAt,
      commandId: event.commandId,
      payloadJson: event.payload,
      metadataJson: event.metadata,
    }).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "OrchestrationEventStore.append:insert",
          "OrchestrationEventStore.append:decodeRow",
        ),
      ),
      Effect.flatMap((row) =>
        decodeEvent(row).pipe(
          Effect.mapError(toPersistenceDecodeError("OrchestrationEventStore.append:rowToEvent")),
        ),
      ),
    );

  const readFromSequence: OrchestrationEventStoreShape["readFromSequence"] = (
    sequenceExclusive,
    limit = DEFAULT_READ_FROM_SEQUENCE_LIMIT,
  ) => {
    const normalizedLimit = Math.max(0, Math.floor(limit));
    if (normalizedLimit === 0) {
      return Stream.empty;
    }
    const readPage = (
      cursor: number,
      remaining: number,
    ): Stream.Stream<OrchestrationEvent, OrchestrationEventStoreError> =>
      Stream.fromEffect(
        readEventRowsFromSequence({
          sequenceExclusive: cursor,
          limit: Math.min(remaining, READ_PAGE_SIZE),
        }).pipe(
          Effect.mapError(
            toPersistenceSqlOrDecodeError(
              "OrchestrationEventStore.readFromSequence:query",
              "OrchestrationEventStore.readFromSequence:decodeRows",
            ),
          ),
          Effect.flatMap((rows) =>
            Effect.forEach(rows, (row) =>
              decodeEvent(row).pipe(
                Effect.mapError(
                  toPersistenceDecodeError("OrchestrationEventStore.readFromSequence:rowToEvent"),
                ),
              ),
            ),
          ),
        ),
      ).pipe(
        Stream.flatMap((events) => {
          if (events.length === 0) {
            return Stream.empty;
          }
          const nextRemaining = remaining - events.length;
          if (nextRemaining <= 0) {
            return Stream.fromIterable(events);
          }
          return Stream.concat(
            Stream.fromIterable(events),
            readPage(events[events.length - 1]!.sequence, nextRemaining),
          );
        }),
      );

    return readPage(sequenceExclusive, normalizedLimit);
  };

  const readThreadStream: OrchestrationEventStoreShape["readThreadStream"] = (
    threadId,
    streamVersionExclusive,
    limit = DEFAULT_READ_FROM_SEQUENCE_LIMIT,
  ) => {
    const normalizedLimit = Math.max(0, Math.floor(limit));
    if (normalizedLimit === 0) {
      return Stream.empty;
    }
    const readPage = (
      cursor: number,
      remaining: number,
    ): Stream.Stream<OrchestrationEvent, OrchestrationEventStoreError> =>
      Stream.fromEffect(
        readThreadRowsFromStreamVersion({
          threadId: ThreadId.make(threadId),
          streamVersionExclusive: cursor,
          limit: Math.min(remaining, READ_PAGE_SIZE),
        }).pipe(
          Effect.mapError(
            toPersistenceSqlOrDecodeError(
              "OrchestrationEventStore.readThreadStream:query",
              "OrchestrationEventStore.readThreadStream:decodeRows",
            ),
          ),
          Effect.flatMap((rows) =>
            Effect.forEach(rows, (row) =>
              decodeEvent(row).pipe(
                Effect.mapError(
                  toPersistenceDecodeError("OrchestrationEventStore.readThreadStream:rowToEvent"),
                ),
              ),
            ),
          ),
        ),
      ).pipe(
        Stream.flatMap((events) => {
          if (events.length === 0) {
            return Stream.empty;
          }
          const nextRemaining = remaining - events.length;
          if (nextRemaining <= 0) {
            return Stream.fromIterable(events);
          }
          const nextCursor = events[events.length - 1]?.streamVersion ?? cursor;
          return Stream.concat(Stream.fromIterable(events), readPage(nextCursor, nextRemaining));
        }),
      );

    return readPage(streamVersionExclusive, normalizedLimit);
  };

  const getLatestThreadStreamVersion: OrchestrationEventStoreShape["getLatestThreadStreamVersion"] =
    (threadId) =>
      getLatestThreadStreamVersionRow({ threadId: ThreadId.make(threadId) }).pipe(
        Effect.map((row) => row.latestStreamVersion),
        Effect.mapError(
          toPersistenceSqlOrDecodeError(
            "OrchestrationEventStore.getLatestThreadStreamVersion:query",
            "OrchestrationEventStore.getLatestThreadStreamVersion:decodeRow",
          ),
        ),
      );

  const readThreadAllRowsForFork = SqlSchema.findAll({
    Request: Schema.Struct({ threadId: ThreadId }),
    Result: OrchestrationEventPersistedRowSchema,
    execute: ({ threadId }) =>
      sql`
        SELECT
          sequence,
          stream_version AS "streamVersion",
          event_id AS "eventId",
          event_type AS "type",
          aggregate_kind AS "aggregateKind",
          stream_id AS "aggregateId",
          occurred_at AS "occurredAt",
          command_id AS "commandId",
          causation_event_id AS "causationEventId",
          correlation_id AS "correlationId",
          payload_json AS "payload",
          metadata_json AS "metadata"
        FROM orchestration_events
        WHERE aggregate_kind = 'thread'
          AND stream_id = ${threadId}
        ORDER BY stream_version ASC
      `,
  });

  const insertForkRewrittenRow = SqlSchema.void({
    Request: ForkRewrittenRowRequestSchema,
    execute: (request) =>
      sql`
        INSERT INTO orchestration_events (
          event_id,
          aggregate_kind,
          stream_id,
          stream_version,
          event_type,
          occurred_at,
          command_id,
          causation_event_id,
          correlation_id,
          actor_kind,
          payload_json,
          metadata_json
        )
        VALUES (
          ${request.eventId},
          ${"thread"},
          ${request.streamId},
          ${request.streamVersion},
          ${request.type},
          ${request.occurredAt},
          ${request.commandId},
          ${request.causationEventId},
          ${request.correlationId},
          ${request.actorKind},
          ${request.payloadJson},
          ${request.metadataJson}
        )
      `,
  });

  const insertForkTrailingEventRow = SqlSchema.findOne({
    Request: ForkRewrittenRowRequestSchema,
    Result: OrchestrationEventPersistedRowSchema,
    execute: (request) =>
      sql`
        INSERT INTO orchestration_events (
          event_id,
          aggregate_kind,
          stream_id,
          stream_version,
          event_type,
          occurred_at,
          command_id,
          causation_event_id,
          correlation_id,
          actor_kind,
          payload_json,
          metadata_json
        )
        VALUES (
          ${request.eventId},
          ${"thread"},
          ${request.streamId},
          ${request.streamVersion},
          ${request.type},
          ${request.occurredAt},
          ${request.commandId},
          ${request.causationEventId},
          ${request.correlationId},
          ${request.actorKind},
          ${request.payloadJson},
          ${request.metadataJson}
        )
        RETURNING
          sequence,
          stream_version AS "streamVersion",
          event_id AS "eventId",
          event_type AS "type",
          aggregate_kind AS "aggregateKind",
          stream_id AS "aggregateId",
          occurred_at AS "occurredAt",
          command_id AS "commandId",
          causation_event_id AS "causationEventId",
          correlation_id AS "correlationId",
          payload_json AS "payload",
          metadata_json AS "metadata"
      `,
  });

  const forkThreadEvents: OrchestrationEventStoreShape["forkThreadEvents"] = (
    input: ForkThreadEventsInput,
  ) =>
    Effect.gen(function* () {
      const targetThreadId = input.targetThreadId;
      const sourceThreadId = input.sourceThreadId;
      const overrides: ForkRewriteOverrides = {
        projectId: input.newProjectId,
        title: input.newTitle,
        branch: input.newBranch,
        worktreePath: input.newWorktreePath,
        hostDeviceId: input.newHostDeviceId ?? undefined,
      };

      const sourceRows = yield* readThreadAllRowsForFork({
        threadId: ThreadId.make(sourceThreadId),
      });
      const sourceEventsChunk = yield* Effect.forEach(sourceRows, (row) => decodeEvent(row));

      let highestSourceStreamVersion = 0;
      for (const event of sourceEventsChunk) {
        if (event.streamVersion !== undefined && event.streamVersion > highestSourceStreamVersion) {
          highestSourceStreamVersion = event.streamVersion;
        }
      }

      for (const sourceEvent of sourceEventsChunk) {
        const rewritten = rewriteEventForFork({
          event: sourceEvent,
          targetThreadId,
          sourceThreadId,
          forkCommandId: input.forkCommandId,
          overrides,
        });
        yield* insertForkRewrittenRow({
          eventId: rewritten.eventId as typeof EventId.Type,
          streamId: ThreadId.make(targetThreadId),
          streamVersion: rewritten.streamVersion,
          type: rewritten.type,
          occurredAt: rewritten.occurredAt,
          commandId: rewritten.commandId,
          causationEventId: rewritten.causationEventId,
          correlationId: rewritten.correlationId,
          actorKind: rewritten.actorKind,
          payloadJson: rewritten.payloadJson,
          metadataJson: rewritten.metadataJson,
        });
      }

      const forkedEventId = crypto.randomUUID() as typeof EventId.Type;
      const forkedStreamVersion = highestSourceStreamVersion + 1;
      const forkedRow = yield* insertForkTrailingEventRow({
        eventId: forkedEventId,
        streamId: ThreadId.make(targetThreadId),
        streamVersion: forkedStreamVersion,
        type: "thread.forked",
        occurredAt: input.forkOccurredAt,
        commandId: input.forkCommandId,
        causationEventId: null,
        correlationId: input.forkCommandId,
        actorKind: "client",
        payloadJson: {
          threadId: targetThreadId,
          sourceThreadId,
          parentDeviceId: input.parentDeviceId,
          forkedFromStreamVersion: highestSourceStreamVersion,
          forkedAt: input.forkOccurredAt,
        },
        metadataJson: {
          ingestedAt: input.forkOccurredAt,
        },
      });

      const forkedEvent = yield* decodeEvent(forkedRow).pipe(
        Effect.mapError(
          toPersistenceDecodeError("OrchestrationEventStore.forkThreadEvents:rowToEvent"),
        ),
      );

      return {
        copiedEventCount: sourceEventsChunk.length,
        forkedEvent,
        highestSourceStreamVersion,
      } satisfies ForkThreadEventsResult;
    }).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "OrchestrationEventStore.forkThreadEvents:transaction",
          "OrchestrationEventStore.forkThreadEvents:decodeRow",
        ),
      ),
    );

  const readThreadStreamAll: OrchestrationEventStoreShape["readThreadStreamAll"] = (threadId) =>
    Stream.unwrap(
      readThreadAllRowsForFork({ threadId: ThreadId.make(threadId) }).pipe(
        Effect.mapError(
          toPersistenceSqlOrDecodeError(
            "OrchestrationEventStore.readThreadStreamAll:query",
            "OrchestrationEventStore.readThreadStreamAll:decodeRows",
          ),
        ),
        Effect.flatMap((rows) =>
          Effect.forEach(rows, (row) =>
            decodeEvent(row).pipe(
              Effect.mapError(
                toPersistenceDecodeError("OrchestrationEventStore.readThreadStreamAll:rowToEvent"),
              ),
            ),
          ),
        ),
        Effect.map((events) => Stream.fromIterable(events)),
      ),
    );

  return {
    append,
    readFromSequence,
    readThreadStream,
    readThreadStreamAll,
    getLatestThreadStreamVersion,
    readAll: () => readFromSequence(0, Number.MAX_SAFE_INTEGER),
    forkThreadEvents,
  } satisfies OrchestrationEventStoreShape;
});

export const OrchestrationEventStoreLive = Layer.effect(OrchestrationEventStore, makeEventStore);
