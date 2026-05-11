import {
  CommandId,
  OrchestrationDispatchCommandError,
  type OrchestrationCommand,
} from "@v3tools/contracts";
import { Effect, FileSystem, Layer, Path, Schema } from "effect";

import { ServerConfig } from "../../config.ts";
import { normalizeDispatchCommand } from "../Normalizer.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import {
  MeshEventIngestion,
  type MeshEventIngestionShape,
} from "../Services/MeshEventIngestion.ts";
import { WorkspacePaths } from "../../workspace/Services/WorkspacePaths.ts";

function withMeshDeviceContext(
  command: Parameters<MeshEventIngestionShape["publishCommand"]>[0]["command"],
  deviceId: Parameters<MeshEventIngestionShape["publishCommand"]>[0]["deviceId"],
) {
  if (deviceId === null) {
    return command;
  }

  if (command.type === "thread.create" && command.hostDeviceId === undefined) {
    return {
      ...command,
      hostDeviceId: deviceId,
    };
  }

  if (
    command.type === "thread.turn.start" &&
    (command.sourceDeviceId === undefined ||
      (command.bootstrap?.createThread &&
        command.bootstrap.createThread.hostDeviceId === undefined))
  ) {
    const nextBootstrap =
      command.bootstrap?.createThread && command.bootstrap.createThread.hostDeviceId === undefined
        ? {
            ...command.bootstrap,
            createThread: {
              ...command.bootstrap.createThread,
              hostDeviceId: deviceId,
            },
          }
        : command.bootstrap;

    return {
      ...command,
      ...(command.sourceDeviceId === undefined ? { sourceDeviceId: deviceId } : {}),
      ...(nextBootstrap !== command.bootstrap ? { bootstrap: nextBootstrap } : {}),
    };
  }

  return command;
}

const serverCommandId = (tag: string) =>
  CommandId.make(`server:mesh-${tag}:${crypto.randomUUID()}`);

function toDispatchCommandError(cause: unknown, fallbackMessage: string) {
  return Schema.is(OrchestrationDispatchCommandError)(cause)
    ? cause
    : new OrchestrationDispatchCommandError({
        message: cause instanceof Error ? cause.message : fallbackMessage,
        cause,
      });
}

const makeMeshEventIngestion = Effect.gen(function* () {
  const orchestrationEngine = yield* OrchestrationEngineService;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const serverConfig = yield* ServerConfig;
  const workspacePaths = yield* WorkspacePaths;

  const dispatchBootstrapTurnStart = (
    command: Extract<OrchestrationCommand, { type: "thread.turn.start" }>,
  ): Effect.Effect<{ readonly sequence: number }, OrchestrationDispatchCommandError, never> =>
    Effect.gen(function* () {
      const bootstrap = command.bootstrap;
      const createThread = bootstrap?.createThread;
      if (!createThread) {
        return yield* orchestrationEngine
          .dispatch(command)
          .pipe(
            Effect.mapError((cause) =>
              toDispatchCommandError(cause, "Failed to publish mesh command"),
            ),
          );
      }

      if (bootstrap.prepareWorktree || bootstrap.runSetupScript) {
        return yield* new OrchestrationDispatchCommandError({
          message:
            "Mesh prompt bootstrap cannot prepare worktrees or run setup scripts yet. Start this branch chat from the local UI connection.",
        });
      }

      const { bootstrap: _bootstrap, ...finalTurnStartCommand } = command;
      let createdThread = false;

      const cleanupCreatedThread = () =>
        createdThread
          ? orchestrationEngine
              .dispatch({
                type: "thread.delete",
                commandId: serverCommandId("bootstrap-thread-delete"),
                threadId: command.threadId,
              })
              .pipe(Effect.ignoreCause({ log: true }))
          : Effect.void;

      return yield* Effect.gen(function* () {
        yield* orchestrationEngine.dispatch({
          type: "thread.create",
          commandId: serverCommandId("bootstrap-thread-create"),
          threadId: command.threadId,
          projectId: createThread.projectId,
          title: createThread.title,
          ...(createThread.hostDeviceId !== undefined
            ? { hostDeviceId: createThread.hostDeviceId }
            : {}),
          modelSelection: createThread.modelSelection,
          sessionMode: createThread.sessionMode ?? "single",
          orchestratorConfig: createThread.orchestratorConfig ?? null,
          runtimeMode: createThread.runtimeMode,
          interactionMode: createThread.interactionMode,
          branch: createThread.branch,
          worktreePath: createThread.worktreePath,
          createdAt: createThread.createdAt,
        });
        createdThread = true;

        return yield* orchestrationEngine.dispatch(
          finalTurnStartCommand as Extract<OrchestrationCommand, { type: "thread.turn.start" }>,
        );
      }).pipe(
        Effect.mapError((cause) =>
          toDispatchCommandError(cause, "Failed to bootstrap mesh thread turn start."),
        ),
        Effect.catch((cause) =>
          cleanupCreatedThread().pipe(Effect.flatMap(() => Effect.fail(cause))),
        ),
      );
    });

  const dispatchNormalizedCommand = (
    normalizedCommand: OrchestrationCommand,
  ): Effect.Effect<{ readonly sequence: number }, OrchestrationDispatchCommandError, never> =>
    normalizedCommand.type === "thread.turn.start" && normalizedCommand.bootstrap
      ? dispatchBootstrapTurnStart(normalizedCommand)
      : orchestrationEngine
          .dispatch(normalizedCommand)
          .pipe(
            Effect.mapError((cause) =>
              toDispatchCommandError(cause, "Failed to publish mesh command"),
            ),
          );

  return {
    publishCommand: ({ command, deviceId }) =>
      normalizeDispatchCommand(withMeshDeviceContext(command, deviceId)).pipe(
        Effect.provideService(WorkspacePaths, workspacePaths),
        Effect.provideService(ServerConfig, serverConfig),
        Effect.provideService(Path.Path, path),
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.flatMap((normalizedCommand) => dispatchNormalizedCommand(normalizedCommand)),
      ),
  } satisfies MeshEventIngestionShape;
});

export const MeshEventIngestionLive = Layer.effect(MeshEventIngestion, makeMeshEventIngestion);
