import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Sink from "effect/Sink";
import * as Stdio from "effect/Stdio";
import { ChildProcessSpawner } from "effect/unstable/process";

import * as AcpError from "../errors.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const STDERR_TAIL_MAX_CHARS = 4000;
const childStderrTail = new WeakMap<ChildProcessSpawner.ChildProcessHandle, string>();

const appendChildStderr = (
  handle: ChildProcessSpawner.ChildProcessHandle,
  chunk: string | Uint8Array,
): void => {
  const text = typeof chunk === "string" ? chunk : decoder.decode(chunk);
  const current = childStderrTail.get(handle) ?? "";
  childStderrTail.set(handle, `${current}${text}`.slice(-STDERR_TAIL_MAX_CHARS));
};

export const makeChildStdio = (handle: ChildProcessSpawner.ChildProcessHandle) =>
  Stdio.make({
    args: Effect.succeed([]),
    stdin: handle.stdout,
    stdout: () =>
      Sink.mapInput(handle.stdin, (chunk: string | Uint8Array) =>
        typeof chunk === "string" ? encoder.encode(chunk) : chunk,
      ),
    stderr: () =>
      Sink.forEach((chunk: string | Uint8Array) =>
        Effect.sync(() => appendChildStderr(handle, chunk)),
      ),
  });

export const makeInMemoryStdio = Effect.fn("makeInMemoryStdio")(function* () {
  const input = yield* Queue.unbounded<Uint8Array, Cause.Done<void>>();
  const output = yield* Queue.unbounded<string>();

  return {
    stdio: Stdio.make({
      args: Effect.succeed([]),
      stdin: Stream.fromQueue(input),
      stdout: () =>
        Sink.forEach((chunk: string | Uint8Array) =>
          Queue.offer(output, typeof chunk === "string" ? chunk : decoder.decode(chunk)),
        ),
      stderr: () => Sink.drain,
    }),
    input,
    output,
  };
});

export const makeTerminationError = (
  handle: ChildProcessSpawner.ChildProcessHandle,
): Effect.Effect<AcpError.AcpError> =>
  Effect.match(handle.exitCode, {
    onFailure: (cause) =>
      new AcpError.AcpTransportError({
        detail: "Failed to determine ACP process exit status",
        cause,
      }),
    onSuccess: (code) => {
      const stderr = childStderrTail.get(handle)?.trim();
      return new AcpError.AcpProcessExitedError({
        code,
        ...(stderr ? { stderr } : {}),
      });
    },
  });
