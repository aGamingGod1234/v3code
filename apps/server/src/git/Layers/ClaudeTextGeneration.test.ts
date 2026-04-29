import * as nodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path } from "effect";
import { expect } from "vitest";

import { ServerConfig } from "../../config.ts";
import { TextGeneration } from "../Services/TextGeneration.ts";
import { sanitizeThreadTitle } from "../Utils.ts";
import { ClaudeTextGenerationLive } from "./ClaudeTextGeneration.ts";
import { ServerSettingsService } from "../../serverSettings.ts";

const ClaudeTextGenerationTestLayer = ClaudeTextGenerationLive.pipe(
  Layer.provideMerge(ServerSettingsService.layerTest()),
  Layer.provideMerge(
    ServerConfig.layerTest(process.cwd(), {
      prefix: "t3code-claude-text-generation-test-",
    }),
  ),
  Layer.provideMerge(NodeServices.layer),
);

function makeFakeClaudeBinary(dir: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const binDir = path.join(dir, "bin");
    const scriptPath = path.join(binDir, "fake-claude.mjs");
    const claudePath = path.join(binDir, process.platform === "win32" ? "claude.cmd" : "claude");
    yield* fs.makeDirectory(binDir, { recursive: true });

    yield* fs.writeFileString(
      scriptPath,
      `const args = process.argv.slice(2).join(" ");
const normalizedArgs = args.replaceAll('"', "");
const stdin = await new Promise((resolve) => {
  let content = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    content += chunk;
  });
  process.stdin.on("end", () => resolve(content));
});

const argsMustContain = process.env.T3_FAKE_CLAUDE_ARGS_MUST_CONTAIN;
if (
  argsMustContain &&
  !args.includes(argsMustContain) &&
  !normalizedArgs.includes(argsMustContain.replaceAll('"', ""))
) {
  console.error("args missing expected content");
  process.exit(2);
}

const argsMustNotContain = process.env.T3_FAKE_CLAUDE_ARGS_MUST_NOT_CONTAIN;
if (
  argsMustNotContain &&
  (args.includes(argsMustNotContain) ||
    normalizedArgs.includes(argsMustNotContain.replaceAll('"', "")))
) {
  console.error("args contained forbidden content");
  process.exit(3);
}

const stdinMustContain = process.env.T3_FAKE_CLAUDE_STDIN_MUST_CONTAIN;
if (stdinMustContain && !stdin.includes(stdinMustContain)) {
  console.error("stdin missing expected content");
  process.exit(4);
}

if (process.env.T3_FAKE_CLAUDE_STDERR) {
  console.error(process.env.T3_FAKE_CLAUDE_STDERR);
}
process.stdout.write(process.env.T3_FAKE_CLAUDE_OUTPUT ?? "");
process.exit(Number(process.env.T3_FAKE_CLAUDE_EXIT_CODE ?? "0"));
`,
    );

    yield* fs.writeFileString(
      claudePath,
      process.platform === "win32"
        ? `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`
        : `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(scriptPath)} "$@"\n`,
    );
    yield* fs.chmod(claudePath, 0o755);
    return binDir;
  });
}

function withFakeClaudeEnv<A, E, R>(
  input: {
    output: string;
    exitCode?: number;
    stderr?: string;
    argsMustContain?: string;
    argsMustNotContain?: string;
    stdinMustContain?: string;
  },
  effect: Effect.Effect<A, E, R>,
) {
  return Effect.acquireUseRelease(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-claude-text-" });
      const binDir = yield* makeFakeClaudeBinary(tempDir);
      const previousPath = process.env.PATH;
      const previousOutput = process.env.T3_FAKE_CLAUDE_OUTPUT;
      const previousExitCode = process.env.T3_FAKE_CLAUDE_EXIT_CODE;
      const previousStderr = process.env.T3_FAKE_CLAUDE_STDERR;
      const previousArgsMustContain = process.env.T3_FAKE_CLAUDE_ARGS_MUST_CONTAIN;
      const previousArgsMustNotContain = process.env.T3_FAKE_CLAUDE_ARGS_MUST_NOT_CONTAIN;
      const previousStdinMustContain = process.env.T3_FAKE_CLAUDE_STDIN_MUST_CONTAIN;

      yield* Effect.sync(() => {
        process.env.PATH = `${binDir}${nodePath.delimiter}${previousPath ?? ""}`;
        process.env.T3_FAKE_CLAUDE_OUTPUT = input.output;

        if (input.exitCode !== undefined) {
          process.env.T3_FAKE_CLAUDE_EXIT_CODE = String(input.exitCode);
        } else {
          delete process.env.T3_FAKE_CLAUDE_EXIT_CODE;
        }

        if (input.stderr !== undefined) {
          process.env.T3_FAKE_CLAUDE_STDERR = input.stderr;
        } else {
          delete process.env.T3_FAKE_CLAUDE_STDERR;
        }

        if (input.argsMustContain !== undefined) {
          process.env.T3_FAKE_CLAUDE_ARGS_MUST_CONTAIN = input.argsMustContain;
        } else {
          delete process.env.T3_FAKE_CLAUDE_ARGS_MUST_CONTAIN;
        }

        if (input.argsMustNotContain !== undefined) {
          process.env.T3_FAKE_CLAUDE_ARGS_MUST_NOT_CONTAIN = input.argsMustNotContain;
        } else {
          delete process.env.T3_FAKE_CLAUDE_ARGS_MUST_NOT_CONTAIN;
        }

        if (input.stdinMustContain !== undefined) {
          process.env.T3_FAKE_CLAUDE_STDIN_MUST_CONTAIN = input.stdinMustContain;
        } else {
          delete process.env.T3_FAKE_CLAUDE_STDIN_MUST_CONTAIN;
        }
      });

      return {
        previousPath,
        previousOutput,
        previousExitCode,
        previousStderr,
        previousArgsMustContain,
        previousArgsMustNotContain,
        previousStdinMustContain,
      };
    }),
    () => effect,
    (previous) =>
      Effect.sync(() => {
        process.env.PATH = previous.previousPath;

        if (previous.previousOutput === undefined) {
          delete process.env.T3_FAKE_CLAUDE_OUTPUT;
        } else {
          process.env.T3_FAKE_CLAUDE_OUTPUT = previous.previousOutput;
        }

        if (previous.previousExitCode === undefined) {
          delete process.env.T3_FAKE_CLAUDE_EXIT_CODE;
        } else {
          process.env.T3_FAKE_CLAUDE_EXIT_CODE = previous.previousExitCode;
        }

        if (previous.previousStderr === undefined) {
          delete process.env.T3_FAKE_CLAUDE_STDERR;
        } else {
          process.env.T3_FAKE_CLAUDE_STDERR = previous.previousStderr;
        }

        if (previous.previousArgsMustContain === undefined) {
          delete process.env.T3_FAKE_CLAUDE_ARGS_MUST_CONTAIN;
        } else {
          process.env.T3_FAKE_CLAUDE_ARGS_MUST_CONTAIN = previous.previousArgsMustContain;
        }

        if (previous.previousArgsMustNotContain === undefined) {
          delete process.env.T3_FAKE_CLAUDE_ARGS_MUST_NOT_CONTAIN;
        } else {
          process.env.T3_FAKE_CLAUDE_ARGS_MUST_NOT_CONTAIN = previous.previousArgsMustNotContain;
        }

        if (previous.previousStdinMustContain === undefined) {
          delete process.env.T3_FAKE_CLAUDE_STDIN_MUST_CONTAIN;
        } else {
          process.env.T3_FAKE_CLAUDE_STDIN_MUST_CONTAIN = previous.previousStdinMustContain;
        }
      }),
  );
}

it.layer(ClaudeTextGenerationTestLayer)("ClaudeTextGenerationLive", (it) => {
  it.effect("forwards Claude thinking settings for Haiku without passing effort", () =>
    withFakeClaudeEnv(
      {
        output: JSON.stringify({
          structured_output: {
            subject: "Add important change",
            body: "",
          },
        }),
        argsMustContain: '--settings {"alwaysThinkingEnabled":false}',
        argsMustNotContain: "--effort",
      },
      Effect.gen(function* () {
        const textGeneration = yield* TextGeneration;

        const generated = yield* textGeneration.generateCommitMessage({
          cwd: process.cwd(),
          branch: "feature/claude-effect",
          stagedSummary: "M README.md",
          stagedPatch: "diff --git a/README.md b/README.md",
          modelSelection: {
            provider: "claudeAgent",
            model: "claude-haiku-4-5",
            options: {
              thinking: false,
              effort: "high",
            },
          },
        });

        expect(generated.subject).toBe("Add important change");
      }),
    ),
  );

  it.effect("forwards Claude fast mode and supported effort", () =>
    withFakeClaudeEnv(
      {
        output: JSON.stringify({
          structured_output: {
            title: "Improve orchestration flow",
            body: "Body",
          },
        }),
        argsMustContain: '--effort max --settings {"fastMode":true}',
      },
      Effect.gen(function* () {
        const textGeneration = yield* TextGeneration;

        const generated = yield* textGeneration.generatePrContent({
          cwd: process.cwd(),
          baseBranch: "main",
          headBranch: "feature/claude-effect",
          commitSummary: "Improve orchestration",
          diffSummary: "1 file changed",
          diffPatch: "diff --git a/README.md b/README.md",
          modelSelection: {
            provider: "claudeAgent",
            model: "claude-opus-4-6",
            options: {
              effort: "max",
              fastMode: true,
            },
          },
        });

        expect(generated.title).toBe("Improve orchestration flow");
      }),
    ),
  );

  it.effect("generates thread titles through the Claude provider", () =>
    withFakeClaudeEnv(
      {
        output: JSON.stringify({
          structured_output: {
            title:
              '  "Reconnect failures after restart because the session state does not recover"  ',
          },
        }),
        stdinMustContain: "You write concise thread titles for coding conversations.",
      },
      Effect.gen(function* () {
        const textGeneration = yield* TextGeneration;

        const generated = yield* textGeneration.generateThreadTitle({
          cwd: process.cwd(),
          message: "Please investigate reconnect failures after restarting the session.",
          modelSelection: {
            provider: "claudeAgent",
            model: "claude-sonnet-4-6",
          },
        });

        expect(generated.title).toBe(
          sanitizeThreadTitle(
            '"Reconnect failures after restart because the session state does not recover"',
          ),
        );
      }),
    ),
  );

  it.effect("falls back when Claude thread title normalization becomes whitespace-only", () =>
    withFakeClaudeEnv(
      {
        output: JSON.stringify({
          structured_output: {
            title: '  """   """  ',
          },
        }),
      },
      Effect.gen(function* () {
        const textGeneration = yield* TextGeneration;

        const generated = yield* textGeneration.generateThreadTitle({
          cwd: process.cwd(),
          message: "Name this thread.",
          modelSelection: {
            provider: "claudeAgent",
            model: "claude-sonnet-4-6",
          },
        });

        expect(generated.title).toBe("New thread");
      }),
    ),
  );
});
