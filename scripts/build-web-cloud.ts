#!/usr/bin/env node
/**
 * V3 Phase 7 — cloud-mode web build entrypoint.
 *
 * Invokes `vite build` against `apps/web` with `VITE_V3_CLOUD_MODE=1`
 * and emits the result to `apps/web/dist-cloud/`. Cross-platform; no
 * `cross-env` dependency needed because we set the env var in-process
 * before spawning vite.
 *
 * Usage:
 *   bun run build:web-cloud                  # production build
 *   bun run build:web-cloud -- --watch       # any extra flags get forwarded
 *
 * The server-node `cloudModeStaticDir` resolver prefers this `dist-cloud`
 * location so a build in-place is picked up automatically; the Cloudflare
 * Pages deploy template (`deploy/cloudflare-pages/`) also points at
 * `apps/web/dist-cloud`.
 */

import * as NodePath from "node:path";
import * as FS from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptUrl = import.meta.url;
const scriptDir = NodePath.dirname(fileURLToPath(scriptUrl));
const webDir = NodePath.resolve(scriptDir, "..", "apps", "web");
const distCloudDir = NodePath.resolve(webDir, "dist-cloud");

const extra = process.argv.slice(2);
const bunFromLifecycle = process.env.npm_execpath;
const bunExecutable =
  bunFromLifecycle && /(^|[\\/])bun(\.exe|\.cmd)?$/i.test(bunFromLifecycle)
    ? bunFromLifecycle
    : "bun";
const needsWindowsShellFallback = process.platform === "win32" && bunExecutable === "bun";

const env: NodeJS.ProcessEnv = {
  ...process.env,
  VITE_V3_CLOUD_MODE: "1",
};
if (!env.VITE_V3_CLOUD_MODE_BASE) {
  env.VITE_V3_CLOUD_MODE_BASE = "/app/";
}

const args = ["x", "vite", "build", "--outDir", "dist-cloud", "--emptyOutDir", ...extra];
const isWatchMode = extra.includes("--watch") || extra.includes("-w");
const cloudModeBase = env.VITE_V3_CLOUD_MODE_BASE?.replace(/\/+$/, "") ?? "";

const mirrorAppBaseForStaticHosts = async (): Promise<void> => {
  if (cloudModeBase !== "/app") {
    return;
  }

  const appDir = NodePath.join(distCloudDir, "app");
  await FS.rm(appDir, { recursive: true, force: true });
  await FS.mkdir(appDir, { recursive: true });
  await FS.copyFile(NodePath.join(distCloudDir, "index.html"), NodePath.join(appDir, "index.html"));
  await FS.cp(NodePath.join(distCloudDir, "assets"), NodePath.join(appDir, "assets"), {
    recursive: true,
  });
};

const child = spawn(bunExecutable, args, {
  cwd: webDir,
  env,
  stdio: "inherit",
  shell: needsWindowsShellFallback,
});

child.on("error", (error) => {
  console.error(`Failed to start Bun for cloud web build: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  if (code !== 0 || isWatchMode) {
    process.exit(code ?? 1);
    return;
  }

  void mirrorAppBaseForStaticHosts()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`Failed to mirror cloud build under /app: ${error.message}`);
      process.exit(1);
    });
});
