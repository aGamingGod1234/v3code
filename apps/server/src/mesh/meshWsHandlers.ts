import {
  type AuthSessionId,
  type ChatForkCommand,
  type ChatImportCommand,
  type ClientThreadTurnStartCommand,
  DeviceId,
  MESH_WS_METHODS,
  MeshRpcError,
  type PresenceUpdatePayload,
  ProjectId,
  ThreadId,
  type UserId,
} from "@v3tools/contracts";
import { Effect, Option, Schema, Stream } from "effect";

import { readInstalledSnapshot, resolveReferences } from "../chatImport/InstalledRegistry.ts";

import { OrchestrationEngineService } from "../orchestration/Services/OrchestrationEngine.ts";

import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import { OrchestrationEventStore } from "../persistence/Services/OrchestrationEventStore.ts";
import {
  MeshEventIngestion,
  type MeshEventIngestionShape,
} from "../orchestration/Services/MeshEventIngestion.ts";
import { DeviceApprovalService } from "../identity/Services/DeviceApprovalService.ts";
import { DeviceRepository } from "../identity/Services/DeviceRepository.ts";
import { ChatSubscriptionManager } from "./Services/ChatSubscriptionManager.ts";
import { DeviceRegistry } from "./Services/DeviceRegistry.ts";
import { MeshPublisher } from "./Services/MeshPublisher.ts";
import { PresenceBroadcaster } from "./Services/PresenceBroadcaster.ts";
import { PromptRouter } from "./Services/PromptRouter.ts";
import { observeRpcEffect, observeRpcStreamEffect } from "../observability/RpcInstrumentation.ts";

interface MeshHandlerContext {
  readonly sessionId: AuthSessionId;
  readonly userId: UserId | null;
  readonly deviceId: DeviceId | null;
}

function toMeshRpcError(message: string, cause?: unknown) {
  return new MeshRpcError({
    message,
    ...(cause !== undefined ? { cause } : {}),
  });
}

function withPromptRouteContext(
  command: ClientThreadTurnStartCommand,
  sourceDeviceId: DeviceId | null,
  targetHostDeviceId: DeviceId | null,
): ClientThreadTurnStartCommand {
  const commandWithSourceDevice =
    sourceDeviceId !== null && command.sourceDeviceId === undefined
      ? {
          ...command,
          sourceDeviceId,
        }
      : command;

  if (
    targetHostDeviceId === null ||
    !commandWithSourceDevice.bootstrap?.createThread ||
    commandWithSourceDevice.bootstrap.createThread.hostDeviceId !== undefined
  ) {
    return commandWithSourceDevice;
  }

  return {
    ...commandWithSourceDevice,
    bootstrap: {
      ...commandWithSourceDevice.bootstrap,
      createThread: {
        ...commandWithSourceDevice.bootstrap.createThread,
        hostDeviceId: targetHostDeviceId,
      },
    },
  };
}

export const makeMeshWsHandlers = (context: MeshHandlerContext) =>
  Effect.gen(function* () {
    const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
    const chatSubscriptions = yield* ChatSubscriptionManager;
    const meshEventIngestion: MeshEventIngestionShape = yield* MeshEventIngestion;
    const devices = yield* DeviceRepository;
    const approvals = yield* DeviceApprovalService;
    const deviceRegistry = yield* DeviceRegistry;
    const presence = yield* PresenceBroadcaster;
    const promptRouter = yield* PromptRouter;
    const orchestrationEngine = yield* OrchestrationEngineService;
    const eventStore = yield* OrchestrationEventStore;
    yield* MeshPublisher;

    const requireSignedInMeshUser = () =>
      context.userId !== null
        ? Effect.succeed(context.userId)
        : Effect.fail(toMeshRpcError("Mesh presence is only available for V3 signed-in sessions."));

    const resolvePromptHostDeviceId = (command: ClientThreadTurnStartCommand) =>
      command.bootstrap?.createThread
        ? Effect.succeed(command.bootstrap.createThread.hostDeviceId ?? context.deviceId)
        : projectionSnapshotQuery.getThreadShellById(command.threadId).pipe(
            Effect.mapError((cause) =>
              toMeshRpcError(
                `Failed to resolve prompt host for thread ${command.threadId}.`,
                cause,
              ),
            ),
            Effect.flatMap((thread) =>
              Option.isSome(thread)
                ? Effect.succeed(thread.value.hostDeviceId ?? context.deviceId)
                : Effect.fail(
                    toMeshRpcError(`Thread ${command.threadId} was not found for prompt routing.`),
                  ),
            ),
          );

    return {
      [MESH_WS_METHODS.subscribeChat]: (input: {
        threadId: string;
        fromStreamVersionExclusive: number;
      }) =>
        observeRpcStreamEffect(
          MESH_WS_METHODS.subscribeChat,
          Effect.gen(function* () {
            const snapshot = yield* projectionSnapshotQuery
              .getThreadMeshSnapshot(input.threadId as never)
              .pipe(
                Effect.mapError((cause) =>
                  toMeshRpcError(
                    `Failed to load mesh snapshot for thread ${input.threadId}.`,
                    cause,
                  ),
                ),
              );

            if (Option.isNone(snapshot)) {
              return yield* toMeshRpcError(`Thread ${input.threadId} was not found for mesh sync.`);
            }

            const liveStream = chatSubscriptions
              .subscribeThread({
                threadId: input.threadId as never,
                fromStreamVersionExclusive: Math.max(
                  input.fromStreamVersionExclusive,
                  snapshot.value.lastStreamVersion,
                ),
                subscriberDeviceId: context.deviceId,
              })
              .pipe(
                Stream.mapError((cause) =>
                  toMeshRpcError("Failed to stream mesh chat events.", cause),
                ),
                Stream.map((event) => ({
                  kind: "event" as const,
                  event,
                })),
              );

            return Stream.concat(
              Stream.make({
                kind: "snapshot" as const,
                snapshot: {
                  snapshotSequence: snapshot.value.snapshotSequence,
                  thread: snapshot.value.thread,
                },
                latestStreamVersion: snapshot.value.lastStreamVersion,
              }),
              liveStream,
            );
          }).pipe(
            Effect.mapError((cause) =>
              Schema.is(MeshRpcError)(cause)
                ? cause
                : toMeshRpcError("Failed to subscribe to mesh chat.", cause),
            ),
          ),
          { "rpc.aggregate": "mesh" },
        ),
      [MESH_WS_METHODS.publishEvent]: (input: {
        command: Parameters<MeshEventIngestionShape["publishCommand"]>[0]["command"];
      }) =>
        observeRpcEffect(
          MESH_WS_METHODS.publishEvent,
          meshEventIngestion
            .publishCommand({
              command: input.command,
              deviceId: context.deviceId,
            })
            .pipe(
              Effect.mapError((cause) => toMeshRpcError("Failed to publish mesh command.", cause)),
            ),
          { "rpc.aggregate": "mesh" },
        ),
      [MESH_WS_METHODS.sendPrompt]: (input: { command: ClientThreadTurnStartCommand }) =>
        observeRpcEffect(
          MESH_WS_METHODS.sendPrompt,
          Effect.gen(function* () {
            const targetHostDeviceId = yield* resolvePromptHostDeviceId(input.command);
            const routedCommand = withPromptRouteContext(
              input.command,
              context.deviceId,
              targetHostDeviceId,
            );

            if (
              context.userId === null ||
              context.deviceId === null ||
              targetHostDeviceId === null ||
              targetHostDeviceId === context.deviceId
            ) {
              return yield* meshEventIngestion
                .publishCommand({
                  command: routedCommand,
                  deviceId: context.deviceId,
                })
                .pipe(
                  Effect.mapError((cause) =>
                    toMeshRpcError("Failed to publish local prompt command.", cause),
                  ),
                );
            }

            const hostDevice = yield* devices
              .get({
                id: targetHostDeviceId,
                userId: context.userId,
              })
              .pipe(
                Effect.mapError((cause) =>
                  toMeshRpcError("Failed to resolve the prompt host device.", cause),
                ),
                Effect.flatMap((device) =>
                  Option.isSome(device)
                    ? Effect.succeed(device.value)
                    : Effect.fail(
                        toMeshRpcError(
                          `Prompt host device ${targetHostDeviceId} is not available for this account.`,
                        ),
                      ),
                ),
              );

            const targetSessionId = yield* deviceRegistry
              .getAnyOnlineSessionId(targetHostDeviceId)
              .pipe(
                Effect.flatMap((sessionId) =>
                  Option.isSome(sessionId)
                    ? Effect.succeed(sessionId.value)
                    : Effect.fail(
                        toMeshRpcError(
                          `${hostDevice.name} is offline. Reconnect that device to send prompts to this thread.`,
                        ),
                      ),
                ),
              );

            yield* promptRouter.publishToSession({
              sessionId: targetSessionId,
              item: {
                kind: "send_prompt_forward",
                command: routedCommand,
              },
            });

            return { sequence: 0 as const };
          }).pipe(
            Effect.mapError((cause) =>
              Schema.is(MeshRpcError)(cause)
                ? cause
                : toMeshRpcError("Failed to route prompt to the host device.", cause),
            ),
          ),
          { "rpc.aggregate": "mesh" },
        ),
      [MESH_WS_METHODS.forkChat]: (input: { command: ChatForkCommand }) =>
        observeRpcEffect(
          MESH_WS_METHODS.forkChat,
          Effect.gen(function* () {
            const command = input.command;
            // Stamp the source device id from the authenticated session so the
            // server is the source of truth for "which device kicked off the
            // fork" — clients can suggest it but cannot spoof it.
            const stampedCommand: ChatForkCommand = {
              ...command,
              ...(context.deviceId !== null && command.sourceDeviceId === undefined
                ? { sourceDeviceId: context.deviceId }
                : {}),
            };

            yield* orchestrationEngine
              .dispatch(stampedCommand)
              .pipe(
                Effect.mapError((cause) =>
                  toMeshRpcError(`Failed to fork chat ${stampedCommand.sourceThreadId}.`, cause),
                ),
              );

            // Read back the projected target thread shell to populate the
            // result payload (mainly for the source UI to know which projectId
            // and host device the new chat ended up on after defaults were
            // resolved server-side).
            const targetShellOpt = yield* projectionSnapshotQuery
              .getThreadShellById(stampedCommand.targetThreadId)
              .pipe(
                Effect.mapError((cause) =>
                  toMeshRpcError("Failed to read forked chat shell.", cause),
                ),
              );

            if (Option.isNone(targetShellOpt)) {
              return yield* toMeshRpcError(
                `Forked chat ${stampedCommand.targetThreadId} could not be loaded after creation.`,
              );
            }

            const targetShell = targetShellOpt.value;
            const targetHostDeviceId = targetShell.hostDeviceId ?? null;
            const targetEvents = yield* Stream.runCollect(
              eventStore.readThreadStream(
                stampedCommand.targetThreadId,
                0,
                Number.MAX_SAFE_INTEGER,
              ),
            ).pipe(
              Effect.map((chunk) => Array.from(chunk)),
              Effect.mapError((cause) =>
                toMeshRpcError("Failed to read the forked chat event stream.", cause),
              ),
            );
            const trailingForkEvent = targetEvents.findLast(
              (event) =>
                event.type === "thread.forked" &&
                event.payload.threadId === stampedCommand.targetThreadId,
            );
            const copiedEventCount = Math.max(0, targetEvents.length - 1);

            if (
              context.userId !== null &&
              targetHostDeviceId !== null &&
              targetHostDeviceId !== context.deviceId
            ) {
              const targetSessionId = yield* deviceRegistry
                .getAnyOnlineSessionId(targetHostDeviceId)
                .pipe(
                  Effect.mapError((cause) =>
                    toMeshRpcError("Failed to resolve the target device session.", cause),
                  ),
                );

              if (Option.isSome(targetSessionId)) {
                yield* promptRouter.publishToSession({
                  sessionId: targetSessionId.value,
                  item: {
                    kind: "fork_ready",
                    threadId: targetShell.id,
                    title: targetShell.title,
                  },
                });
              }
            }

            return {
              targetThreadId: stampedCommand.targetThreadId,
              copiedEventCount,
              forkedFromStreamVersion:
                trailingForkEvent?.type === "thread.forked"
                  ? trailingForkEvent.payload.forkedFromStreamVersion
                  : copiedEventCount,
              hostedOnDeviceId: targetHostDeviceId,
              targetProjectId: targetShell.projectId as ProjectId,
            } as const;
          }).pipe(
            Effect.mapError((cause) =>
              Schema.is(MeshRpcError)(cause)
                ? cause
                : toMeshRpcError("Failed to fork chat.", cause),
            ),
          ),
          { "rpc.aggregate": "mesh" },
        ),
      [MESH_WS_METHODS.importChat]: (input: { command: ChatImportCommand }) =>
        observeRpcEffect(
          MESH_WS_METHODS.importChat,
          Effect.gen(function* () {
            // Resolution-only RPC for now: scan the host CLI registries on
            // disk for skills + MCP servers that the imported transcript
            // references, mark them enabled vs missing, and echo back a
            // synthetic preview thread id. Persistence as a real
            // orchestration thread is a follow-up that needs careful
            // event-store integration alongside the existing fork flow.
            const parsed = input.command.parsed;

            const snapshot = yield* Effect.tryPromise({
              try: () => readInstalledSnapshot(),
              catch: (cause) =>
                toMeshRpcError("Failed to scan host-CLI registries for installed skills.", cause),
            });

            const resolution = resolveReferences(
              {
                skillIds: parsed.references.skillIds.slice(),
                mcpServerIds: parsed.references.mcpServerIds.slice(),
              },
              snapshot,
            );

            const previewThreadId = ThreadId.make(crypto.randomUUID());
            const targetProjectId =
              input.command.targetProjectId ?? ProjectId.make(crypto.randomUUID());

            return {
              targetThreadId: previewThreadId,
              importedMessageCount: parsed.messages.length,
              hostedOnDeviceId: context.deviceId,
              targetProjectId,
              skills: resolution.skills,
              mcpServers: resolution.mcpServers,
            } as const;
          }).pipe(
            Effect.mapError((cause) =>
              Schema.is(MeshRpcError)(cause)
                ? cause
                : toMeshRpcError("Failed to import chat.", cause),
            ),
          ),
          { "rpc.aggregate": "mesh" },
        ),
      [MESH_WS_METHODS.subscribePresence]: (_input: {}) =>
        observeRpcStreamEffect(
          MESH_WS_METHODS.subscribePresence,
          Effect.gen(function* () {
            const userId = yield* requireSignedInMeshUser();
            const userDevices = yield* devices
              .listForUser({ userId })
              .pipe(
                Effect.mapError((cause) =>
                  toMeshRpcError("Failed to load V3 devices for presence sync.", cause),
                ),
              );
            const deviceIds = new Set(userDevices.map((device) => device.id));
            const snapshotDevices = yield* Effect.forEach(
              userDevices,
              (device) =>
                deviceRegistry.isOnline(device.id).pipe(
                  Effect.map(
                    (online): PresenceUpdatePayload => ({
                      device_id: device.id,
                      online,
                      last_seen_at: device.lastSeenAt?.toString() ?? device.firstSeenAt.toString(),
                    }),
                  ),
                ),
              { concurrency: "unbounded" },
            );

            const liveStream = presence.stream.pipe(
              Stream.filter((update) => deviceIds.has(update.device_id)),
              Stream.map((update) => ({
                kind: "presence" as const,
                update,
              })),
            );

            return Stream.concat(
              Stream.make({
                kind: "snapshot" as const,
                snapshot: {
                  devices: snapshotDevices,
                },
              }),
              liveStream,
            );
          }),
          { "rpc.aggregate": "mesh" },
        ),
      [MESH_WS_METHODS.subscribePrompts]: (_input: {}) =>
        observeRpcStreamEffect(
          MESH_WS_METHODS.subscribePrompts,
          Effect.succeed(promptRouter.subscribeSession(context.sessionId)),
          { "rpc.aggregate": "mesh" },
        ),
      [MESH_WS_METHODS.subscribeDeviceApprovals]: (_input: {}) =>
        observeRpcStreamEffect(
          MESH_WS_METHODS.subscribeDeviceApprovals,
          Effect.gen(function* () {
            const userId = yield* requireSignedInMeshUser();
            return approvals.streamChanges.pipe(
              Stream.filter((event) => event.userId === userId),
              Stream.mapError((cause) =>
                toMeshRpcError("Failed to stream device approval events.", cause),
              ),
            );
          }),
          { "rpc.aggregate": "mesh" },
        ),
    };
  });
