// Loads `~/.v3-code-server/config.toml` if present, parses it via
// `smol-toml`, and Schema-decodes the result into `ServerNodeConfig`.
//
// Failure modes are deliberately distinct so resolveServerConfig can
// decide what to do per-case:
//   - file absent  → returns Option.none(); single-device users hit this
//   - parse error  → ServerNodeConfigError(reason: "parse")
//   - decode error → ServerNodeConfigError(reason: "schema")
//   - read error   → ServerNodeConfigError(reason: "read") — permissions, IO
//
// The loader is pure-Effect so callers can compose it inside larger
// startup pipelines without juggling try/catch.

import { Data, Effect, FileSystem, Option, Schema } from "effect";
import * as TOML from "smol-toml";

import { ServerNodeConfig } from "./serverNodeConfig.ts";

export class ServerNodeConfigError extends Data.TaggedError("ServerNodeConfigError")<{
  readonly reason: "read" | "parse" | "schema";
  readonly path: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

const decodeServerNodeConfig = Schema.decodeUnknownEffect(ServerNodeConfig);

// Read + parse + decode in one Effect. Returns `Option.none()` when the
// file does not exist; only IO/parse/schema problems surface as errors.
export const loadServerNodeConfig = Effect.fn(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;

  const exists = yield* fs.exists(path).pipe(
    Effect.mapError(
      (cause) =>
        new ServerNodeConfigError({
          reason: "read",
          path,
          message: `Could not check ${path} for existence.`,
          cause,
        }),
    ),
  );
  if (!exists) {
    return Option.none<ServerNodeConfig>();
  }

  const raw = yield* fs.readFileString(path).pipe(
    Effect.mapError(
      (cause) =>
        new ServerNodeConfigError({
          reason: "read",
          path,
          message: `Could not read ${path}.`,
          cause,
        }),
    ),
  );

  const parsed = yield* Effect.try({
    try: () => TOML.parse(raw) as unknown,
    catch: (cause) =>
      new ServerNodeConfigError({
        reason: "parse",
        path,
        message: `Failed to parse ${path} as TOML.`,
        cause,
      }),
  });

  const decoded = yield* decodeServerNodeConfig(parsed).pipe(
    Effect.mapError(
      (cause) =>
        new ServerNodeConfigError({
          reason: "schema",
          path,
          message: `Config at ${path} did not match the expected shape.`,
          cause,
        }),
    ),
  );
  return Option.some(decoded);
});
