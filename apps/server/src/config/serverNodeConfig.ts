// Schema for the `~/.v3-code-server/config.toml` file consumed by V3 Phase
// 2 server-node mode. The full surface area mirrors the master plan §10.4
// (database, cloud_env, limits) so subsequent phases just consume already-
// parsed values; P2a only WIRES the `[server]` and `[auth]` sections into
// the live `ServerConfigShape`. Unwired fields are still validated so a
// malformed config fails fast instead of silently dropping intent.
//
// All fields are optional at the top level — the CLI flag / env var
// precedence in resolveServerConfig falls through to defaults when a TOML
// section is missing or absent. The config file itself is *also* optional;
// detecting a missing file is part of mode resolution, not a Schema concern.

import { TrimmedNonEmptyString } from "@v3tools/contracts";
import { Schema } from "effect";

const TrimmedString = TrimmedNonEmptyString;

// [server] section
export const ServerNodeServerConfig = Schema.Struct({
  public_url: Schema.optional(TrimmedString),
  bind_host: Schema.optional(TrimmedString),
  bind_port: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 65535 }))),
});
export type ServerNodeServerConfig = typeof ServerNodeServerConfig.Type;

// [auth] section
export const ServerNodeAuthConfig = Schema.Struct({
  google_client_id: Schema.optional(TrimmedString),
  google_client_secret: Schema.optional(TrimmedString),
  github_client_id: Schema.optional(TrimmedString),
  github_client_secret: Schema.optional(TrimmedString),
  authorized_emails: Schema.optional(Schema.Array(TrimmedString)),
});
export type ServerNodeAuthConfig = typeof ServerNodeAuthConfig.Type;

// [database] section — wired in P2b
export const ServerNodeDatabaseConfig = Schema.Struct({
  postgres_url: Schema.optional(TrimmedString),
  encryption_key: Schema.optional(TrimmedString),
});
export type ServerNodeDatabaseConfig = typeof ServerNodeDatabaseConfig.Type;

// [cloud_env] section — wired in P8
export const ServerNodeCloudEnvConfig = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  docker_socket: Schema.optional(TrimmedString),
  base_image: Schema.optional(TrimmedString),
  max_containers: Schema.optional(Schema.Int),
  container_cpu_limit: Schema.optional(Schema.Int),
  container_memory_mb: Schema.optional(Schema.Int),
  container_disk_gb: Schema.optional(Schema.Int),
  container_max_runtime_hours: Schema.optional(Schema.Int),
});
export type ServerNodeCloudEnvConfig = typeof ServerNodeCloudEnvConfig.Type;

// [limits] section — wired progressively across P3+
export const ServerNodeLimitsConfig = Schema.Struct({
  max_devices_per_user: Schema.optional(Schema.Int),
  max_chats_per_user: Schema.optional(Schema.Int),
  max_event_log_size_mb: Schema.optional(Schema.Int),
});
export type ServerNodeLimitsConfig = typeof ServerNodeLimitsConfig.Type;

// Top-level document. `mode` is intentionally absent: presence-of-file is
// the mode signal, and the file itself never claims to be the mode source
// of truth (CLI/env still win, see serverMode.ts).
export const ServerNodeConfig = Schema.Struct({
  server: Schema.optional(ServerNodeServerConfig),
  auth: Schema.optional(ServerNodeAuthConfig),
  database: Schema.optional(ServerNodeDatabaseConfig),
  cloud_env: Schema.optional(ServerNodeCloudEnvConfig),
  limits: Schema.optional(ServerNodeLimitsConfig),
});
export type ServerNodeConfig = typeof ServerNodeConfig.Type;
