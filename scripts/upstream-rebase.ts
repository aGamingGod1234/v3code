#!/usr/bin/env node

// V3 upstream-rebase helper — namespace rename codemod.
//
// Applies the V3 namespace renames listed in RENAME_MAPPINGS below. Runs on the
// first fork bootstrap (Phase 0) and again on every upstream integration to
// re-apply renames to incoming upstream changes before merging.
//
// The "dry-run rebase against upstream" conflict-check is done directly in bash
// inside .github/workflows/upstream-conflict-check.yml — no TS wrapper needed.

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Console, Effect, FileSystem, Path } from "effect";
import { Command, Flag } from "effect/unstable/cli";

// ---------------------------------------------------------------------------
// Rename mappings
//
// Every entry here must also be reflected in package.json workspace renames and
// in .docs/MESH_CHANGES.md. New renames require a plan-level discussion first.
// ---------------------------------------------------------------------------

interface RenameMapping {
  readonly from: string;
  readonly to: string;
  readonly note: string;
}

export const RENAME_MAPPINGS: ReadonlyArray<RenameMapping> = [
  { from: "@t3tools/", to: "@v3tools/", note: "npm scope" },
  { from: "T3CODE_", to: "V3CODE_", note: "env var prefix" },
  { from: "~/.t3", to: "~/.v3code", note: "user data dir (string form)" },
  { from: "/.t3/", to: "/.v3code/", note: "user data dir (path form)" },
  { from: '"T3 Code"', to: '"V3 Code"', note: "display name in manifests" },
  { from: "T3Tools.T3Code", to: "aGamingGod1234.V3Code", note: "winget package id" },
];

// Paths that should never be touched by the codemod even if they match.
const EXCLUDED_PATHS: ReadonlyArray<RegExp> = [
  /\/node_modules\//,
  /\/\.git\//,
  /\/dist\//,
  /\/\.turbo\//,
  /\/dist-electron\//,
  /\/\.docs\/MESH_CHANGES\.md$/,
  /\/\.docs\/v3-master-plan\.md$/,
  /\/V3_CODE_SPEC\.md$/,
  /\/scripts\/upstream-rebase\.ts$/,
];

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".mdx",
  ".yml",
  ".yaml",
  ".toml",
  ".css",
  ".html",
  ".astro",
]);

// ---------------------------------------------------------------------------
// rename-v3
// ---------------------------------------------------------------------------

interface RenameStats {
  filesScanned: number;
  filesChanged: number;
  totalReplacements: number;
}

const isExcluded = (candidate: string): boolean => {
  const normalized = candidate.replace(/\\/g, "/");
  return EXCLUDED_PATHS.some((re) => re.test(normalized));
};

const walkTextFiles = Effect.fn("walkTextFiles")(function* (rootDir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const results: string[] = [];
  const stack: string[] = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    const entries = yield* fs.readDirectory(current).pipe(Effect.orElseSucceed(() => []));
    for (const entry of entries) {
      const full = path.join(current, entry);
      const withSlash = full.replace(/\\/g, "/");
      if (isExcluded(withSlash + "/") || isExcluded(withSlash)) continue;
      const stat = yield* fs.stat(full).pipe(Effect.orElseSucceed(() => null));
      if (!stat) continue;
      if (stat.type === "Directory") {
        stack.push(full);
      } else if (stat.type === "File") {
        const ext = path.extname(full).toLowerCase();
        if (TEXT_EXTENSIONS.has(ext)) results.push(full);
      }
    }
  }
  return results;
});

const applyRenamesToFile = Effect.fn("applyRenamesToFile")(function* (filePath: string) {
  const fs = yield* FileSystem.FileSystem;
  const original = yield* fs.readFileString(filePath);
  let updated = original;
  let replacements = 0;
  for (const mapping of RENAME_MAPPINGS) {
    const before = updated;
    updated = updated.split(mapping.from).join(mapping.to);
    if (updated !== before) {
      replacements += before.split(mapping.from).length - 1;
    }
  }
  if (updated !== original) {
    yield* fs.writeFileString(filePath, updated);
    return { changed: true, replacements };
  }
  return { changed: false, replacements: 0 };
});

const runRename = Effect.fn("runRename")(function* (options: {
  readonly rootDir: string;
  readonly dryRun: boolean;
}) {
  const fs = yield* FileSystem.FileSystem;
  const files = yield* walkTextFiles(options.rootDir);
  const stats: RenameStats = { filesScanned: 0, filesChanged: 0, totalReplacements: 0 };
  for (const file of files) {
    stats.filesScanned += 1;
    if (options.dryRun) {
      const content = yield* fs.readFileString(file);
      let replacements = 0;
      for (const mapping of RENAME_MAPPINGS) {
        replacements += content.split(mapping.from).length - 1;
      }
      if (replacements > 0) {
        stats.filesChanged += 1;
        stats.totalReplacements += replacements;
        yield* Console.log(`[dry] ${file}: ${replacements} replacements`);
      }
    } else {
      const result = yield* applyRenamesToFile(file);
      if (result.changed) {
        stats.filesChanged += 1;
        stats.totalReplacements += result.replacements;
        yield* Console.log(`${file}: ${result.replacements} replacements`);
      }
    }
  }
  yield* Console.log("");
  yield* Console.log(
    `Scanned ${stats.filesScanned} files. Changed ${stats.filesChanged}. Total replacements: ${stats.totalReplacements}.`,
  );
  if (options.dryRun) {
    yield* Console.log("(dry-run: no files modified)");
  }
});

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const rootFlag = Flag.string("root").pipe(
  Flag.withDescription("Repository root (defaults to cwd)"),
  Flag.withDefault(process.cwd()),
);
const dryFlag = Flag.boolean("dry").pipe(
  Flag.withDescription("Scan and report without modifying files"),
  Flag.withDefault(false),
);

const renameCommand = Command.make("upstream-rebase", {
  root: rootFlag,
  dry: dryFlag,
}).pipe(
  Command.withDescription("Apply V3 namespace renames to text files in the repo"),
  Command.withHandler((args) =>
    runRename({ rootDir: args.root, dryRun: args.dry }).pipe(Effect.provide(NodeServices.layer)),
  ),
);

if (import.meta.main) {
  Command.run(renameCommand, { version: "0.0.1" }).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
