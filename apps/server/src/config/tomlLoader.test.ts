import * as Crypto from "node:crypto";
import * as OS from "node:os";
import * as Path from "node:path";

import { assert, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Effect, FileSystem, Option } from "effect";

import { loadServerNodeConfig, ServerNodeConfigError } from "./tomlLoader.ts";

// Write a TOML payload to a unique temp path. We deliberately do NOT use
// `makeTempDirectoryScoped` here because it requires the test to be wrapped
// in `Effect.scoped`, which mixes awkwardly with @effect/vitest's `it.effect`.
// OS temp directories are reaped by the OS, so leaking is harmless in CI.
const writeTempConfig = Effect.fn(function* (contents: string) {
  const fs = yield* FileSystem.FileSystem;
  const dir = Path.join(OS.tmpdir(), `v3-toml-loader-${Crypto.randomBytes(6).toString("hex")}`);
  yield* fs.makeDirectory(dir, { recursive: true });
  const path = Path.join(dir, "config.toml");
  yield* fs.writeFileString(path, contents);
  return path;
});

const layer = it.layer(NodeServices.layer);

layer("loadServerNodeConfig", (it) => {
  it.effect("returns Option.none() when the file is absent", () =>
    Effect.gen(function* () {
      const result = yield* loadServerNodeConfig("/definitely/does/not/exist/config.toml");
      assert.isTrue(Option.isNone(result));
    }),
  );

  it.effect("decodes a minimal valid config (only [server] populated)", () =>
    Effect.gen(function* () {
      const path = yield* writeTempConfig(
        `
[server]
bind_host = "0.0.0.0"
bind_port = 8080
        `.trim(),
      );
      const result = yield* loadServerNodeConfig(path);
      assert.isTrue(Option.isSome(result));
      const config = Option.getOrThrow(result);
      expect(config.server?.bind_host).toBe("0.0.0.0");
      expect(config.server?.bind_port).toBe(8080);
      expect(config.auth).toBeUndefined();
      expect(config.database).toBeUndefined();
    }),
  );

  it.effect("decodes the full master-plan §10.4 example config", () =>
    Effect.gen(function* () {
      const path = yield* writeTempConfig(
        `
[server]
public_url = "https://v3.agaminggod.com"
bind_host = "0.0.0.0"
bind_port = 8080

[auth]
google_client_id = "abc123.apps.googleusercontent.com"
google_client_secret = "shhh"
github_client_id = "Iv1.deadbeef"
github_client_secret = "ghs_xxx"
authorized_emails = ["lucas@gmail.com", "lucas+work@gmail.com"]

[database]
postgres_url = "postgres://v3:v3@localhost/v3"
encryption_key = "base64key"

[cloud_env]
enabled = true
docker_socket = "/var/run/docker.sock"
base_image = "ghcr.io/v3-code/cloud-env:latest"
max_containers = 10
container_cpu_limit = 2
container_memory_mb = 4096
container_disk_gb = 20
container_max_runtime_hours = 720

[limits]
max_devices_per_user = 20
max_chats_per_user = 10000
max_event_log_size_mb = 100000
        `.trim(),
      );
      const config = Option.getOrThrow(yield* loadServerNodeConfig(path));
      expect(config.server?.public_url).toBe("https://v3.agaminggod.com");
      expect(config.auth?.authorized_emails).toEqual(["lucas@gmail.com", "lucas+work@gmail.com"]);
      expect(config.database?.postgres_url).toBe("postgres://v3:v3@localhost/v3");
      expect(config.cloud_env?.enabled).toBe(true);
      expect(config.cloud_env?.max_containers).toBe(10);
      expect(config.limits?.max_event_log_size_mb).toBe(100000);
    }),
  );

  it.effect("surfaces ServerNodeConfigError(reason: 'parse') on malformed TOML", () =>
    Effect.gen(function* () {
      const path = yield* writeTempConfig("[server\nbind_port = not-a-number");
      const error = yield* Effect.flip(loadServerNodeConfig(path));
      expect(error).toBeInstanceOf(ServerNodeConfigError);
      expect(error.reason).toBe("parse");
      expect(error.path).toBe(path);
    }),
  );

  it.effect("surfaces ServerNodeConfigError(reason: 'schema') on type mismatch", () =>
    Effect.gen(function* () {
      const path = yield* writeTempConfig(
        `
[server]
bind_port = "not-a-number-but-a-string"
        `.trim(),
      );
      const error = yield* Effect.flip(loadServerNodeConfig(path));
      expect(error).toBeInstanceOf(ServerNodeConfigError);
      expect(error.reason).toBe("schema");
    }),
  );

  it.effect("rejects out-of-range port numbers via the schema check", () =>
    Effect.gen(function* () {
      const path = yield* writeTempConfig(
        `
[server]
bind_port = 99999
        `.trim(),
      );
      const error = yield* Effect.flip(loadServerNodeConfig(path));
      expect(error).toBeInstanceOf(ServerNodeConfigError);
      expect(error.reason).toBe("schema");
    }),
  );

  it.effect("accepts an empty file (all sections optional)", () =>
    Effect.gen(function* () {
      const path = yield* writeTempConfig("");
      const config = Option.getOrThrow(yield* loadServerNodeConfig(path));
      expect(config.server).toBeUndefined();
      expect(config.auth).toBeUndefined();
    }),
  );
});
