// Runtime-mode resolution for V3 Phase 2.
//
// V3 introduces a third `RuntimeMode` literal (`server-node`) on top of
// the existing T3 `web | desktop` pair. The detection precedence,
// per master plan §4, is:
//
//   1. CLI flag `--mode server-node`
//   2. Env var `V3CODE_MODE=server-node`
//   3. Presence of `~/.v3-code-server/config.toml`
//   4. Fall through to today's `web | desktop` detection
//
// This module owns step 3 — the path resolution and presence check —
// plus a small precedence helper used by `resolveServerConfig`. The
// per-field merging (TOML overrides defaults but loses to env/CLI) lives
// in cli.ts so existing flows can keep their precedence shape.
//
// `V3CODE_SERVER_CONFIG_PATH` overrides the default location; tests rely
// on this to point at a temp file without touching the real home dir.

import * as OS from "node:os";
import * as Path from "node:path";

import { Effect, FileSystem, Option } from "effect";

import type { RuntimeMode } from "./config.ts";

export const SERVER_NODE_CONFIG_DIR_NAME = ".v3-code-server";
export const SERVER_NODE_CONFIG_FILE_NAME = "config.toml";
export const SERVER_NODE_CONFIG_ENV_VAR = "V3CODE_SERVER_CONFIG_PATH";

// Resolve where the server-node config.toml lives. Pure: no IO.
export const resolveServerNodeConfigPath = (
  env: Record<string, string | undefined> = process.env,
  homeDir: string = OS.homedir(),
): string => {
  const overridden = env[SERVER_NODE_CONFIG_ENV_VAR]?.trim();
  if (overridden && overridden.length > 0) return overridden;
  return Path.join(homeDir, SERVER_NODE_CONFIG_DIR_NAME, SERVER_NODE_CONFIG_FILE_NAME);
};

// Filesystem check. Returns true if the resolved path exists. Errors
// (e.g. permission denied while statting) are treated as "not present"
// since the user-facing intent is "should we treat this as a server node?"
// and a config we cannot read is functionally absent.
export const hasServerNodeConfig = Effect.fn(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.exists(path).pipe(Effect.orElseSucceed(() => false));
});

// Inputs for full mode resolution. Shaped as Options so callers can plug
// in CLI/env values directly without coercing to undefined first.
export interface ServerModeInputs {
  readonly cliMode: Option.Option<RuntimeMode>;
  readonly envMode: Option.Option<RuntimeMode>;
  readonly bootstrapMode: Option.Option<RuntimeMode>;
  readonly hasConfigToml: boolean;
  readonly fallback: RuntimeMode;
}

// Apply the master-plan §4 precedence. Pure helper; the IO of checking
// `hasConfigToml` is the caller's responsibility (so the same precedence
// is testable with stubbed filesystem state).
export const resolveServerMode = (inputs: ServerModeInputs): RuntimeMode => {
  const explicit = Option.firstSomeOf<RuntimeMode>([
    inputs.cliMode,
    inputs.envMode,
    inputs.bootstrapMode,
  ]);
  if (Option.isSome(explicit)) return explicit.value;
  if (inputs.hasConfigToml) return "server-node";
  return inputs.fallback;
};
