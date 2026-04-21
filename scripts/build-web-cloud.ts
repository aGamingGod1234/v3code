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
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptUrl = import.meta.url;
const scriptDir = NodePath.dirname(fileURLToPath(scriptUrl));
const webDir = NodePath.resolve(scriptDir, "..", "apps", "web");

const extra = process.argv.slice(2);

const env: NodeJS.ProcessEnv = {
  ...process.env,
  VITE_V3_CLOUD_MODE: "1",
};
if (!env.VITE_V3_CLOUD_MODE_BASE) {
  env.VITE_V3_CLOUD_MODE_BASE = "/app/";
}

const command = process.platform === "win32" ? "bun.cmd" : "bun";
const args = ["x", "vite", "build", "--outDir", "dist-cloud", "--emptyOutDir", ...extra];

const child = spawn(command, args, {
  cwd: webDir,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
