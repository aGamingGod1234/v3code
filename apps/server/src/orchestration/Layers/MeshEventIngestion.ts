import { OrchestrationDispatchCommandError } from "@v3tools/contracts";
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

const makeMeshEventIngestion = Effect.gen(function* () {
  const orchestrationEngine = yield* OrchestrationEngineService;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const serverConfig = yield* ServerConfig;
  const workspacePaths = yield* WorkspacePaths;

  return {
    publishCommand: ({ command, deviceId }) =>
      normalizeDispatchCommand(withMeshDeviceContext(command, deviceId)).pipe(
        Effect.provideService(WorkspacePaths, workspacePaths),
        Effect.provideService(ServerConfig, serverConfig),
        Effect.provideService(Path.Path, path),
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.flatMap((normalizedCommand) => orchestrationEngine.dispatch(normalizedCommand)),
        Effect.mapError((cause) =>
          Schema.is(OrchestrationDispatchCommandError)(cause)
            ? cause
            : new OrchestrationDispatchCommandError({
                message: "Failed to publish mesh command",
                cause,
              }),
        ),
      ),
  } satisfies MeshEventIngestionShape;
});

export const MeshEventIngestionLive = Layer.effect(MeshEventIngestion, makeMeshEventIngestion);
