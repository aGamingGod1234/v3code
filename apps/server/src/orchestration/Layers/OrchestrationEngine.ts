import type {
  ChatImportFormat,
  ModelSelection,
  OrchestrationEvent,
  OrchestrationMessageRole,
  OrchestrationReadModel,
  ParsedChat,
  ProjectId,
  ThreadId,
} from "@v3tools/contracts";
import {
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  MessageId,
  OrchestrationCommand,
} from "@v3tools/contracts";
import {
  Cause,
  Deferred,
  Duration,
  Effect,
  Exit,
  Layer,
  Metric,
  Option,
  PubSub,
  Queue,
  Schema,
  Stream,
} from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import {
  metricAttributes,
  orchestrationCommandAckDuration,
  orchestrationCommandsTotal,
  orchestrationCommandDuration,
} from "../../observability/Metrics.ts";
import { toPersistenceSqlError } from "../../persistence/Errors.ts";
import { OrchestrationEventStore } from "../../persistence/Services/OrchestrationEventStore.ts";
import { OrchestrationCommandReceiptRepository } from "../../persistence/Services/OrchestrationCommandReceipts.ts";
import {
  OrchestrationCommandInvariantError,
  OrchestrationCommandPreviouslyRejectedError,
  type OrchestrationDispatchError,
} from "../Errors.ts";
import {
  decideOrchestrationCommand,
  validateChatForkCommand,
  validateChatImportCommand,
} from "../decider.ts";
import { createEmptyReadModel, projectEvent } from "../projector.ts";
import { OrchestrationProjectionPipeline } from "../Services/ProjectionPipeline.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import {
  OrchestrationEngineService,
  type OrchestrationEngineShape,
} from "../Services/OrchestrationEngine.ts";

interface CommandEnvelope {
  command: OrchestrationCommand;
  result: Deferred.Deferred<{ sequence: number }, OrchestrationDispatchError>;
  startedAtMs: number;
}

function commandToAggregateRef(command: OrchestrationCommand): {
  readonly aggregateKind: "project" | "thread";
  readonly aggregateId: ProjectId | ThreadId;
} {
  switch (command.type) {
    case "project.create":
    case "project.meta.update":
    case "project.delete":
      return {
        aggregateKind: "project",
        aggregateId: command.projectId,
      };
    case "chat.fork":
    case "chat.import":
      return {
        aggregateKind: "thread",
        aggregateId: command.targetThreadId,
      };
    default:
      return {
        aggregateKind: "thread",
        aggregateId: command.threadId,
      };
  }
}

function defaultModelForImportedChat(parsed: ParsedChat): ModelSelection {
  // Imported transcripts only commit to a *format* (codex/claude/anthropic-console).
  // The user can change models after import — these defaults exist purely so the
  // thread.created payload satisfies the ModelSelection schema.
  switch (parsed.format) {
    case "codex":
      return { provider: "codex", model: "gpt-5-codex" };
    case "claude":
    case "anthropic-console":
      return { provider: "claudeAgent", model: "claude-opus-4-7" };
  }
}

function resolveImportedTitle(
  command: Extract<OrchestrationCommand, { type: "chat.import" }>,
  parsed: ParsedChat,
): string {
  if (command.targetTitle !== undefined) return command.targetTitle;
  if (parsed.title !== null) return parsed.title;
  const fallbacks: Record<ChatImportFormat, string> = {
    codex: "Imported chat (Codex)",
    claude: "Imported chat (Claude Code)",
    "anthropic-console": "Imported chat (Anthropic Console)",
  };
  return fallbacks[parsed.format];
}

function mapImportedRole(role: ParsedChat["messages"][number]["role"]): OrchestrationMessageRole {
  // ParsedMessageRole has "tool" but OrchestrationMessageRole does not. Tool
  // messages are folded into the assistant role with an inline `[tool: <name>]`
  // prefix on the text, mirroring how a real assistant turn surfaces tool
  // results to the user.
  return role === "tool" ? "assistant" : role;
}

function renderImportedMessageText(message: ParsedChat["messages"][number]): string {
  if (message.role === "tool" && message.toolName !== null) {
    return `[tool: ${message.toolName}]\n${message.content}`;
  }
  return message.content;
}

const makeOrchestrationEngine = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const eventStore = yield* OrchestrationEventStore;
  const commandReceiptRepository = yield* OrchestrationCommandReceiptRepository;
  const projectionPipeline = yield* OrchestrationProjectionPipeline;
  const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;

  let readModel = createEmptyReadModel(new Date().toISOString());

  const commandQueue = yield* Queue.unbounded<CommandEnvelope>();
  const eventPubSub = yield* PubSub.unbounded<OrchestrationEvent>();

  interface CommittedCommandResult {
    readonly committedEvents: ReadonlyArray<OrchestrationEvent>;
    readonly lastSequence: number;
    readonly nextReadModel: OrchestrationReadModel;
  }

  const processStandardEnvelope = (command: OrchestrationCommand) =>
    Effect.gen(function* () {
      const eventBase = yield* decideOrchestrationCommand({
        command,
        readModel,
      });
      const eventBases = Array.isArray(eventBase) ? eventBase : [eventBase];
      const result = yield* sql
        .withTransaction(
          Effect.gen(function* () {
            const committedEvents: OrchestrationEvent[] = [];
            let nextReadModel = readModel;

            for (const nextEvent of eventBases) {
              const savedEvent = yield* eventStore.append(nextEvent);
              nextReadModel = yield* projectEvent(nextReadModel, savedEvent);
              yield* projectionPipeline.projectEvent(savedEvent);
              committedEvents.push(savedEvent);
            }

            const lastSavedEvent = committedEvents.at(-1) ?? null;
            if (lastSavedEvent === null) {
              return yield* new OrchestrationCommandInvariantError({
                commandType: command.type,
                detail: "Command produced no events.",
              });
            }

            yield* commandReceiptRepository.upsert({
              commandId: command.commandId,
              aggregateKind: lastSavedEvent.aggregateKind,
              aggregateId: lastSavedEvent.aggregateId,
              acceptedAt: lastSavedEvent.occurredAt,
              resultSequence: lastSavedEvent.sequence,
              status: "accepted",
              error: null,
            });

            return {
              committedEvents,
              lastSequence: lastSavedEvent.sequence,
              nextReadModel,
            } satisfies CommittedCommandResult;
          }),
        )
        .pipe(
          Effect.catchTag("SqlError", (sqlError) =>
            Effect.fail(
              toPersistenceSqlError("OrchestrationEngine.processEnvelope:transaction")(sqlError),
            ),
          ),
        );
      return result;
    });

  const processForkEnvelope = (command: Extract<OrchestrationCommand, { type: "chat.fork" }>) =>
    Effect.gen(function* () {
      // Validate against the live in-memory read model before opening the
      // transaction so invariant errors don't trigger SQL rollback noise.
      const validation = yield* validateChatForkCommand({ command, readModel });

      const result = yield* sql
        .withTransaction(
          Effect.gen(function* () {
            // Re-read the source from the projection store too — the in-memory
            // read model snapshot is authoritative for invariant checks but
            // doesn't expose the per-projection pendingApprovalCount counter
            // that the projection pipeline maintains.
            const projectedSource = yield* projectionSnapshotQuery.getThreadShellById(
              command.sourceThreadId,
            );
            if (Option.isSome(projectedSource) && projectedSource.value.hasPendingApprovals) {
              return yield* new OrchestrationCommandInvariantError({
                commandType: command.type,
                detail: `Source thread '${command.sourceThreadId}' has unresolved approval requests and cannot be forked. Resolve them first.`,
              });
            }

            const targetProjectId =
              command.targetProjectId ?? (validation.sourceThread.projectId as ProjectId);
            const newHostDeviceId =
              command.targetDeviceId !== undefined ? command.targetDeviceId : undefined;
            const forkResult = yield* eventStore.forkThreadEvents({
              sourceThreadId: command.sourceThreadId,
              targetThreadId: command.targetThreadId,
              ...(targetProjectId !== validation.sourceThread.projectId
                ? { newProjectId: targetProjectId }
                : {}),
              ...(command.targetTitle !== undefined ? { newTitle: command.targetTitle } : {}),
              ...(command.targetBranch !== undefined ? { newBranch: command.targetBranch } : {}),
              ...(command.targetWorktreePath !== undefined
                ? { newWorktreePath: command.targetWorktreePath }
                : {}),
              ...(newHostDeviceId !== undefined ? { newHostDeviceId } : {}),
              forkOccurredAt: command.createdAt,
              forkCommandId: command.commandId,
              parentDeviceId: validation.sourceThread.hostDeviceId as never,
            });

            // Stream the new target thread's events back through the projection
            // pipeline + in-memory read-model so all consumers (sidebar, mesh
            // subscribers, etc.) see the forked chat in the same shape they'd
            // see a freshly-created one.
            const newThreadEvents = yield* Stream.runCollect(
              eventStore.readThreadStream(command.targetThreadId, 0, Number.MAX_SAFE_INTEGER),
            ).pipe(Effect.map((chunk) => Array.from(chunk)));

            let nextReadModel = readModel;
            for (const event of newThreadEvents) {
              nextReadModel = yield* projectEvent(nextReadModel, event);
              yield* projectionPipeline.projectEvent(event);
            }

            const lastEvent = newThreadEvents.at(-1) ?? forkResult.forkedEvent;

            yield* commandReceiptRepository.upsert({
              commandId: command.commandId,
              aggregateKind: "thread",
              aggregateId: command.targetThreadId,
              acceptedAt: command.createdAt,
              resultSequence: lastEvent.sequence,
              status: "accepted",
              error: null,
            });

            return {
              committedEvents: newThreadEvents,
              lastSequence: lastEvent.sequence,
              nextReadModel,
            } satisfies CommittedCommandResult;
          }),
        )
        .pipe(
          Effect.catchTag("SqlError", (sqlError) =>
            Effect.fail(
              toPersistenceSqlError("OrchestrationEngine.processForkEnvelope:transaction")(
                sqlError,
              ),
            ),
          ),
        );
      return result;
    });

  const processImportEnvelope = (
    command: Extract<OrchestrationCommand, { type: "chat.import" }>,
  ) =>
    Effect.gen(function* () {
      // Validate against the live in-memory read model before opening the
      // transaction so invariant errors don't trigger SQL rollback noise.
      const validation = yield* validateChatImportCommand({ command, readModel });

      const result = yield* sql
        .withTransaction(
          Effect.gen(function* () {
            const importedAt = command.createdAt;
            const baseMetadata: OrchestrationEvent["metadata"] = {
              importedFromFormat: command.parsed.format,
            };

            const threadCreatedEvent: Omit<OrchestrationEvent, "sequence"> = {
              eventId: crypto.randomUUID() as OrchestrationEvent["eventId"],
              aggregateKind: "thread",
              aggregateId: command.targetThreadId,
              type: "thread.created",
              occurredAt: importedAt,
              commandId: command.commandId,
              causationEventId: null,
              correlationId: command.commandId,
              metadata: baseMetadata,
              payload: {
                threadId: command.targetThreadId,
                projectId: validation.targetProjectId,
                title: resolveImportedTitle(command, command.parsed),
                modelSelection: defaultModelForImportedChat(command.parsed),
                runtimeMode: DEFAULT_RUNTIME_MODE,
                interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
                branch: null,
                worktreePath: null,
                createdAt: importedAt,
                updatedAt: importedAt,
                ...(command.targetDeviceId !== undefined
                  ? { hostDeviceId: command.targetDeviceId }
                  : {}),
              },
            };
            const savedThreadCreated = yield* eventStore.append(threadCreatedEvent);

            const savedMessageEvents: OrchestrationEvent[] = [];
            for (const parsedMessage of command.parsed.messages) {
              const messageId = MessageId.make(crypto.randomUUID());
              const messageEvent: Omit<OrchestrationEvent, "sequence"> = {
                eventId: crypto.randomUUID() as OrchestrationEvent["eventId"],
                aggregateKind: "thread",
                aggregateId: command.targetThreadId,
                type: "thread.message-sent",
                occurredAt: parsedMessage.timestamp ?? importedAt,
                commandId: command.commandId,
                causationEventId: savedThreadCreated.eventId,
                correlationId: command.commandId,
                metadata: baseMetadata,
                payload: {
                  threadId: command.targetThreadId,
                  messageId,
                  role: mapImportedRole(parsedMessage.role),
                  text: renderImportedMessageText(parsedMessage),
                  attachments: [],
                  turnId: null,
                  streaming: false,
                  createdAt: parsedMessage.timestamp ?? importedAt,
                  updatedAt: parsedMessage.timestamp ?? importedAt,
                },
              };
              const savedMessage = yield* eventStore.append(messageEvent);
              savedMessageEvents.push(savedMessage);
            }

            const allEvents = [savedThreadCreated, ...savedMessageEvents];

            // Project the new thread's events into the in-memory read model
            // and projection pipeline so all consumers (sidebar, mesh
            // subscribers) see the imported chat in the same shape they'd
            // see a freshly-created one.
            let nextReadModel = readModel;
            for (const event of allEvents) {
              nextReadModel = yield* projectEvent(nextReadModel, event);
              yield* projectionPipeline.projectEvent(event);
            }

            const lastEvent = allEvents.at(-1) ?? savedThreadCreated;

            yield* commandReceiptRepository.upsert({
              commandId: command.commandId,
              aggregateKind: "thread",
              aggregateId: command.targetThreadId,
              acceptedAt: importedAt,
              resultSequence: lastEvent.sequence,
              status: "accepted",
              error: null,
            });

            return {
              committedEvents: allEvents,
              lastSequence: lastEvent.sequence,
              nextReadModel,
            } satisfies CommittedCommandResult;
          }),
        )
        .pipe(
          Effect.catchTag("SqlError", (sqlError) =>
            Effect.fail(
              toPersistenceSqlError("OrchestrationEngine.processImportEnvelope:transaction")(
                sqlError,
              ),
            ),
          ),
        );
      return result;
    });

  const processEnvelope = (envelope: CommandEnvelope): Effect.Effect<void> => {
    const dispatchStartSequence = readModel.snapshotSequence;
    const processingStartedAtMs = Date.now();
    const aggregateRef = commandToAggregateRef(envelope.command);
    const baseMetricAttributes = {
      commandType: envelope.command.type,
      aggregateKind: aggregateRef.aggregateKind,
    } as const;
    const reconcileReadModelAfterDispatchFailure = Effect.gen(function* () {
      const persistedEvents = yield* Stream.runCollect(
        eventStore.readFromSequence(dispatchStartSequence),
      ).pipe(Effect.map((chunk): OrchestrationEvent[] => Array.from(chunk)));
      if (persistedEvents.length === 0) {
        return;
      }

      let nextReadModel = readModel;
      for (const persistedEvent of persistedEvents) {
        nextReadModel = yield* projectEvent(nextReadModel, persistedEvent);
      }
      readModel = nextReadModel;

      for (const persistedEvent of persistedEvents) {
        yield* PubSub.publish(eventPubSub, persistedEvent);
      }
    });

    return Effect.exit(
      Effect.gen(function* () {
        yield* Effect.annotateCurrentSpan({
          "orchestration.command_id": envelope.command.commandId,
          "orchestration.command_type": envelope.command.type,
          "orchestration.aggregate_kind": aggregateRef.aggregateKind,
          "orchestration.aggregate_id": aggregateRef.aggregateId,
        });

        const existingReceipt = yield* commandReceiptRepository.getByCommandId({
          commandId: envelope.command.commandId,
        });
        if (Option.isSome(existingReceipt)) {
          if (existingReceipt.value.status === "accepted") {
            return {
              sequence: existingReceipt.value.resultSequence,
            };
          }
          return yield* new OrchestrationCommandPreviouslyRejectedError({
            commandId: envelope.command.commandId,
            detail: existingReceipt.value.error ?? "Previously rejected.",
          });
        }

        const committedCommand =
          envelope.command.type === "chat.fork"
            ? yield* processForkEnvelope(envelope.command)
            : envelope.command.type === "chat.import"
              ? yield* processImportEnvelope(envelope.command)
              : yield* processStandardEnvelope(envelope.command);

        readModel = committedCommand.nextReadModel;
        for (const [index, event] of committedCommand.committedEvents.entries()) {
          yield* PubSub.publish(eventPubSub, event);
          if (index === 0) {
            yield* Metric.update(
              Metric.withAttributes(
                orchestrationCommandAckDuration,
                metricAttributes({
                  ...baseMetricAttributes,
                  ackEventType: event.type,
                }),
              ),
              Duration.millis(Math.max(0, Date.now() - envelope.startedAtMs)),
            );
          }
        }
        return { sequence: committedCommand.lastSequence };
      }).pipe(Effect.withSpan(`orchestration.command.${envelope.command.type}`)),
    ).pipe(
      Effect.flatMap((exit) =>
        Effect.gen(function* () {
          const outcome = Exit.isSuccess(exit)
            ? "success"
            : Cause.hasInterruptsOnly(exit.cause)
              ? "interrupt"
              : "failure";
          yield* Metric.update(
            Metric.withAttributes(
              orchestrationCommandDuration,
              metricAttributes(baseMetricAttributes),
            ),
            Duration.millis(Math.max(0, Date.now() - processingStartedAtMs)),
          );
          yield* Metric.update(
            Metric.withAttributes(
              orchestrationCommandsTotal,
              metricAttributes({
                ...baseMetricAttributes,
                outcome,
              }),
            ),
            1,
          );

          if (Exit.isSuccess(exit)) {
            yield* Deferred.succeed(envelope.result, exit.value);
            return;
          }

          const error = Cause.squash(exit.cause) as OrchestrationDispatchError;
          if (!Schema.is(OrchestrationCommandPreviouslyRejectedError)(error)) {
            yield* reconcileReadModelAfterDispatchFailure.pipe(
              Effect.catch(() =>
                Effect.logWarning(
                  "failed to reconcile orchestration read model after dispatch failure",
                ).pipe(
                  Effect.annotateLogs({
                    commandId: envelope.command.commandId,
                    snapshotSequence: readModel.snapshotSequence,
                  }),
                ),
              ),
            );

            if (Schema.is(OrchestrationCommandInvariantError)(error)) {
              yield* commandReceiptRepository
                .upsert({
                  commandId: envelope.command.commandId,
                  aggregateKind: aggregateRef.aggregateKind,
                  aggregateId: aggregateRef.aggregateId,
                  acceptedAt: new Date().toISOString(),
                  resultSequence: readModel.snapshotSequence,
                  status: "rejected",
                  error: error.message,
                })
                .pipe(Effect.catch(() => Effect.void));
            }
          }

          yield* Deferred.fail(envelope.result, error);
        }),
      ),
    );
  };

  yield* projectionPipeline.bootstrap;
  readModel = yield* projectionSnapshotQuery.getSnapshot();

  const worker = Effect.forever(Queue.take(commandQueue).pipe(Effect.flatMap(processEnvelope)));
  yield* Effect.forkScoped(worker);
  yield* Effect.logDebug("orchestration engine started").pipe(
    Effect.annotateLogs({ sequence: readModel.snapshotSequence }),
  );

  const getReadModel: OrchestrationEngineShape["getReadModel"] = () =>
    Effect.sync((): OrchestrationReadModel => readModel);

  const readEvents: OrchestrationEngineShape["readEvents"] = (fromSequenceExclusive) =>
    eventStore.readFromSequence(fromSequenceExclusive);

  const dispatch: OrchestrationEngineShape["dispatch"] = (command) =>
    Effect.gen(function* () {
      const result = yield* Deferred.make<{ sequence: number }, OrchestrationDispatchError>();
      yield* Queue.offer(commandQueue, { command, result, startedAtMs: Date.now() });
      return yield* Deferred.await(result);
    });

  return {
    getReadModel,
    readEvents,
    dispatch,
    // Each access creates a fresh PubSub subscription so that multiple
    // consumers (wsServer, ProviderRuntimeIngestion, CheckpointReactor, etc.)
    // each independently receive all domain events.
    get streamDomainEvents(): OrchestrationEngineShape["streamDomainEvents"] {
      return Stream.fromPubSub(eventPubSub);
    },
  } satisfies OrchestrationEngineShape;
});

export const OrchestrationEngineLive = Layer.effect(
  OrchestrationEngineService,
  makeOrchestrationEngine,
);
