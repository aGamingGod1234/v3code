import { TrimmedNonEmptyString } from "@v3tools/contracts";
import { DateTime, Effect, Layer, Option, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import {
  toPersistenceDecodeError,
  toPersistenceSqlError,
  type PersistenceDecodeError,
  type PersistenceSqlError,
} from "../../persistence/Errors.ts";
import { ServerSecretStore } from "../../auth/Services/ServerSecretStore.ts";
import { decrypt, encrypt } from "../tokenEncryption.ts";
import {
  FcmConfigStatusRow,
  FcmPushConfigRepository,
  FcmServiceAccountConfig,
  TouchDispatchInput,
  UpsertFcmConfigInput,
  type FcmPushConfigRepositoryShape,
} from "../Services/FcmPushConfigRepository.ts";

const ENCRYPTION_KEY_NAME = "v3-token-enc-key";
const ENCRYPTION_KEY_BYTES = 32;
const CONFIG_ROW_ID = "default";

const StatusRowDb = Schema.Struct({
  projectId: TrimmedNonEmptyString,
  clientEmail: TrimmedNonEmptyString,
  uploadedAt: Schema.DateTimeUtcFromString,
  lastDispatchAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  lastError: Schema.NullOr(Schema.String),
});

const ConfigRowDb = Schema.Struct({
  projectId: TrimmedNonEmptyString,
  clientEmail: TrimmedNonEmptyString,
  privateKeyEnc: Schema.Uint8Array,
  privateKeyEncIv: Schema.Uint8Array,
  privateKeyEncAuthTag: Schema.Uint8Array,
  uploadedAt: Schema.DateTimeUtcFromString,
  lastDispatchAt: Schema.NullOr(Schema.DateTimeUtcFromString),
  lastError: Schema.NullOr(Schema.String),
});

const mapErr =
  (sqlOperation: string, decodeOperation: string) =>
  (cause: unknown): PersistenceSqlError | PersistenceDecodeError =>
    Schema.isSchemaError(cause)
      ? toPersistenceDecodeError(decodeOperation)(cause)
      : toPersistenceSqlError(sqlOperation)(cause);

const makeRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const secrets = yield* ServerSecretStore;

  const loadKey = () =>
    secrets
      .getOrCreateRandom(ENCRYPTION_KEY_NAME, ENCRYPTION_KEY_BYTES)
      .pipe(
        Effect.mapError((cause) =>
          toPersistenceSqlError("FcmPushConfigRepository.encryption-key")(cause),
        ),
      );

  const upsertStmt = SqlSchema.void({
    Request: Schema.Struct({
      projectId: TrimmedNonEmptyString,
      clientEmail: TrimmedNonEmptyString,
      privateKeyEnc: Schema.Uint8Array,
      privateKeyEncIv: Schema.Uint8Array,
      privateKeyEncAuthTag: Schema.Uint8Array,
      uploadedAt: Schema.DateTimeUtcFromString,
    }),
    execute: (input) => sql`
      INSERT INTO v3_fcm_config (
        id, project_id, client_email,
        private_key_enc, private_key_enc_iv, private_key_enc_auth_tag,
        uploaded_at, last_dispatch_at, last_error
      ) VALUES (
        ${CONFIG_ROW_ID}, ${input.projectId}, ${input.clientEmail},
        ${input.privateKeyEnc}, ${input.privateKeyEncIv}, ${input.privateKeyEncAuthTag},
        ${input.uploadedAt}, NULL, NULL
      )
      ON CONFLICT(id) DO UPDATE SET
        project_id = excluded.project_id,
        client_email = excluded.client_email,
        private_key_enc = excluded.private_key_enc,
        private_key_enc_iv = excluded.private_key_enc_iv,
        private_key_enc_auth_tag = excluded.private_key_enc_auth_tag,
        uploaded_at = excluded.uploaded_at,
        last_error = NULL
    `,
  });

  const clearStmt = SqlSchema.findAll({
    Request: Schema.Void,
    Result: Schema.Struct({ id: Schema.String }),
    execute: () => sql`
      DELETE FROM v3_fcm_config
      WHERE id = ${CONFIG_ROW_ID}
      RETURNING id AS "id"
    `,
  });

  const selectStatus = SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: StatusRowDb,
    execute: () => sql`
      SELECT
        project_id AS "projectId",
        client_email AS "clientEmail",
        uploaded_at AS "uploadedAt",
        last_dispatch_at AS "lastDispatchAt",
        last_error AS "lastError"
      FROM v3_fcm_config
      WHERE id = ${CONFIG_ROW_ID}
    `,
  });

  const selectConfig = SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: ConfigRowDb,
    execute: () => sql`
      SELECT
        project_id AS "projectId",
        client_email AS "clientEmail",
        private_key_enc AS "privateKeyEnc",
        private_key_enc_iv AS "privateKeyEncIv",
        private_key_enc_auth_tag AS "privateKeyEncAuthTag",
        uploaded_at AS "uploadedAt",
        last_dispatch_at AS "lastDispatchAt",
        last_error AS "lastError"
      FROM v3_fcm_config
      WHERE id = ${CONFIG_ROW_ID}
    `,
  });

  const touchStmt = SqlSchema.void({
    Request: TouchDispatchInput,
    execute: ({ dispatchedAt, error }) => sql`
      UPDATE v3_fcm_config
      SET last_dispatch_at = ${dispatchedAt},
          last_error = ${error}
      WHERE id = ${CONFIG_ROW_ID}
    `,
  });

  const upsert: FcmPushConfigRepositoryShape["upsert"] = (input: UpsertFcmConfigInput) =>
    Effect.gen(function* () {
      const key = yield* loadKey();
      const encrypted = encrypt(input.privateKey, key);
      yield* upsertStmt({
        projectId: input.projectId,
        clientEmail: input.clientEmail,
        privateKeyEnc: encrypted.ciphertext,
        privateKeyEncIv: encrypted.iv,
        privateKeyEncAuthTag: encrypted.authTag,
        uploadedAt: input.uploadedAt,
      }).pipe(
        Effect.mapError(
          mapErr("FcmPushConfigRepository.upsert:query", "FcmPushConfigRepository.upsert:encode"),
        ),
      );
      return {
        projectId: input.projectId,
        clientEmail: input.clientEmail,
        uploadedAt: input.uploadedAt,
        lastDispatchAt: null,
        lastError: null,
      } satisfies FcmConfigStatusRow;
    });

  const clear: FcmPushConfigRepositoryShape["clear"] = () =>
    clearStmt(undefined).pipe(
      Effect.mapError(
        mapErr("FcmPushConfigRepository.clear:query", "FcmPushConfigRepository.clear:decode"),
      ),
      Effect.map((rows) => rows.length > 0),
    );

  const get: FcmPushConfigRepositoryShape["get"] = () =>
    Effect.gen(function* () {
      const rowOpt = yield* selectConfig(undefined).pipe(
        Effect.mapError(
          mapErr("FcmPushConfigRepository.get:query", "FcmPushConfigRepository.get:decode"),
        ),
      );
      if (Option.isNone(rowOpt)) {
        return Option.none<FcmServiceAccountConfig>();
      }
      const key = yield* loadKey();
      const row = rowOpt.value;
      const privateKey = decrypt(
        {
          ciphertext: row.privateKeyEnc,
          iv: row.privateKeyEncIv,
          authTag: row.privateKeyEncAuthTag,
        },
        key,
      );
      return Option.some({
        projectId: row.projectId,
        clientEmail: row.clientEmail,
        privateKey: TrimmedNonEmptyString.make(privateKey),
        uploadedAt: row.uploadedAt,
        lastDispatchAt: row.lastDispatchAt,
        lastError: row.lastError,
      } satisfies FcmServiceAccountConfig);
    });

  const getStatus: FcmPushConfigRepositoryShape["getStatus"] = () =>
    selectStatus(undefined).pipe(
      Effect.mapError(
        mapErr(
          "FcmPushConfigRepository.getStatus:query",
          "FcmPushConfigRepository.getStatus:decode",
        ),
      ),
    );

  const touchDispatch: FcmPushConfigRepositoryShape["touchDispatch"] = (input) =>
    touchStmt(input).pipe(
      Effect.mapError(
        mapErr(
          "FcmPushConfigRepository.touchDispatch:query",
          "FcmPushConfigRepository.touchDispatch:encode",
        ),
      ),
    );

  return {
    upsert,
    clear,
    get,
    getStatus,
    touchDispatch,
  } satisfies FcmPushConfigRepositoryShape;
});

export const FcmPushConfigRepositoryLive = Layer.effect(FcmPushConfigRepository, makeRepository);

// Helper used by both the admin HTTP route and tests: parse the user-
// supplied service-account JSON into the repository input. Keeping it
// pure means we can unit-test validation without a DB.
export const parseServiceAccountJson = (
  raw: string,
  now: DateTime.Utc,
): UpsertFcmConfigInput | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const candidate = parsed as Record<string, unknown>;
  if (candidate.type !== "service_account") return null;
  const projectId = typeof candidate.project_id === "string" ? candidate.project_id.trim() : "";
  const clientEmail =
    typeof candidate.client_email === "string" ? candidate.client_email.trim() : "";
  const privateKey = typeof candidate.private_key === "string" ? candidate.private_key : "";
  if (projectId.length === 0 || clientEmail.length === 0 || privateKey.trim().length === 0) {
    return null;
  }
  return {
    projectId: TrimmedNonEmptyString.make(projectId),
    clientEmail: TrimmedNonEmptyString.make(clientEmail),
    privateKey: TrimmedNonEmptyString.make(privateKey),
    uploadedAt: now,
  };
};
