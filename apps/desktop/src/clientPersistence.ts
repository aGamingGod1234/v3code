import * as FS from "node:fs";
import * as Path from "node:path";

import {
  ClientSettingsSchema,
  GoogleTokenBundle,
  type GoogleTokenBundle as GoogleTokenBundleValue,
  type ClientSettings,
  type PersistedSavedEnvironmentRecord,
} from "@v3tools/contracts";
import { Predicate } from "effect";
import * as Schema from "effect/Schema";

interface ClientSettingsDocument {
  readonly settings: ClientSettings;
}

interface PersistedSavedEnvironmentStorageRecord extends PersistedSavedEnvironmentRecord {
  readonly encryptedBearerToken?: string;
}

interface SavedEnvironmentRegistryDocument {
  readonly records: readonly PersistedSavedEnvironmentStorageRecord[];
}

interface GoogleTokenDocument {
  readonly encryptedTokens?: string;
}

export interface DesktopSecretStorage {
  readonly isEncryptionAvailable: () => boolean;
  readonly encryptString: (value: string) => Buffer;
  readonly decryptString: (value: Buffer) => string;
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!FS.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(FS.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  const directory = Path.dirname(filePath);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  FS.mkdirSync(directory, { recursive: true });
  FS.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  FS.renameSync(tempPath, filePath);
}

function isPersistedSavedEnvironmentStorageRecord(
  value: unknown,
): value is PersistedSavedEnvironmentStorageRecord {
  return (
    Predicate.isObject(value) &&
    typeof value.environmentId === "string" &&
    typeof value.label === "string" &&
    typeof value.httpBaseUrl === "string" &&
    typeof value.wsBaseUrl === "string" &&
    typeof value.createdAt === "string" &&
    (value.lastConnectedAt === null || typeof value.lastConnectedAt === "string") &&
    (value.encryptedBearerToken === undefined || typeof value.encryptedBearerToken === "string")
  );
}

function readSavedEnvironmentRegistryDocument(filePath: string): SavedEnvironmentRegistryDocument {
  const parsed = readJsonFile<SavedEnvironmentRegistryDocument>(filePath);
  if (!Predicate.isObject(parsed)) {
    return { records: [] };
  }

  return {
    records: Array.isArray(parsed.records)
      ? parsed.records.filter(isPersistedSavedEnvironmentStorageRecord)
      : [],
  };
}

function toPersistedSavedEnvironmentRecord(
  record: PersistedSavedEnvironmentStorageRecord,
): PersistedSavedEnvironmentRecord {
  return {
    environmentId: record.environmentId,
    label: record.label,
    httpBaseUrl: record.httpBaseUrl,
    wsBaseUrl: record.wsBaseUrl,
    createdAt: record.createdAt,
    lastConnectedAt: record.lastConnectedAt,
  };
}

export function readClientSettings(settingsPath: string): ClientSettings | null {
  const raw = readJsonFile<ClientSettingsDocument>(settingsPath)?.settings;
  if (!raw) {
    return null;
  }
  try {
    return Schema.decodeUnknownSync(ClientSettingsSchema)(raw);
  } catch {
    return null;
  }
}

export function writeClientSettings(settingsPath: string, settings: ClientSettings): void {
  writeJsonFile(settingsPath, { settings } satisfies ClientSettingsDocument);
}

export function readSavedEnvironmentRegistry(
  registryPath: string,
): readonly PersistedSavedEnvironmentRecord[] {
  return readSavedEnvironmentRegistryDocument(registryPath).records.map((record) =>
    toPersistedSavedEnvironmentRecord(record),
  );
}

export function writeSavedEnvironmentRegistry(
  registryPath: string,
  records: readonly PersistedSavedEnvironmentRecord[],
): void {
  const currentDocument = readSavedEnvironmentRegistryDocument(registryPath);
  const encryptedBearerTokenById = new Map(
    currentDocument.records.flatMap((record) =>
      record.encryptedBearerToken
        ? [[record.environmentId, record.encryptedBearerToken] as const]
        : [],
    ),
  );
  writeJsonFile(registryPath, {
    records: records.map((record) => {
      const encryptedBearerToken = encryptedBearerTokenById.get(record.environmentId);
      return encryptedBearerToken
        ? {
            environmentId: record.environmentId,
            label: record.label,
            httpBaseUrl: record.httpBaseUrl,
            wsBaseUrl: record.wsBaseUrl,
            createdAt: record.createdAt,
            lastConnectedAt: record.lastConnectedAt,
            encryptedBearerToken,
          }
        : record;
    }),
  } satisfies SavedEnvironmentRegistryDocument);
}

export function readSavedEnvironmentSecret(input: {
  readonly registryPath: string;
  readonly environmentId: string;
  readonly secretStorage: DesktopSecretStorage;
}): string | null {
  const document = readSavedEnvironmentRegistryDocument(input.registryPath);
  const encoded = document.records.find(
    (record) => record.environmentId === input.environmentId,
  )?.encryptedBearerToken;
  if (!encoded) {
    return null;
  }

  if (!input.secretStorage.isEncryptionAvailable()) {
    return null;
  }

  try {
    return input.secretStorage.decryptString(Buffer.from(encoded, "base64"));
  } catch {
    return null;
  }
}

export function writeSavedEnvironmentSecret(input: {
  readonly registryPath: string;
  readonly environmentId: string;
  readonly secret: string;
  readonly secretStorage: DesktopSecretStorage;
}): boolean {
  const document = readSavedEnvironmentRegistryDocument(input.registryPath);

  if (!input.secretStorage.isEncryptionAvailable()) {
    return false;
  }

  let found = false;

  writeJsonFile(input.registryPath, {
    records: document.records.map((record) => {
      if (record.environmentId !== input.environmentId) {
        return record;
      }

      found = true;
      const encryptedBearerToken = input.secretStorage
        .encryptString(input.secret)
        .toString("base64");
      return {
        environmentId: record.environmentId,
        label: record.label,
        httpBaseUrl: record.httpBaseUrl,
        wsBaseUrl: record.wsBaseUrl,
        createdAt: record.createdAt,
        lastConnectedAt: record.lastConnectedAt,
        encryptedBearerToken,
      } satisfies PersistedSavedEnvironmentStorageRecord;
    }),
  } satisfies SavedEnvironmentRegistryDocument);
  return found;
}

export function removeSavedEnvironmentSecret(input: {
  readonly registryPath: string;
  readonly environmentId: string;
}): void {
  const document = readSavedEnvironmentRegistryDocument(input.registryPath);
  if (
    !document.records.some(
      (record) =>
        record.environmentId === input.environmentId && record.encryptedBearerToken !== undefined,
    )
  ) {
    return;
  }

  writeJsonFile(input.registryPath, {
    records: document.records.map((record) => {
      if (record.environmentId !== input.environmentId) {
        return record;
      }

      return toPersistedSavedEnvironmentRecord(record);
    }),
  } satisfies SavedEnvironmentRegistryDocument);
}

/**
 * Read the persisted V3 Google token bundle.
 *
 * The on-disk file is `{ encryptedTokens: "<base64>" }` — the actual token
 * material is encrypted via Electron's `safeStorage` API which delegates to
 * the OS keychain (macOS Keychain, Windows DPAPI, libsecret/kwallet on
 * Linux). Plaintext tokens never touch disk.
 *
 * Returns `null` when:
 *   - The file is absent
 *   - Encryption is unavailable on this OS (e.g. Linux without libsecret)
 *   - The encrypted blob fails to decrypt or decode (corruption, key change)
 *   - The file is a legacy *plaintext* shape from a build that pre-dated
 *     encryption — in this case the file is also deleted from disk so the
 *     plaintext credentials don't linger after the user re-signs in.
 */
export function readV3GoogleTokens(input: {
  readonly tokensPath: string;
  readonly secretStorage: DesktopSecretStorage;
}): GoogleTokenBundleValue | null {
  const document = readJsonFile<GoogleTokenDocument>(input.tokensPath);
  if (!document) {
    return null;
  }

  // Legacy plaintext shape — pre-encryption builds wrote the bundle straight
  // to disk. Detect by the absence of `encryptedTokens` combined with any
  // recognisable token field. Delete the file so the plaintext doesn't sit
  // around indefinitely; the caller will treat this as "not signed in" and
  // re-prompt.
  if (!document.encryptedTokens && isLegacyPlaintextGoogleTokenDocument(document)) {
    try {
      FS.rmSync(input.tokensPath, { force: true });
    } catch {
      // Best effort — re-encryption on next sign-in will overwrite anyway.
    }
    return null;
  }

  if (!document.encryptedTokens || !input.secretStorage.isEncryptionAvailable()) {
    return null;
  }

  try {
    const decrypted = input.secretStorage.decryptString(
      Buffer.from(document.encryptedTokens, "base64"),
    );
    return Schema.decodeUnknownSync(GoogleTokenBundle)(JSON.parse(decrypted));
  } catch {
    return null;
  }
}

/**
 * Persist a Google token bundle, encrypted via the OS keychain.
 *
 * Refuses to write when `safeStorage` reports encryption is unavailable —
 * we'd rather fail loudly than write plaintext as a fallback.
 */
export function writeV3GoogleTokens(input: {
  readonly tokensPath: string;
  readonly tokens: GoogleTokenBundleValue;
  readonly secretStorage: DesktopSecretStorage;
}): void {
  if (!input.secretStorage.isEncryptionAvailable()) {
    throw new Error("Desktop secure storage is unavailable.");
  }

  const encryptedTokens = input.secretStorage
    .encryptString(JSON.stringify(input.tokens))
    .toString("base64");
  writeJsonFile(input.tokensPath, { encryptedTokens } satisfies GoogleTokenDocument);
}

export function clearV3GoogleTokens(tokensPath: string): void {
  if (!FS.existsSync(tokensPath)) {
    return;
  }
  FS.rmSync(tokensPath, { force: true });
}

/**
 * Heuristic to spot pre-encryption legacy token files. A modern document is
 * `{ encryptedTokens: "..." }`; legacy ones were the raw `GoogleTokenBundle`
 * with `accessToken` / `idToken` keys at the top level.
 */
function isLegacyPlaintextGoogleTokenDocument(document: unknown): boolean {
  if (typeof document !== "object" || document === null) {
    return false;
  }
  const candidate = document as Record<string, unknown>;
  return (
    typeof candidate.accessToken === "string" ||
    typeof candidate.idToken === "string" ||
    typeof candidate.refreshToken === "string"
  );
}
