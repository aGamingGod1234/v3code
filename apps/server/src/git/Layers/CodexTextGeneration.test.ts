import * as NodeServices from "@effect/platform-node/NodeServices";
import { it } from "@effect/vitest";
import { Effect, FileSystem, Layer, Path, Result } from "effect";
import { expect } from "vitest";

import { ServerConfig } from "../../config.ts";
import { CodexTextGenerationLive } from "./CodexTextGeneration.ts";
import { TextGenerationError } from "@v3tools/contracts";
import { TextGeneration } from "../Services/TextGeneration.ts";
import { ServerSettingsService } from "../../serverSettings.ts";

const DEFAULT_TEST_MODEL_SELECTION = {
  provider: "codex" as const,
  model: "gpt-5.4-mini",
};

const CodexTextGenerationTestLayer = CodexTextGenerationLive.pipe(
  Layer.provideMerge(ServerSettingsService.layerTest()),
  Layer.provideMerge(
    ServerConfig.layerTest(process.cwd(), {
      prefix: "t3code-codex-text-generation-test-",
    }),
  ),
  Layer.provideMerge(NodeServices.layer),
);

function makeFakeCodexBinary(
  dir: string,
  input: {
    output: string;
    exitCode?: number;
    stderr?: string;
    requireImage?: boolean;
    requireFastServiceTier?: boolean;
    requireReasoningEffort?: string;
    forbidReasoningEffort?: boolean;
    stdinMustContain?: string;
    stdinMustNotContain?: string;
  },
) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const binDir = path.join(dir, "bin");
    const scriptPath = path.join(binDir, "fake-codex.mjs");
    const codexPath = path.join(binDir, process.platform === "win32" ? "codex.cmd" : "codex");
    yield* fs.makeDirectory(binDir, { recursive: true });

    yield* fs.writeFileString(
      scriptPath,
      `import { promises as fs } from "node:fs";

const config = ${JSON.stringify(input)};
const args = process.argv.slice(2);
let outputPath = "";
let seenImage = false;
let seenFastServiceTier = false;
let seenReasoningEffort = "";

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--image") {
    index += 1;
    seenImage = Boolean(args[index]);
    continue;
  }
  if (arg === "--config") {
    index += 1;
    const value = args[index] ?? "";
    if (value === 'service_tier="fast"' || value === "service_tier=fast") {
      seenFastServiceTier = true;
    }
    if (value.startsWith("model_reasoning_effort=")) {
      seenReasoningEffort = value;
    }
    continue;
  }
  if (arg === "--output-last-message") {
    index += 1;
    outputPath = args[index] ?? "";
  }
}

const stdin = await new Promise((resolve) => {
  let content = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    content += chunk;
  });
  process.stdin.on("end", () => resolve(content));
});

if (config.requireImage && !seenImage) {
  console.error("missing --image input");
  process.exit(2);
}
if (config.requireFastServiceTier && !seenFastServiceTier) {
  console.error("missing fast service tier config");
  process.exit(5);
}
if (config.requireReasoningEffort !== undefined) {
  const expectedQuoted = \`model_reasoning_effort="\${config.requireReasoningEffort}"\`;
  const expectedUnquoted = \`model_reasoning_effort=\${config.requireReasoningEffort}\`;
  if (seenReasoningEffort !== expectedQuoted && seenReasoningEffort !== expectedUnquoted) {
  console.error(\`unexpected reasoning effort config: \${seenReasoningEffort}\`);
  process.exit(6);
  }
}
if (config.forbidReasoningEffort && seenReasoningEffort.length > 0) {
  console.error(\`reasoning effort config should be omitted: \${seenReasoningEffort}\`);
  process.exit(7);
}
if (config.stdinMustContain !== undefined && !stdin.includes(config.stdinMustContain)) {
  console.error("stdin missing expected content");
  process.exit(3);
}
if (config.stdinMustNotContain !== undefined && stdin.includes(config.stdinMustNotContain)) {
  console.error("stdin contained forbidden content");
  process.exit(4);
}
if (config.stderr !== undefined) {
  console.error(config.stderr);
}
if (outputPath.length > 0) {
  await fs.writeFile(outputPath, config.output, "utf8");
}
process.exit(config.exitCode ?? 0);
`,
    );

    yield* fs.writeFileString(
      codexPath,
      process.platform === "win32"
        ? `@echo off\r\n"${process.execPath}" "${scriptPath}" %*\r\n`
        : `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(scriptPath)} "$@"\n`,
    );
    yield* fs.chmod(codexPath, 0o755);
    return codexPath;
  });
}

function withFakeCodexEnv<A, E, R>(
  input: {
    output: string;
    exitCode?: number;
    stderr?: string;
    requireImage?: boolean;
    requireFastServiceTier?: boolean;
    requireReasoningEffort?: string;
    forbidReasoningEffort?: boolean;
    stdinMustContain?: string;
    stdinMustNotContain?: string;
  },
  effect: Effect.Effect<A, E, R>,
) {
  return Effect.acquireUseRelease(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-codex-text-" });
      const codexPath = yield* makeFakeCodexBinary(tempDir, input);
      const serverSettings = yield* ServerSettingsService;
      const previousSettings = yield* serverSettings.getSettings;
      yield* serverSettings.updateSettings({
        providers: {
          codex: {
            binaryPath: codexPath,
          },
        },
      });
      return { serverSettings, previousBinaryPath: previousSettings.providers.codex.binaryPath };
    }),
    () => effect,
    ({ serverSettings, previousBinaryPath }) =>
      serverSettings
        .updateSettings({
          providers: {
            codex: {
              binaryPath: previousBinaryPath,
            },
          },
        })
        .pipe(Effect.asVoid),
  );
}

it.layer(CodexTextGenerationTestLayer)("CodexTextGenerationLive", (it) => {
  it.effect("generates and sanitizes commit messages without branch by default", () =>
    withFakeCodexEnv(
      {
        output: JSON.stringify({
          subject:
            "  Add important change to the system with too much detail and a trailing period.\nsecondary line",
          body: "\n- added migration\n- updated tests\n",
        }),
        stdinMustNotContain: "branch must be a short semantic git branch fragment",
      },
      Effect.gen(function* () {
        const textGeneration = yield* TextGeneration;

        const generated = yield* textGeneration.generateCommitMessage({
          cwd: process.cwd(),
          branch: "feature/codex-effect",
          stagedSummary: "M README.md",
          stagedPatch: "diff --git a/README.md b/README.md",
          modelSelection: DEFAULT_TEST_MODEL_SELECTION,
        });

        expect(generated.subject.length).toBeLessThanOrEqual(72);
        expect(generated.subject.endsWith(".")).toBe(false);
        expect(generated.body).toBe("- added migration\n- updated tests");
        expect(generated.branch).toBeUndefined();
      }),
    ),
  );

  it.effect(
    "forwards codex fast mode and non-default reasoning effort into codex exec config",
    () =>
      withFakeCodexEnv(
        {
          output: JSON.stringify({
            subject: "Add important change",
            body: "",
          }),
          requireFastServiceTier: true,
          requireReasoningEffort: "xhigh",
          stdinMustNotContain: "branch must be a short semantic git branch fragment",
        },
        Effect.gen(function* () {
          const textGeneration = yield* TextGeneration;

          yield* textGeneration.generateCommitMessage({
            cwd: process.cwd(),
            branch: "feature/codex-effect",
            stagedSummary: "M README.md",
            stagedPatch: "diff --git a/README.md b/README.md",
            modelSelection: {
              provider: "codex",
              model: "gpt-5.4",
              options: {
                reasoningEffort: "xhigh",
                fastMode: true,
              },
            },
          });
        }),
      ),
  );

  it.effect("defaults git text generation codex effort to low", () =>
    withFakeCodexEnv(
      {
        output: JSON.stringify({
          subject: "Add important change",
          body: "",
        }),
        requireReasoningEffort: "low",
      },
      Effect.gen(function* () {
        const textGeneration = yield* TextGeneration;

        yield* textGeneration.generateCommitMessage({
          cwd: process.cwd(),
          branch: "feature/codex-effect",
          stagedSummary: "M README.md",
          stagedPatch: "diff --git a/README.md b/README.md",
          modelSelection: DEFAULT_TEST_MODEL_SELECTION,
        });
      }),
    ),
  );

  it.effect("generates commit message with branch when includeBranch is true", () =>
    withFakeCodexEnv(
      {
        output: JSON.stringify({
          subject: "Add important change",
          body: "",
          branch: "fix/important-system-change",
        }),
        stdinMustContain: "branch must be a short semantic git branch fragment",
      },
      Effect.gen(function* () {
        const textGeneration = yield* TextGeneration;

        const generated = yield* textGeneration.generateCommitMessage({
          cwd: process.cwd(),
          branch: "feature/codex-effect",
          stagedSummary: "M README.md",
          stagedPatch: "diff --git a/README.md b/README.md",
          includeBranch: true,
          modelSelection: DEFAULT_TEST_MODEL_SELECTION,
        });

        expect(generated.subject).toBe("Add important change");
        expect(generated.branch).toBe("feature/fix/important-system-change");
      }),
    ),
  );

  it.effect("generates PR content and trims markdown body", () =>
    withFakeCodexEnv(
      {
        output: JSON.stringify({
          title: "  Improve orchestration flow\nwith ignored suffix",
          body: "\n## Summary\n- improve flow\n\n## Testing\n- bun test\n\n",
        }),
      },
      Effect.gen(function* () {
        const textGeneration = yield* TextGeneration;

        const generated = yield* textGeneration.generatePrContent({
          cwd: process.cwd(),
          baseBranch: "main",
          headBranch: "feature/codex-effect",
          commitSummary: "feat: improve orchestration flow",
          diffSummary: "2 files changed",
          diffPatch: "diff --git a/a.ts b/a.ts",
          modelSelection: DEFAULT_TEST_MODEL_SELECTION,
        });

        expect(generated.title).toBe("Improve orchestration flow");
        expect(generated.body.startsWith("## Summary")).toBe(true);
        expect(generated.body.endsWith("\n\n")).toBe(false);
      }),
    ),
  );

  it.effect("generates branch names and normalizes branch fragments", () =>
    withFakeCodexEnv(
      {
        output: JSON.stringify({
          branch: "  Feat/Session  ",
        }),
        stdinMustNotContain: "Image attachments supplied to the model",
      },
      Effect.gen(function* () {
        const textGeneration = yield* TextGeneration;

        const generated = yield* textGeneration.generateBranchName({
          cwd: process.cwd(),
          message: "Please update session handling.",
          modelSelection: DEFAULT_TEST_MODEL_SELECTION,
        });

        expect(generated.branch).toBe("feat/session");
      }),
    ),
  );

  it.effect("generates thread titles and trims them for sidebar use", () =>
    withFakeCodexEnv(
      {
        output: JSON.stringify({
          title:
            '  "Investigate websocket reconnect regressions after worktree restore"  \nignored line',
        }),
      },
      Effect.gen(function* () {
        const textGeneration = yield* TextGeneration;

        const generated = yield* textGeneration.generateThreadTitle({
          cwd: process.cwd(),
          message: "Please investigate websocket reconnect regressions after a worktree restore.",
          modelSelection: DEFAULT_TEST_MODEL_SELECTION,
        });

        expect(generated.title).toBe("Investigate websocket reconnect regressions aft...");
      }),
    ),
  );

  it.effect("falls back when thread title normalization becomes whitespace-only", () =>
    withFakeCodexEnv(
      {
        output: JSON.stringify({
          title: '  """   """  ',
        }),
      },
      Effect.gen(function* () {
        const textGeneration = yield* TextGeneration;

        const generated = yield* textGeneration.generateThreadTitle({
          cwd: process.cwd(),
          message: "Name this thread.",
          modelSelection: DEFAULT_TEST_MODEL_SELECTION,
        });

        expect(generated.title).toBe("New thread");
      }),
    ),
  );

  it.effect("trims whitespace exposed after quote removal in thread titles", () =>
    withFakeCodexEnv(
      {
        output: JSON.stringify({
          title: `  "' hello world '"  `,
        }),
      },
      Effect.gen(function* () {
        const textGeneration = yield* TextGeneration;

        const generated = yield* textGeneration.generateThreadTitle({
          cwd: process.cwd(),
          message: "Name this thread.",
          modelSelection: DEFAULT_TEST_MODEL_SELECTION,
        });

        expect(generated.title).toBe("hello world");
      }),
    ),
  );

  it.effect("omits attachment metadata section when no attachments are provided", () =>
    withFakeCodexEnv(
      {
        output: JSON.stringify({
          branch: "fix/session-timeout",
        }),
        stdinMustNotContain: "Attachment metadata:",
      },
      Effect.gen(function* () {
        const textGeneration = yield* TextGeneration;

        const generated = yield* textGeneration.generateBranchName({
          cwd: process.cwd(),
          message: "Fix timeout behavior.",
          modelSelection: DEFAULT_TEST_MODEL_SELECTION,
        });

        expect(generated.branch).toBe("fix/session-timeout");
      }),
    ),
  );

  it.effect("passes image attachments through as codex image inputs", () =>
    withFakeCodexEnv(
      {
        output: JSON.stringify({
          branch: "fix/ui-regression",
        }),
        requireImage: true,
        stdinMustContain: "Attachment metadata:",
      },
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { attachmentsDir } = yield* ServerConfig;
        const attachmentId = `thread-branch-image-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const attachmentPath = path.join(attachmentsDir, `${attachmentId}.png`);
        yield* fs.makeDirectory(attachmentsDir, { recursive: true });
        yield* fs.writeFile(attachmentPath, Buffer.from("hello"));

        const textGeneration = yield* TextGeneration;
        const generated = yield* textGeneration.generateBranchName({
          modelSelection: DEFAULT_TEST_MODEL_SELECTION,
          cwd: process.cwd(),
          message: "Fix layout bug from screenshot.",
          attachments: [
            {
              type: "image",
              id: attachmentId,
              name: "bug.png",
              mimeType: "image/png",
              sizeBytes: 5,
            },
          ],
        });

        expect(generated.branch).toBe("fix/ui-regression");
      }),
    ),
  );

  it.effect("resolves persisted attachment ids to files for codex image inputs", () =>
    withFakeCodexEnv(
      {
        output: JSON.stringify({
          branch: "fix/ui-regression",
        }),
        requireImage: true,
      },
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { attachmentsDir } = yield* ServerConfig;
        const attachmentId = `thread-1-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const imagePath = path.join(attachmentsDir, `${attachmentId}.png`);
        yield* fs.makeDirectory(attachmentsDir, { recursive: true });
        yield* fs.writeFile(imagePath, Buffer.from("hello"));

        const textGeneration = yield* TextGeneration;
        const generated = yield* textGeneration
          .generateBranchName({
            modelSelection: DEFAULT_TEST_MODEL_SELECTION,
            cwd: process.cwd(),
            message: "Fix layout bug from screenshot.",
            attachments: [
              {
                type: "image",
                id: attachmentId,
                name: "bug.png",
                mimeType: "image/png",
                sizeBytes: 5,
              },
            ],
          })
          .pipe(
            Effect.tap(() =>
              fs.stat(imagePath).pipe(
                Effect.map((fileInfo) => {
                  expect(fileInfo.type).toBe("File");
                }),
              ),
            ),
            Effect.ensuring(fs.remove(imagePath).pipe(Effect.catch(() => Effect.void))),
          );

        expect(generated.branch).toBe("fix/ui-regression");
      }),
    ),
  );

  it.effect("ignores missing attachment ids for codex image inputs", () =>
    withFakeCodexEnv(
      {
        output: JSON.stringify({
          branch: "fix/ui-regression",
        }),
        requireImage: true,
      },
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { attachmentsDir } = yield* ServerConfig;
        const missingAttachmentId = `thread-missing-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const missingPath = path.join(attachmentsDir, `${missingAttachmentId}.png`);
        yield* fs.remove(missingPath).pipe(Effect.catch(() => Effect.void));

        const textGeneration = yield* TextGeneration;
        const result = yield* textGeneration
          .generateBranchName({
            modelSelection: DEFAULT_TEST_MODEL_SELECTION,
            cwd: process.cwd(),
            message: "Fix layout bug from screenshot.",
            attachments: [
              {
                type: "image",
                id: missingAttachmentId,
                name: "outside.png",
                mimeType: "image/png",
                sizeBytes: 5,
              },
            ],
          })
          .pipe(Effect.result);

        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result)) {
          expect(result.failure).toBeInstanceOf(TextGenerationError);
          expect(result.failure.message).toContain("missing --image input");
        }
      }),
    ),
  );

  it.effect(
    "fails with typed TextGenerationError when codex returns wrong branch payload shape",
    () =>
      withFakeCodexEnv(
        {
          output: JSON.stringify({
            title: "This is not a branch payload",
          }),
        },
        Effect.gen(function* () {
          const textGeneration = yield* TextGeneration;

          const result = yield* textGeneration
            .generateBranchName({
              cwd: process.cwd(),
              message: "Fix websocket reconnect flake",
              modelSelection: DEFAULT_TEST_MODEL_SELECTION,
            })
            .pipe(Effect.result);

          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result)) {
            expect(result.failure).toBeInstanceOf(TextGenerationError);
            expect(result.failure.message).toContain("Codex returned invalid structured output");
          }
        }),
      ),
  );

  it.effect("returns typed TextGenerationError when codex exits non-zero", () =>
    withFakeCodexEnv(
      {
        output: JSON.stringify({ subject: "ignored", body: "" }),
        exitCode: 1,
        stderr: "codex execution failed",
      },
      Effect.gen(function* () {
        const textGeneration = yield* TextGeneration;

        const result = yield* textGeneration
          .generateCommitMessage({
            cwd: process.cwd(),
            branch: "feature/codex-error",
            stagedSummary: "M README.md",
            stagedPatch: "diff --git a/README.md b/README.md",
            modelSelection: DEFAULT_TEST_MODEL_SELECTION,
          })
          .pipe(Effect.result);

        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result)) {
          expect(result.failure).toBeInstanceOf(TextGenerationError);
          expect(result.failure.message).toContain(
            "Codex CLI command failed: codex execution failed",
          );
        }
      }),
    ),
  );
});
