#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type Verdict = "block" | "allow";

const BLOCK_PREFIXES = ["apps/", "packages/"] as const;
const ALLOW_PREFIXES = ["v3code-main/"] as const;

export const evaluatePath = (gitRelativePath: string, activePrefix = "v3code-main/"): Verdict => {
  const normalized = gitRelativePath.replace(/\\/g, "/");
  if (activePrefix.length === 0) return "allow";
  for (const allow of ALLOW_PREFIXES) {
    if (normalized.startsWith(allow)) return "allow";
  }
  for (const block of BLOCK_PREFIXES) {
    if (normalized.startsWith(block)) return "block";
  }
  return "allow";
};

export const findBlocked = (
  diffOutput: string,
  activePrefix = "v3code-main/",
): ReadonlyArray<string> =>
  diffOutput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((path) => evaluatePath(path, activePrefix) === "block");

type Mode = "cached" | "head";

const MODE_LABEL: Readonly<Record<Mode, string>> = {
  cached: "staged",
  head: "working-tree",
};

const USAGE = `Usage: node scripts/assert-active-tree.ts [--mode cached|head]

Fails (exit 1) if any modified file lives under the stale outer tree
(apps/ or packages/ at the git root). The active source lives under
v3code-main/ — modifications there are always allowed.

Modes:
  --mode cached   Check files staged for commit (use in pre-commit hooks).
  --mode head     Check the entire working-tree diff vs HEAD (use in CI). Default.`;

const parseArgs = (argv: ReadonlyArray<string>): Mode => {
  let mode: Mode = "head";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${USAGE}\n`);
      process.exit(0);
    }
    if (arg === "--mode") {
      const value = argv[i + 1];
      if (value !== "cached" && value !== "head") {
        process.stderr.write(`${USAGE}\n`);
        process.exit(2);
      }
      mode = value;
      i += 1;
      continue;
    }
    process.stderr.write(`Unknown argument: ${arg}\n${USAGE}\n`);
    process.exit(2);
  }
  return mode;
};

const runGit = (args: ReadonlyArray<string>): string => {
  const proc = spawnSync("git", [...args], { encoding: "utf8" });
  if (proc.status !== 0) {
    process.stderr.write(`git ${args.join(" ")} failed:\n${proc.stderr}\n`);
    process.exit(2);
  }
  return proc.stdout;
};

const tryGit = (args: ReadonlyArray<string>): boolean =>
  spawnSync("git", [...args], { encoding: "utf8" }).status === 0;

const fetchDiff = (mode: Mode, gitRoot: string): string => {
  if (mode === "cached") {
    return runGit(["-C", gitRoot, "diff", "--cached", "--name-only"]);
  }
  if (tryGit(["-C", gitRoot, "rev-parse", "--verify", "HEAD"])) {
    return runGit(["-C", gitRoot, "diff", "--name-only", "HEAD"]);
  }
  return runGit(["-C", gitRoot, "ls-files", "-mo", "--exclude-standard", "--full-name"]);
};

const resolveActivePrefix = (gitRoot: string): string => {
  const rootName = basename(gitRoot).toLowerCase();
  const parentName = basename(dirname(gitRoot)).toLowerCase();
  return rootName === "v3code-main" && parentName === "v3code-main" ? "" : "v3code-main/";
};

const main = (): void => {
  const mode = parseArgs(process.argv.slice(2));
  const gitRoot = runGit(["rev-parse", "--show-toplevel"]).trim();
  const diff = fetchDiff(mode, gitRoot);
  const blocked = findBlocked(diff, resolveActivePrefix(gitRoot));
  const label = MODE_LABEL[mode];
  if (blocked.length === 0) {
    process.stdout.write(`assert-active-tree (${label}): clean.\n`);
    return;
  }
  process.stderr.write(
    `assert-active-tree (${label}): ${blocked.length} file(s) under the stale outer tree:\n` +
      blocked.map((path) => `  - ${path}`).join("\n") +
      `\n\nThe active source lives under v3code-main/ — modify files there instead.\n`,
  );
  process.exit(1);
};

const isMainModule = (): boolean => {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(resolve(entry)).href;
};

if (isMainModule()) {
  main();
}
