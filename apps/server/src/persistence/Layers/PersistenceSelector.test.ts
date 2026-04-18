import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { ServerConfig, type ServerConfigShape } from "../../config.ts";
import { PersistenceLive } from "./PersistenceSelector.ts";

const makeBaseConfig = (prefix: string) =>
  Effect.gen(function* () {
    return yield* ServerConfig;
  }).pipe(Effect.provide(ServerConfig.layerTest(process.cwd(), { prefix })));

const makePersistenceLayer = (config: ServerConfigShape) =>
  PersistenceLive.pipe(Layer.provide(Layer.succeed(ServerConfig, config)));

const runSelectOne = (config: ServerConfigShape) =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Layer.build(makePersistenceLayer(config));
      return yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        return yield* sql<{ readonly value: number }>`SELECT 1 AS value`;
      }).pipe(Effect.provide(runtime));
    }),
  );

it.layer(NodeServices.layer)("PersistenceLive", (it) => {
  it.effect("uses SQLite in web mode", () =>
    Effect.gen(function* () {
      const baseConfig = yield* makeBaseConfig("t3-persistence-selector-web-");
      const rows = yield* runSelectOne({
        ...baseConfig,
        mode: "web",
        dbPath: ":memory:",
      });

      expect(rows).toEqual([{ value: 1 }]);
    }),
  );

  it.effect("uses SQLite in desktop mode", () =>
    Effect.gen(function* () {
      const baseConfig = yield* makeBaseConfig("t3-persistence-selector-desktop-");
      const rows = yield* runSelectOne({
        ...baseConfig,
        mode: "desktop",
        dbPath: ":memory:",
      });

      expect(rows).toEqual([{ value: 1 }]);
    }),
  );

  it.effect(
    "fails with PostgresNotConfiguredError in server-node mode when postgresUrl is missing",
    () =>
      Effect.gen(function* () {
        const baseConfig = yield* makeBaseConfig("t3-persistence-selector-server-node-");
        const exit = yield* Effect.scoped(
          Layer.build(
            makePersistenceLayer({
              ...baseConfig,
              mode: "server-node",
              postgresUrl: undefined,
            }),
          ).pipe(Effect.exit),
        );

        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          const error = Cause.squash(exit.cause) as {
            readonly _tag?: string;
            readonly message?: string;
          };
          expect(error._tag).toBe("PostgresNotConfiguredError");
          expect(error.message).toBe(
            "postgresUrl is unset. Set [database].postgres_url in ~/.v3-code-server/config.toml or V3CODE_POSTGRES_URL.",
          );
        }
      }),
  );
});
