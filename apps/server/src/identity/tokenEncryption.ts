import * as Crypto from "node:crypto";

// AES-256-GCM helpers for encrypting third-party access tokens (GitHub, future
// providers) at rest in the SQLite DB. The encryption key itself is sourced
// from `ServerSecretStore.getOrCreateRandom("v3-token-enc-key", 32)` — this
// module is just the cryptographic primitives; callers compose it with that
// store.
//
// On-disk format: ciphertext + iv + authTag are stored in three separate BLOB
// columns (see migration 026). Keeping them separate makes intent obvious and
// matches Postgres-style BYTEA usage for when we move to Postgres in server-
// node mode (§D5 of the V3 plan).

const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const KEY_LENGTH_BYTES = 32;
const ALGORITHM = "aes-256-gcm";

export interface EncryptedBlob {
  readonly ciphertext: Uint8Array;
  readonly iv: Uint8Array;
  readonly authTag: Uint8Array;
}

export class TokenEncryptionError extends Error {
  override readonly name = "TokenEncryptionError";
  constructor(message: string) {
    super(message);
  }
}

const assertKey = (key: Uint8Array) => {
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new TokenEncryptionError(
      `Encryption key must be ${KEY_LENGTH_BYTES} bytes for ${ALGORITHM} (got ${key.length})`,
    );
  }
};

export const encrypt = (plaintext: string, key: Uint8Array): EncryptedBlob => {
  assertKey(key);
  const iv = Crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = Crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertextBuf = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  if (authTag.length !== AUTH_TAG_LENGTH_BYTES) {
    throw new TokenEncryptionError(`Unexpected auth tag length: ${authTag.length}`);
  }
  return {
    ciphertext: Uint8Array.from(ciphertextBuf),
    iv: Uint8Array.from(iv),
    authTag: Uint8Array.from(authTag),
  };
};

export const decrypt = (blob: EncryptedBlob, key: Uint8Array): string => {
  assertKey(key);
  if (blob.iv.length !== IV_LENGTH_BYTES) {
    throw new TokenEncryptionError(`IV must be ${IV_LENGTH_BYTES} bytes (got ${blob.iv.length})`);
  }
  if (blob.authTag.length !== AUTH_TAG_LENGTH_BYTES) {
    throw new TokenEncryptionError(
      `Auth tag must be ${AUTH_TAG_LENGTH_BYTES} bytes (got ${blob.authTag.length})`,
    );
  }
  const decipher = Crypto.createDecipheriv(ALGORITHM, key, blob.iv);
  decipher.setAuthTag(blob.authTag);
  try {
    const plaintextBuf = Buffer.concat([decipher.update(blob.ciphertext), decipher.final()]);
    return plaintextBuf.toString("utf8");
  } catch (cause) {
    throw new TokenEncryptionError(
      cause instanceof Error ? `Decryption failed: ${cause.message}` : "Decryption failed",
    );
  }
};
