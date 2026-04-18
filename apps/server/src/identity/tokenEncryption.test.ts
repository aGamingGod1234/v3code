import * as Crypto from "node:crypto";

import { describe, expect, it } from "vitest";

import { decrypt, encrypt, TokenEncryptionError } from "./tokenEncryption.ts";

const randomKey = () => Uint8Array.from(Crypto.randomBytes(32));

describe("tokenEncryption", () => {
  it("round-trips a plaintext through encrypt + decrypt", () => {
    const key = randomKey();
    const plaintext = "ghu_abc123_a_fake_github_token";

    const blob = encrypt(plaintext, key);
    const recovered = decrypt(blob, key);

    expect(recovered).toBe(plaintext);
  });

  it("produces distinct ciphertext and iv across encrypts of the same plaintext", () => {
    const key = randomKey();
    const plaintext = "same-plaintext-every-time";

    const first = encrypt(plaintext, key);
    const second = encrypt(plaintext, key);

    expect(first.iv).not.toEqual(second.iv);
    expect(first.ciphertext).not.toEqual(second.ciphertext);
    expect(decrypt(first, key)).toBe(plaintext);
    expect(decrypt(second, key)).toBe(plaintext);
  });

  it("rejects keys that are not 32 bytes", () => {
    const shortKey = Uint8Array.from(Crypto.randomBytes(16));
    expect(() => encrypt("x", shortKey)).toThrow(TokenEncryptionError);
    const longKey = Uint8Array.from(Crypto.randomBytes(48));
    expect(() => encrypt("x", longKey)).toThrow(TokenEncryptionError);
  });

  it("fails decrypt when the key does not match", () => {
    const keyA = randomKey();
    const keyB = randomKey();
    const blob = encrypt("secret", keyA);

    expect(() => decrypt(blob, keyB)).toThrow(TokenEncryptionError);
  });

  it("fails decrypt when the ciphertext has been tampered with", () => {
    const key = randomKey();
    const blob = encrypt("secret", key);
    const tampered = {
      ...blob,
      ciphertext: blob.ciphertext.slice(),
    };
    if (tampered.ciphertext.length === 0) {
      throw new Error("unexpected empty ciphertext");
    }
    tampered.ciphertext[0] = (tampered.ciphertext[0] ?? 0) ^ 0xff;

    expect(() => decrypt(tampered, key)).toThrow(TokenEncryptionError);
  });

  it("fails decrypt when the auth tag has been tampered with", () => {
    const key = randomKey();
    const blob = encrypt("secret", key);
    const tampered = {
      ...blob,
      authTag: blob.authTag.slice(),
    };
    tampered.authTag[0] = (tampered.authTag[0] ?? 0) ^ 0xff;

    expect(() => decrypt(tampered, key)).toThrow(TokenEncryptionError);
  });

  it("rejects iv of wrong length at decrypt time", () => {
    const key = randomKey();
    const blob = encrypt("secret", key);
    const tampered = { ...blob, iv: blob.iv.slice(0, 8) };

    expect(() => decrypt(tampered, key)).toThrow(TokenEncryptionError);
  });

  it("rejects auth tag of wrong length at decrypt time", () => {
    const key = randomKey();
    const blob = encrypt("secret", key);
    const tampered = { ...blob, authTag: blob.authTag.slice(0, 8) };

    expect(() => decrypt(tampered, key)).toThrow(TokenEncryptionError);
  });
});
