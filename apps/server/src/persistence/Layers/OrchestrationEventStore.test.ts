import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  EventId,
  MessageId,
  ProjectId,
  ThreadId,
} from "@v3tools/contracts";
import { assert, it } from "@effect/vitest";
import { Effect, Layer, Schema, Stream } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { PersistenceDecodeError } from "../Errors.ts";
import { OrchestrationEventStore } from "../Services/OrchestrationEventStore.ts";
import { OrchestrationEventStoreLive } from "./OrchestrationEventStore.ts";
import { SqlitePersistenceMemory } from "./Sqlite.ts";

const layer = it.layer(
  OrchestrationEventStoreLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
);

layer("OrchestrationEventStore", (it) => {
  it.effect("stores json columns as strings and replays decoded events", () =>
    Effect.gen(function* () {
      const eventStore = yield* OrchestrationEventStore;
      const sql = yield* SqlClient.SqlClient;
      const now = new Date().toISOString();

      const appended = yield* eventStore.append({
        type: "project.created",
        eventId: EventId.make("evt-store-roundtrip"),
        aggregateKind: "project",
        aggregateId: ProjectId.make("project-roundtrip"),
        occurredAt: now,
        commandId: CommandId.make("cmd-store-roundtrip"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-store-roundtrip"),
        metadata: {
          adapterKey: "codex",
        },
        payload: {
          projectId: ProjectId.make("project-roundtrip"),
          title: "Roundtrip Project",
          workspaceRoot: "/tmp/project-roundtrip",
          defaultModelSelection: null,
          scripts: [],
          createdAt: now,
          updatedAt: now,
        },
      });

      const storedRows = yield* sql<{
        readonly payloadJson: string;
        readonly metadataJson: string;
      }>`
        SELECT
          payload_json AS "payloadJson",
          metadata_json AS "metadataJson"
        FROM orchestration_events
        WHERE event_id = ${appended.eventId}
      `;
      assert.equal(storedRows.length, 1);
      assert.equal(typeof storedRows[0]?.payloadJson, "string");
      assert.equal(typeof storedRows[0]?.metadataJson, "string");

      const replayed = yield* Stream.runCollect(eventStore.readFromSequence(0, 10)).pipe(
        Effect.map((chunk) => Array.from(chunk)),
      );
      assert.equal(replayed.length, 1);
      assert.equal(replayed[0]?.type, "project.created");
      assert.equal(replayed[0]?.metadata.adapterKey, "codex");
    }),
  );

  it.effect("fails with PersistenceDecodeError when stored json is invalid", () =>
    Effect.gen(function* () {
      const eventStore = yield* OrchestrationEventStore;
      const sql = yield* SqlClient.SqlClient;
      const now = new Date().toISOString();

      yield* sql`
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
          ${EventId.make("evt-store-invalid-json")},
          ${"project"},
          ${ProjectId.make("project-invalid-json")},
          ${0},
          ${"project.created"},
          ${now},
          ${CommandId.make("cmd-store-invalid-json")},
          ${null},
          ${null},
          ${"server"},
          ${"{"},
          ${"{}"}
        )
      `;

      const replayResult = yield* Effect.result(
        Stream.runCollect(eventStore.readFromSequence(0, 10)),
      );
      assert.equal(replayResult._tag, "Failure");
      if (replayResult._tag === "Failure") {
        assert.ok(Schema.is(PersistenceDecodeError)(replayResult.failure));
        assert.ok(
          replayResult.failure.operation.includes(
            "OrchestrationEventStore.readFromSequence:decodeRows",
          ),
        );
      }
    }),
  );

  it.effect("forkThreadEvents copies the source stream and appends thread.forked", () =>
    Effect.gen(function* () {
      const eventStore = yield* OrchestrationEventStore;
      const now = new Date().toISOString();
      const projectId = ProjectId.make("project-fork");
      const sourceThreadId = ThreadId.make("thread-fork-source");
      const targetThreadId = ThreadId.make("thread-fork-target");

      yield* eventStore.append({
        type: "thread.created",
        eventId: EventId.make("evt-fork-source-created"),
        aggregateKind: "thread",
        aggregateId: sourceThreadId,
        occurredAt: now,
        commandId: CommandId.make("cmd-fork-source-created"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-fork-source-created"),
        metadata: {},
        payload: {
          threadId: sourceThreadId,
          projectId,
          title: "Source thread",
          modelSelection: { provider: "codex", model: "gpt-5-codex" },
          runtimeMode: "approval-required",
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          branch: null,
          worktreePath: null,
          createdAt: now,
          updatedAt: now,
        },
      });

      yield* eventStore.append({
        type: "thread.message-sent",
        eventId: EventId.make("evt-fork-source-msg"),
        aggregateKind: "thread",
        aggregateId: sourceThreadId,
        occurredAt: now,
        commandId: CommandId.make("cmd-fork-source-msg"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-fork-source-msg"),
        metadata: {},
        payload: {
          threadId: sourceThreadId,
          messageId: MessageId.make("msg-fork-source-1"),
          role: "user",
          text: "hello",
          turnId: null,
          streaming: false,
          createdAt: now,
          updatedAt: now,
        },
      });

      const result = yield* eventStore.forkThreadEvents({
        sourceThreadId,
        targetThreadId,
        forkOccurredAt: now,
        forkCommandId: CommandId.make("cmd-fork-roundtrip"),
        parentDeviceId: null,
        newTitle: "Forked thread",
      });

      assert.equal(result.copiedEventCount, 2);
      assert.equal(result.highestSourceStreamVersion, 1);
      assert.equal(result.forkedEvent.type, "thread.forked");
      assert.equal(result.forkedEvent.streamVersion, 2);

      // readThreadStream uses an EXCLUSIVE cursor, so passing 0 skips the
      // event at stream_version 0. Verify the events we can see (versions 1
      // and 2): the copied thread.message-sent and the trailing thread.forked.
      const forkedStream = yield* Stream.runCollect(
        eventStore.readThreadStream(targetThreadId, 0, 100),
      ).pipe(Effect.map((chunk) => Array.from(chunk)));
      assert.equal(forkedStream.length, 2);
      assert.equal(forkedStream[0]?.type, "thread.message-sent");
      assert.equal((forkedStream[0]?.payload as { threadId: string } | undefined)?.threadId, targetThreadId);
      assert.equal(forkedStream[1]?.type, "thread.forked");
      assert.equal(
        (forkedStream[1]?.payload as { sourceThreadId: string } | undefined)?.sourceThreadId,
        sourceThreadId,
      );

      // Source stream is untouched. readThreadStream with cursor 0 returns
      // events at stream_version 1+, so just the user message survives the
      // exclusive-cursor.
      const sourceStream = yield* Stream.runCollect(
        eventStore.readThreadStream(sourceThreadId, 0, 100),
      ).pipe(Effect.map((chunk) => Array.from(chunk)));
      assert.equal(sourceStream.length, 1);
      assert.equal(sourceStream[0]?.type, "thread.message-sent");
    }),
  );
});
