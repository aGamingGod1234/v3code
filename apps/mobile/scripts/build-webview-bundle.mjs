#!/usr/bin/env node
/**
 * V3 Phase 9 — stage the cloud-mode web build into
 * `apps/mobile/webview-bundle/` so Capacitor can pick it up as the
 * Android WebView payload.
 *
 * The script is intentionally dependency-free: it only uses Node's
 * `fs`/`path` so CI (which runs the Android build without touching
 * node_modules for the web app) stays lean.
 *
 * Flow:
 *   1. If `apps/web/dist-cloud` is missing, invoke `bun run build:web-cloud`
 *      at the monorepo root to produce it. This keeps the mobile build
 *      self-sufficient — you can run `bun run --cwd apps/mobile build`
 *      after a clean checkout and end up with a usable payload.
 *   2. Copy the cloud-mode `dist-cloud/` tree into `apps/mobile/webview-bundle/`,
 *      replacing any previous contents.
 *   3. Emit `webview-bundle/v3-mobile-config.json` describing the public
 *      URL the Android shell should connect to at runtime. This is what
 *      `apps/mobile/src/runtimeConfig.ts` consumes on boot before the
 *      WebView hands off to the web bundle's router.
 *
 * The resulting `webview-bundle/` directory is bind-mounted into
 * `android/app/src/main/assets/public/` by `bunx cap sync android`,
 * which is what produces the final AAB.
 *
 * Environment variables consumed:
 *
 *   VITE_V3_MOBILE_SERVER_URL   (required for release builds): the
 *                                https URL of the V3 server node the APK
 *                                should talk to. Baked into the bundle
 *                                as the default; users can override via
 *                                Settings → Server Node → Manual URL.
 *   VITE_V3_MOBILE_APP_VERSION  optional: override the version string
 *                                reported in the `hello` payload.
 *   VITE_V3_MOBILE_CHANNEL      optional: "internal" | "closed" | "open";
 *                                used by the release workflow to tag the
 *                                Play Store track.
 */

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mobileDir = resolve(scriptDir, "..");
const monorepoRoot = resolve(mobileDir, "..", "..");
const webCloudDist = join(monorepoRoot, "apps", "web", "dist-cloud");
const bundleOutDir = join(mobileDir, "webview-bundle");

function log(message) {
  process.stdout.write(`[mobile-build] ${message}\n`);
}

function ensureCloudBundle() {
  if (existsSync(join(webCloudDist, "index.html"))) {
    log(`reusing existing cloud bundle at ${webCloudDist}`);
    return;
  }
  log("apps/web/dist-cloud missing — running `bun run build:web-cloud`");
  const command = process.platform === "win32" ? "bun.cmd" : "bun";
  const result = spawnSync(command, ["run", "build:web-cloud"], {
    cwd: monorepoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(
      `build:web-cloud exited with status ${result.status ?? "unknown"}; cannot stage mobile bundle`,
    );
  }
}

function stageBundle() {
  if (existsSync(bundleOutDir)) {
    rmSync(bundleOutDir, { recursive: true, force: true });
  }
  mkdirSync(bundleOutDir, { recursive: true });
  cpSync(webCloudDist, bundleOutDir, { recursive: true });
  log(`copied cloud bundle → ${bundleOutDir}`);
}

function emitRuntimeConfig() {
  const serverUrl = process.env.VITE_V3_MOBILE_SERVER_URL?.trim() ?? "";
  const appVersion = process.env.VITE_V3_MOBILE_APP_VERSION?.trim() ?? "";
  const channel = process.env.VITE_V3_MOBILE_CHANNEL?.trim() ?? "internal";
  const payload = {
    schema_version: 1,
    server_url: serverUrl.length > 0 ? serverUrl : null,
    app_version: appVersion.length > 0 ? appVersion : null,
    channel,
    // `origin_hint` primes the web bundle's `env.ts` fallback before the
    // user has entered a manual URL. When null the app boots into the
    // setup flow instead of attempting a WS connection.
    origin_hint: serverUrl.length > 0 ? new URL(serverUrl).origin : null,
    built_at: new Date().toISOString(),
  };
  writeFileSync(
    join(bundleOutDir, "v3-mobile-config.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
  );
  log(`wrote runtime config (server_url=${payload.server_url ?? "<unset>"})`);
}

function main() {
  ensureCloudBundle();
  stageBundle();
  emitRuntimeConfig();
  log("done.");
}

try {
  main();
} catch (error) {
  process.stderr.write(`[mobile-build] failed: ${error.message}\n`);
  process.exit(1);
}
