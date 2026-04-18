// V3 Drive App Data client (renderer-side only).
//
// Thin fetch wrapper over Google Drive's v3 REST API, scoped to the per-
// app `appDataFolder` space. The V3 server never touches Drive — this
// code runs in Electron's renderer today and will run in a future web
// client too. The caller provides a fresh Google OAuth access token on
// every call; this module does not persist it.
//
// Error handling: every method rejects with `V3DriveClientError` carrying
// a discriminated `reason`. Callers decide whether to surface a toast
// (quota-exhausted, unauthorized), retry (network), or log-and-move-on
// (malformed, unexpected-status). Per Lucas's P2c answer, the renderer
// log-and-ignores on quota exhaustion; the error tag is preserved so a
// future Settings → "Clear Drive state" action can re-use it.
//
// Only a single file, `v3_config.json`, is ever created inside
// `appDataFolder`. Structure in ./schema.ts.

import { Schema } from "effect";

import { V3DriveConfig, V3_DRIVE_FILE_NAME, type DriveDeviceEntry } from "./schema.ts";

const DRIVE_FILES_BASE = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3/files";

export type V3DriveClientErrorReason =
  | "unauthorized"
  | "quota-exhausted"
  | "network"
  | "malformed"
  | "unexpected-status";

export class V3DriveClientError extends Error {
  readonly reason: V3DriveClientErrorReason;
  readonly status: number | null;
  readonly body: string;
  constructor(input: {
    readonly reason: V3DriveClientErrorReason;
    readonly message: string;
    readonly status?: number | null;
    readonly body?: string;
    readonly cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "V3DriveClientError";
    this.reason = input.reason;
    this.status = input.status ?? null;
    this.body = input.body ?? "";
  }
}

export interface V3DriveAppDataClient {
  // Finds `v3_config.json` in appDataFolder and decodes it. Resolves to
  // `null` when no file exists yet — callers interpret that as a fresh
  // Google account with no V3 mesh bootstrapped.
  readonly read: (accessToken: string) => Promise<V3DriveConfig | null>;
  // Replaces the blob entirely. Creates it if missing.
  readonly write: (accessToken: string, config: V3DriveConfig) => Promise<void>;
  // Like `read`, but synthesises an empty config if the blob is absent.
  // Does NOT write the synthetic config back.
  readonly readOrInit: (accessToken: string) => Promise<V3DriveConfig>;
  // Reads the blob (or synthesises) and writes back with `entry` appended
  // if it is not already present. De-duped by `device_id`. The caller is
  // responsible for gating this on "should the mesh know about us?" — per
  // the P2c ground rules, only call this once a server_url is known.
  readonly appendDevice: (accessToken: string, entry: DriveDeviceEntry) => Promise<V3DriveConfig>;
}

export interface V3DriveAppDataClientDeps {
  // Injection point for tests; defaults to `globalThis.fetch`.
  readonly fetch?: typeof fetch;
}

const decodeConfig = Schema.decodeUnknownSync(V3DriveConfig);

const readBodySafe = async (response: Response): Promise<string> => {
  try {
    return await response.text();
  } catch {
    return "";
  }
};

// Drive signals the per-app quota being full with an `error.errors[].reason`
// field of `storageQuotaExceeded`. We sniff the raw body rather than
// JSON-parsing so that a non-JSON gateway error page doesn't itself throw.
const looksLikeQuotaExhausted = (body: string): boolean => body.includes("storageQuotaExceeded");

const raiseFailure = async (response: Response): Promise<never> => {
  const body = await readBodySafe(response);
  if (response.status === 403 && looksLikeQuotaExhausted(body)) {
    throw new V3DriveClientError({
      reason: "quota-exhausted",
      message: `Drive App Data quota exhausted (HTTP ${response.status}).`,
      status: response.status,
      body,
    });
  }
  if (response.status === 401 || response.status === 403) {
    throw new V3DriveClientError({
      reason: "unauthorized",
      message: `Drive App Data auth failure (HTTP ${response.status}).`,
      status: response.status,
      body,
    });
  }
  throw new V3DriveClientError({
    reason: "unexpected-status",
    message: `Drive App Data unexpected status (HTTP ${response.status}).`,
    status: response.status,
    body,
  });
};

const safeFetch = async (
  fetchImpl: typeof fetch,
  input: string,
  init?: RequestInit,
): Promise<Response> => {
  try {
    return await fetchImpl(input, init);
  } catch (cause) {
    throw new V3DriveClientError({
      reason: "network",
      message: "Drive App Data network failure.",
      cause,
    });
  }
};

const authHeader = (accessToken: string): Record<string, string> => ({
  Authorization: `Bearer ${accessToken}`,
});

const findFileId = async (fetchImpl: typeof fetch, accessToken: string): Promise<string | null> => {
  const url = new URL(DRIVE_FILES_BASE);
  url.searchParams.set(
    "q",
    `name = '${V3_DRIVE_FILE_NAME}' and 'appDataFolder' in parents and trashed = false`,
  );
  url.searchParams.set("spaces", "appDataFolder");
  url.searchParams.set("fields", "files(id,name)");

  const response = await safeFetch(fetchImpl, url.toString(), {
    headers: authHeader(accessToken),
  });
  if (!response.ok) {
    await raiseFailure(response);
  }
  const json = (await response.json().catch(() => ({}) as unknown)) as {
    readonly files?: ReadonlyArray<{ readonly id?: string; readonly name?: string }>;
  };
  const match = json.files?.find((entry) => entry.name === V3_DRIVE_FILE_NAME);
  return typeof match?.id === "string" && match.id.length > 0 ? match.id : null;
};

const readFileById = async (
  fetchImpl: typeof fetch,
  accessToken: string,
  fileId: string,
): Promise<V3DriveConfig> => {
  const response = await safeFetch(
    fetchImpl,
    `${DRIVE_FILES_BASE}/${encodeURIComponent(fileId)}?alt=media`,
    { headers: authHeader(accessToken) },
  );
  if (!response.ok) {
    await raiseFailure(response);
  }
  const body = await readBodySafe(response);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new V3DriveClientError({
      reason: "malformed",
      message: "Drive App Data blob is not valid JSON.",
      body,
    });
  }
  try {
    return decodeConfig(parsed);
  } catch (cause) {
    throw new V3DriveClientError({
      reason: "malformed",
      message: "Drive App Data blob failed schema decode.",
      body,
      cause,
    });
  }
};

// Drive's `uploadType=multipart` expects a `multipart/related` body with
// exactly two parts: JSON metadata (name, parents), then the payload. CRLF
// line endings are required by the multipart spec; plain \n causes a 400.
const buildMultipartUpload = (
  boundary: string,
  metadata: Record<string, unknown>,
  payload: V3DriveConfig,
): string =>
  [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(payload),
    `--${boundary}--`,
    "",
  ].join("\r\n");

const createFile = async (
  fetchImpl: typeof fetch,
  accessToken: string,
  config: V3DriveConfig,
): Promise<void> => {
  const boundary = `v3-drive-${Math.random().toString(16).slice(2, 18)}`;
  const body = buildMultipartUpload(
    boundary,
    { name: V3_DRIVE_FILE_NAME, parents: ["appDataFolder"] },
    config,
  );
  const response = await safeFetch(fetchImpl, `${DRIVE_UPLOAD_BASE}?uploadType=multipart`, {
    method: "POST",
    headers: {
      ...authHeader(accessToken),
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!response.ok) {
    await raiseFailure(response);
  }
};

const updateFile = async (
  fetchImpl: typeof fetch,
  accessToken: string,
  fileId: string,
  config: V3DriveConfig,
): Promise<void> => {
  const response = await safeFetch(
    fetchImpl,
    `${DRIVE_UPLOAD_BASE}/${encodeURIComponent(fileId)}?uploadType=media`,
    {
      method: "PATCH",
      headers: {
        ...authHeader(accessToken),
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(config),
    },
  );
  if (!response.ok) {
    await raiseFailure(response);
  }
};

export const createV3DriveAppDataClient = (
  deps?: V3DriveAppDataClientDeps,
): V3DriveAppDataClient => {
  const fetchImpl = deps?.fetch ?? globalThis.fetch.bind(globalThis);

  const read: V3DriveAppDataClient["read"] = async (accessToken) => {
    const fileId = await findFileId(fetchImpl, accessToken);
    if (fileId === null) return null;
    return readFileById(fetchImpl, accessToken, fileId);
  };

  const write: V3DriveAppDataClient["write"] = async (accessToken, config) => {
    const fileId = await findFileId(fetchImpl, accessToken);
    if (fileId === null) {
      await createFile(fetchImpl, accessToken, config);
    } else {
      await updateFile(fetchImpl, accessToken, fileId, config);
    }
  };

  const readOrInit: V3DriveAppDataClient["readOrInit"] = async (accessToken) => {
    const existing = await read(accessToken);
    if (existing !== null) return existing;
    return { v3_config: { device_list: [] } };
  };

  const appendDevice: V3DriveAppDataClient["appendDevice"] = async (accessToken, entry) => {
    const current = await readOrInit(accessToken);
    const alreadyPresent = current.v3_config.device_list.some(
      (item) => item.device_id === entry.device_id,
    );
    if (alreadyPresent) return current;
    const next: V3DriveConfig = {
      v3_config: {
        ...current.v3_config,
        device_list: [...current.v3_config.device_list, entry],
      },
    };
    await write(accessToken, next);
    return next;
  };

  return { read, write, readOrInit, appendDevice };
};
