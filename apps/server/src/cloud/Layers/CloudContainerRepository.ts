import {
  CloudContainerStatus,
  NonNegativeInt,
  ThreadId,
  TrimmedNonEmptyString,
  UserId,
} from "@v3tools/contracts";
import { Effect, Layer, Option, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import {
  toPersistenceDecodeError,
  toPersistenceSqlError,
  type PersistenceDecodeError,
  type PersistenceSqlError,
} from "../../persistence/Errors.ts";
import {
  CloudContainerRepository,
  type CloudContainerRepositoryShape,
  CloudContainerRecord,
  GetByChatInput,
  ListForUserInput,
  UpdateStatusInput,
  UpsertCloudContainerInput,
} from "../Services/CloudContainerRepository.ts";

const CloudContainerDbRow = Schema.Struct({
  chatId: ThreadId,
  userId: UserId,
  containerId: TrimmedNonEmptyString,
  image: TrimmedNonEmptyString,
  githubRepo: Schema.NullOr(TrimmedNonEmptyString),
  githubBranch: Schema.NullOr(TrimmedNonEmptyString),
  status: CloudContainerStatus,
  statusMessage: Schema.NullOr(Schema.String),
  cpuLimit: NonNegativeInt,
  memoryMb: NonNegativeInt,
  diskGb: NonNegativeInt,
  startedAt: Schema.DateTimeUtcFromString,
  readyAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  endedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  lastCheckedAt: Schema.NullOr(Schema.DateTimeUtcFromString),
});

const mapErr =
  (sqlOperation: string, decodeOperation: string) =>
  (cause: unknown): PersistenceSqlError | PersistenceDecodeError =>
    Schema.isSchemaError(cause)
      ? toPersistenceDecodeError(decodeOperation)(cause)
      : toPersistenceSqlError(sqlOperation)(cause);

const toRecord = (row: typeof CloudContainerDbRow.Type): CloudContainerRecord => row;

const makeCloudContainerRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const upsertRows = SqlSchema.findAll({
    Request: UpsertCloudContainerInput,
    Result: CloudContainerDbRow,
    execute: (input) =>
      sql`
        INSERT INTO v3_cloud_containers (
          chat_id, user_id, container_id, image, github_repo, github_branch,
          status, status_message, cpu_limit, memory_mb, disk_gb,
          started_at, ready_at, ended_at, last_checked_at
        ) VALUES (
          ${input.chatId}, ${input.userId}, ${input.containerId}, ${input.image},
          ${input.githubRepo}, ${input.githubBranch},
          ${input.status}, ${input.statusMessage},
          ${input.cpuLimit}, ${input.memoryMb}, ${input.diskGb},
          ${input.startedAt}, NULL, NULL, ${input.startedAt}
        )
        ON CONFLICT(chat_id) DO UPDATE SET
          container_id = excluded.container_id,
          image = excluded.image,
          github_repo = excluded.github_repo,
          github_branch = excluded.github_branch,
          status = excluded.status,
          status_message = excluded.status_message,
          cpu_limit = excluded.cpu_limit,
          memory_mb = excluded.memory_mb,
          disk_gb = excluded.disk_gb,
          started_at = excluded.started_at,
          last_checked_at = excluded.last_checked_at
        RETURNING
          chat_id AS "chatId",
          user_id AS "userId",
          container_id AS "containerId",
          image AS "image",
          github_repo AS "githubRepo",
          github_branch AS "githubBranch",
          status AS "status",
          status_message AS "statusMessage",
          cpu_limit AS "cpuLimit",
          memory_mb AS "memoryMb",
          disk_gb AS "diskGb",
          started_at AS "startedAt",
          ready_at AS "readyAt",
          ended_at AS "endedAt",
          last_checked_at AS "lastCheckedAt"
      `,
  });

  const updateStatusRows = SqlSchema.findAll({
    Request: UpdateStatusInput,
    Result: CloudContainerDbRow,
    execute: (input) => {
      const statusMessage =
        input.statusMessage === undefined ? sql`status_message` : sql`${input.statusMessage}`;
      const readyAt = input.readyAt === undefined ? sql`ready_at` : sql`${input.readyAt}`;
      const endedAt = input.endedAt === undefined ? sql`ended_at` : sql`${input.endedAt}`;
      return sql`
        UPDATE v3_cloud_containers SET
          status = ${input.status},
          status_message = ${statusMessage},
          ready_at = ${readyAt},
          ended_at = ${endedAt},
          last_checked_at = ${input.lastCheckedAt}
        WHERE chat_id = ${input.chatId}
        RETURNING
          chat_id AS "chatId",
          user_id AS "userId",
          container_id AS "containerId",
          image AS "image",
          github_repo AS "githubRepo",
          github_branch AS "githubBranch",
          status AS "status",
          status_message AS "statusMessage",
          cpu_limit AS "cpuLimit",
          memory_mb AS "memoryMb",
          disk_gb AS "diskGb",
          started_at AS "startedAt",
          ready_at AS "readyAt",
          ended_at AS "endedAt",
          last_checked_at AS "lastCheckedAt"
      `;
    },
  });

  const getByChat = SqlSchema.findOneOption({
    Request: GetByChatInput,
    Result: CloudContainerDbRow,
    execute: ({ chatId }) =>
      sql`
        SELECT
          chat_id AS "chatId",
          user_id AS "userId",
          container_id AS "containerId",
          image AS "image",
          github_repo AS "githubRepo",
          github_branch AS "githubBranch",
          status AS "status",
          status_message AS "statusMessage",
          cpu_limit AS "cpuLimit",
          memory_mb AS "memoryMb",
          disk_gb AS "diskGb",
          started_at AS "startedAt",
          ready_at AS "readyAt",
          ended_at AS "endedAt",
          last_checked_at AS "lastCheckedAt"
        FROM v3_cloud_containers
        WHERE chat_id = ${chatId}
      `,
  });

  const listForUser = SqlSchema.findAll({
    Request: ListForUserInput,
    Result: CloudContainerDbRow,
    execute: ({ userId, includeEnded }) => {
      // `includeEnded` defaults to false — callers like the sidebar
      // only want live containers. The admin panel opts in.
      const includeEndedResolved = includeEnded === true;
      return includeEndedResolved
        ? sql`
            SELECT
              chat_id AS "chatId",
              user_id AS "userId",
              container_id AS "containerId",
              image AS "image",
              github_repo AS "githubRepo",
              github_branch AS "githubBranch",
              status AS "status",
              status_message AS "statusMessage",
              cpu_limit AS "cpuLimit",
              memory_mb AS "memoryMb",
              disk_gb AS "diskGb",
              started_at AS "startedAt",
              ready_at AS "readyAt",
              ended_at AS "endedAt",
              last_checked_at AS "lastCheckedAt"
            FROM v3_cloud_containers
            WHERE user_id = ${userId}
            ORDER BY started_at DESC
          `
        : sql`
            SELECT
              chat_id AS "chatId",
              user_id AS "userId",
              container_id AS "containerId",
              image AS "image",
              github_repo AS "githubRepo",
              github_branch AS "githubBranch",
              status AS "status",
              status_message AS "statusMessage",
              cpu_limit AS "cpuLimit",
              memory_mb AS "memoryMb",
              disk_gb AS "diskGb",
              started_at AS "startedAt",
              ready_at AS "readyAt",
              ended_at AS "endedAt",
              last_checked_at AS "lastCheckedAt"
            FROM v3_cloud_containers
            WHERE user_id = ${userId}
              AND status NOT IN ('dead','error')
            ORDER BY started_at DESC
          `;
    },
  });

  const upsert: CloudContainerRepositoryShape["upsert"] = (input) =>
    upsertRows(input).pipe(
      Effect.mapError(
        mapErr("CloudContainerRepository.upsert:query", "CloudContainerRepository.upsert:decode"),
      ),
      Effect.flatMap((rows) => {
        const first = rows[0];
        return first === undefined
          ? Effect.fail(
              toPersistenceSqlError("CloudContainerRepository.upsert:missing-returning")(
                new Error("INSERT ... RETURNING produced no row"),
              ),
            )
          : Effect.succeed(toRecord(first));
      }),
    );

  const updateStatus: CloudContainerRepositoryShape["updateStatus"] = (input) =>
    updateStatusRows(input).pipe(
      Effect.mapError(
        mapErr(
          "CloudContainerRepository.updateStatus:query",
          "CloudContainerRepository.updateStatus:decode",
        ),
      ),
      Effect.flatMap((rows) => {
        const first = rows[0];
        return first === undefined
          ? Effect.fail(
              toPersistenceSqlError("CloudContainerRepository.updateStatus:missing-row")(
                new Error(`No cloud_container row for chat ${input.chatId}`),
              ),
            )
          : Effect.succeed(toRecord(first));
      }),
    );

  const getByChatImpl: CloudContainerRepositoryShape["getByChat"] = (input) =>
    getByChat(input).pipe(
      Effect.mapError(
        mapErr(
          "CloudContainerRepository.getByChat:query",
          "CloudContainerRepository.getByChat:decode",
        ),
      ),
      Effect.map((opt) => Option.map(opt, toRecord)),
    );

  const listForUserImpl: CloudContainerRepositoryShape["listForUser"] = (input) =>
    listForUser(input).pipe(
      Effect.mapError(
        mapErr(
          "CloudContainerRepository.listForUser:query",
          "CloudContainerRepository.listForUser:decode",
        ),
      ),
      Effect.map((rows) => rows.map(toRecord)),
    );

  // Route listActive through SqlSchema.findAll with a no-op Request
  // shape so the row decoder + error mapping matches the other
  // methods (avoids hand-rolling the Schema.decode call).
  const listActiveRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: CloudContainerDbRow,
    execute: () => sql`
      SELECT
        chat_id AS "chatId",
        user_id AS "userId",
        container_id AS "containerId",
        image AS "image",
        github_repo AS "githubRepo",
        github_branch AS "githubBranch",
        status AS "status",
        status_message AS "statusMessage",
        cpu_limit AS "cpuLimit",
        memory_mb AS "memoryMb",
        disk_gb AS "diskGb",
        started_at AS "startedAt",
        ready_at AS "readyAt",
        ended_at AS "endedAt",
        last_checked_at AS "lastCheckedAt"
      FROM v3_cloud_containers
      WHERE status NOT IN ('dead','error')
      ORDER BY started_at DESC
    `,
  });

  const listActive: CloudContainerRepositoryShape["listActive"] = listActiveRows(undefined).pipe(
    Effect.mapError(
      mapErr(
        "CloudContainerRepository.listActive:query",
        "CloudContainerRepository.listActive:decode",
      ),
    ),
    Effect.map((rows) => rows.map(toRecord)),
  );

  return {
    upsert,
    updateStatus,
    getByChat: getByChatImpl,
    listForUser: listForUserImpl,
    listActive,
  } satisfies CloudContainerRepositoryShape;
});

export const CloudContainerRepositoryLive = Layer.effect(
  CloudContainerRepository,
  makeCloudContainerRepository,
);
