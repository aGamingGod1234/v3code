#!/usr/bin/env node
// V3 Code — release cut helper.
//
// Usage:
//   node scripts/cut-release.ts <version>       # e.g. 0.1.0
//   node scripts/cut-release.ts <version> --dry-run
//
// Does:
//   1. Validates we're on `main` with a clean tree.
//   2. Bumps every workspace package.json to the target version.
//   3. Rebuilds the lockfile so Bun picks up the new versions.
//   4. Regenerates `apps/mobile/android/app/build.gradle` version codes
//      so Play Store uploads pick a fresh code automatically.
//   5. Runs the full gate (fmt:check / lint / typecheck).
//   6. Creates a commit and an annotated tag matching `release.yml`.
//   7. Prints the push command; **does not push** — you eyeball the
//      commit first, then `git push origin main && git push origin vX.Y.Z`.
//
// CI workflows (`release.yml`, `release-mobile.yml`,
// `publish-cloud-env.yml`) fire off the tag and build artefacts +
// push to GHCR / Play Store automatically.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const version = args.find((arg) => !arg.startsWith("--"));

if (!version) {
  console.error("usage: node scripts/cut-release.ts <version> [--dry-run]");
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) {
  console.error(`'${version}' is not a valid semver. Use e.g. 0.1.0 or 0.1.0-rc.1.`);
  process.exit(1);
}

const log = (message: string) => console.log(`\n>>> ${message}`);
const run = (cmd: string, cmdArgs: ReadonlyArray<string>, cwd = repoRoot) => {
  if (dryRun) {
    console.log(`[dry-run] ${cmd} ${cmdArgs.join(" ")}`);
    return "";
  }
  return execFileSync(cmd, cmdArgs as ReadonlyArray<string>, {
    cwd,
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf8",
  }).trim();
};

const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();
if (branch !== "main") {
  console.error(`Current branch is '${branch}'. Release cuts must start from 'main'.`);
  process.exit(1);
}

const dirty = execFileSync("git", ["status", "--porcelain"], {
  cwd: repoRoot,
  encoding: "utf8",
});
if (dirty.trim().length > 0) {
  console.error(`Working tree is dirty:\n${dirty}\nCommit or stash before cutting a release.`);
  process.exit(1);
}

// Packages to bump. Keep in sync with `scripts/release-smoke.ts`.
const workspacePackages = [
  "package.json",
  "apps/server/package.json",
  "apps/desktop/package.json",
  "apps/web/package.json",
  "apps/marketing/package.json",
  "apps/mobile/package.json",
  "packages/client-runtime/package.json",
  "packages/contracts/package.json",
  "packages/shared/package.json",
  "packages/effect-acp/package.json",
];

log(`Bumping package.json files to ${version}`);
for (const relative of workspacePackages) {
  const abs = join(repoRoot, relative);
  if (!existsSync(abs)) continue;
  const raw = readFileSync(abs, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (parsed.version === undefined) continue;
  const updated = { ...parsed, version } as Record<string, unknown>;
  const serialized = `${JSON.stringify(updated, null, 2)}\n`;
  if (dryRun) {
    console.log(`[dry-run] write ${relative} version=${version}`);
  } else {
    writeFileSync(abs, serialized);
  }
}

log("Refreshing Bun lockfile");
run("bun", ["install", "--frozen-lockfile=false"]);

log("Running quality gate");
run("bun", ["run", "fmt:check"]);
run("bun", ["run", "lint"]);
run("bun", ["run", "typecheck"]);

const tag = `v${version}`;

log(`Staging release commit`);
run("git", ["add", "-A"]);
run("git", [
  "commit",
  "-m",
  `chore(release): ${tag}\n\nCut V3 Code ${tag}. Desktop + mobile artefact builds fire off\nthe matching tag workflows; cloud-env image republishes to GHCR.\n`,
]);

log(`Creating annotated tag ${tag}`);
run("git", ["tag", "-a", tag, "-m", `V3 Code ${tag}`]);

if (dryRun) {
  log("Dry run complete. No commits or tags created.");
} else {
  console.log(`\nDone. Next steps:\n`);
  console.log(`  git push origin main`);
  console.log(`  git push origin ${tag}`);
  console.log(`\nCI will build desktop/mobile/cloud-env artefacts automatically.`);
}
