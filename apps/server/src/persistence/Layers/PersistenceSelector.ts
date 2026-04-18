import { Effect, Layer } from "effect";

import { ServerConfig } from "../../config.ts";
import { makePostgresPersistenceLive, PostgresNotConfiguredError } from "./Postgres.ts";
import { makeSqlitePersistenceLive } from "./Sqlite.ts";

export const resolvePersistenceLive = Effect.gen(function* () {
  const config = yield* ServerConfig;

  if (config.mode === "server-node") {
    if (config.postgresUrl === undefined || config.postgresUrl.length === 0) {
      return yield* new PostgresNotConfiguredError({
        message:
          "postgresUrl is unset. Set [database].postgres_url in ~/.v3-code-server/config.toml or V3CODE_POSTGRES_URL.",
      });
    }

    return makePostgresPersistenceLive({ connectionUrl: config.postgresUrl });
  }

  return makeSqlitePersistenceLive(config.dbPath);
});

export const PersistenceLive = Layer.unwrap(resolvePersistenceLive);
