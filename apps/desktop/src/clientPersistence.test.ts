import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  EnvironmentId,
  type ClientSettings,
  type PersistedSavedEnvironmentRecord,
} from "@v3tools/contracts";
import { afterEach, describe, expect, it } from "vitest";

import {
  clearV3GoogleTokens,
  readClientSettings,
  readSavedEnvironmentRegistry,
  readSavedEnvironmentSecret,
  readV3GoogleTokens,
  removeSavedEnvironmentSecret,
  writeClientSettings,
  writeSavedEnvironmentRegistry,
  writeSavedEnvironmentSecret,
  writeV3GoogleTokens,
  type DesktopSecretStorage,
} from "./clientPersistence.ts";

const sampleGoogleBundle = {
  accessToken: "ya29.a0-access",
  idToken: "id-token",
  refreshToken: "refresh-token",
  expiresAt: "2026-12-31T00:00:00.000Z",
  scope: "openid email https://www.googleapis.com/auth/drive.appdata",
  tokenType: "Bearer",
} as const;

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function makeTempPath(fileName: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "t3-client-persistence-test-"));
  tempDirectories.push(directory);
  return path.join(directory, fileName);
}

function makeSecretStorage(available: boolean): DesktopSecretStorage {
  return {
    isEncryptionAvailable: () => available,
    encryptString: (value) => Buffer.from(`enc:${value}`, "utf8"),
    decryptString: (value) => {
      const decoded = value.toString("utf8");
      if (!decoded.startsWith("enc:")) {
        throw new Error("invalid secret");
      }
      return decoded.slice("enc:".length);
    },
  };
}

const clientSettings: ClientSettings = {
  confirmThreadArchive: true,
  confirmThreadDelete: false,
  diffWordWrap: true,
  sidebarProjectGroupingMode: "repository_path",
  sidebarProjectGroupingOverrides: {
    "environment-1:/tmp/project-a": "separate",
  },
  sidebarProjectSortOrder: "manual",
  sidebarThreadSortOrder: "created_at",
  timestampFormat: "24-hour",
  v3ConfigureServerBannerDismissedPermanently: false,
  v3ServerNodeUrlOverride: "",
};

const savedRegistryRecord: PersistedSavedEnvironmentRecord = {
  environmentId: EnvironmentId.make("environment-1"),
  label: "Remote environment",
  httpBaseUrl: "https://remote.example.com/",
  wsBaseUrl: "wss://remote.example.com/",
  createdAt: "2026-04-09T00:00:00.000Z",
  lastConnectedAt: "2026-04-09T01:00:00.000Z",
};

describe("clientPersistence", () => {
  it("persists and reloads client settings", () => {
    const settingsPath = makeTempPath("client-settings.json");

    writeClientSettings(settingsPath, clientSettings);

    expect(readClientSettings(settingsPath)).toEqual(clientSettings);
  });

  it("persists and reloads saved environment metadata", () => {
    const registryPath = makeTempPath("saved-environments.json");

    writeSavedEnvironmentRegistry(registryPath, [savedRegistryRecord]);

    expect(readSavedEnvironmentRegistry(registryPath)).toEqual([savedRegistryRecord]);
  });

  it("persists encrypted saved environment secrets when encryption is available", () => {
    const registryPath = makeTempPath("saved-environments.json");
    const secretStorage = makeSecretStorage(true);

    writeSavedEnvironmentRegistry(registryPath, [savedRegistryRecord]);

    expect(
      writeSavedEnvironmentSecret({
        registryPath,
        environmentId: savedRegistryRecord.environmentId,
        secret: "bearer-token",
        secretStorage,
      }),
    ).toBe(true);

    expect(
      readSavedEnvironmentSecret({
        registryPath,
        environmentId: savedRegistryRecord.environmentId,
        secretStorage,
      }),
    ).toBe("bearer-token");

    expect(JSON.parse(fs.readFileSync(registryPath, "utf8"))).toEqual({
      records: [
        {
          ...savedRegistryRecord,
          encryptedBearerToken: Buffer.from("enc:bearer-token", "utf8").toString("base64"),
        },
      ],
    });
  });

  it("preserves existing secrets when encryption is unavailable", () => {
    const registryPath = makeTempPath("saved-environments.json");
    const availableSecretStorage = makeSecretStorage(true);

    writeSavedEnvironmentRegistry(registryPath, [savedRegistryRecord]);

    writeSavedEnvironmentSecret({
      registryPath,
      environmentId: savedRegistryRecord.environmentId,
      secret: "bearer-token",
      secretStorage: availableSecretStorage,
    });

    expect(
      writeSavedEnvironmentSecret({
        registryPath,
        environmentId: savedRegistryRecord.environmentId,
        secret: "next-token",
        secretStorage: makeSecretStorage(false),
      }),
    ).toBe(false);

    expect(
      readSavedEnvironmentSecret({
        registryPath,
        environmentId: savedRegistryRecord.environmentId,
        secretStorage: availableSecretStorage,
      }),
    ).toBe("bearer-token");
  });

  it("removes saved environment secrets", () => {
    const registryPath = makeTempPath("saved-environments.json");
    const secretStorage = makeSecretStorage(true);

    writeSavedEnvironmentRegistry(registryPath, [savedRegistryRecord]);

    writeSavedEnvironmentSecret({
      registryPath,
      environmentId: savedRegistryRecord.environmentId,
      secret: "bearer-token",
      secretStorage,
    });

    removeSavedEnvironmentSecret({
      registryPath,
      environmentId: savedRegistryRecord.environmentId,
    });

    expect(
      readSavedEnvironmentSecret({
        registryPath,
        environmentId: savedRegistryRecord.environmentId,
        secretStorage,
      }),
    ).toBeNull();
  });

  it("treats malformed secrets documents as empty", () => {
    const registryPath = makeTempPath("saved-environments.json");
    fs.writeFileSync(registryPath, "{}\n", "utf8");

    expect(
      readSavedEnvironmentSecret({
        registryPath,
        environmentId: savedRegistryRecord.environmentId,
        secretStorage: makeSecretStorage(true),
      }),
    ).toBeNull();

    expect(() =>
      removeSavedEnvironmentSecret({
        registryPath,
        environmentId: savedRegistryRecord.environmentId,
      }),
    ).not.toThrow();
  });

  it("returns false when writing a secret without metadata", () => {
    const registryPath = makeTempPath("saved-environments.json");

    expect(
      writeSavedEnvironmentSecret({
        registryPath,
        environmentId: savedRegistryRecord.environmentId,
        secret: "bearer-token",
        secretStorage: makeSecretStorage(true),
      }),
    ).toBe(false);
  });

  it("preserves encrypted secrets when metadata is rewritten", () => {
    const registryPath = makeTempPath("saved-environments.json");
    const secretStorage = makeSecretStorage(true);

    writeSavedEnvironmentRegistry(registryPath, [savedRegistryRecord]);

    writeSavedEnvironmentSecret({
      registryPath,
      environmentId: savedRegistryRecord.environmentId,
      secret: "bearer-token",
      secretStorage,
    });

    writeSavedEnvironmentRegistry(registryPath, [savedRegistryRecord]);

    expect(readSavedEnvironmentRegistry(registryPath)).toEqual([savedRegistryRecord]);
    expect(
      readSavedEnvironmentSecret({
        registryPath,
        environmentId: savedRegistryRecord.environmentId,
        secretStorage,
      }),
    ).toBe("bearer-token");
  });
});

describe("V3 Google tokens (safeStorage-backed)", () => {
  it("round-trips an encrypted bundle through write + read", () => {
    const tokensPath = makeTempPath("v3-google-tokens.json");
    const secretStorage = makeSecretStorage(true);

    writeV3GoogleTokens({ tokensPath, tokens: sampleGoogleBundle, secretStorage });

    // The on-disk shape is the encrypted wrapper, never the bundle itself.
    const onDisk = JSON.parse(fs.readFileSync(tokensPath, "utf8"));
    expect(onDisk).toHaveProperty("encryptedTokens");
    expect(onDisk).not.toHaveProperty("accessToken");

    expect(readV3GoogleTokens({ tokensPath, secretStorage })).toEqual(sampleGoogleBundle);
  });

  it("returns null when the file does not exist", () => {
    const tokensPath = makeTempPath("absent-tokens.json");
    expect(readV3GoogleTokens({ tokensPath, secretStorage: makeSecretStorage(true) })).toBeNull();
  });

  it("refuses to write plaintext when encryption is unavailable", () => {
    const tokensPath = makeTempPath("v3-google-tokens.json");
    const secretStorage = makeSecretStorage(false);

    expect(() => writeV3GoogleTokens({ tokensPath, tokens: sampleGoogleBundle, secretStorage }))
      .toThrowError(/secure storage is unavailable/i);
    expect(fs.existsSync(tokensPath)).toBe(false);
  });

  it("returns null and leaves the file alone when safeStorage is unavailable on read", () => {
    const tokensPath = makeTempPath("v3-google-tokens.json");
    writeV3GoogleTokens({ tokensPath, tokens: sampleGoogleBundle, secretStorage: makeSecretStorage(true) });

    expect(readV3GoogleTokens({ tokensPath, secretStorage: makeSecretStorage(false) })).toBeNull();
    expect(fs.existsSync(tokensPath)).toBe(true);
  });

  it("returns null when the encrypted blob is corrupted", () => {
    const tokensPath = makeTempPath("v3-google-tokens.json");
    fs.writeFileSync(
      tokensPath,
      JSON.stringify({ encryptedTokens: Buffer.from("not-our-prefix").toString("base64") }),
      "utf8",
    );

    expect(readV3GoogleTokens({ tokensPath, secretStorage: makeSecretStorage(true) })).toBeNull();
  });

  it("detects + deletes a legacy plaintext file from a pre-encryption build", () => {
    const tokensPath = makeTempPath("v3-google-tokens.json");
    fs.writeFileSync(tokensPath, JSON.stringify(sampleGoogleBundle), "utf8");

    expect(readV3GoogleTokens({ tokensPath, secretStorage: makeSecretStorage(true) })).toBeNull();
    expect(fs.existsSync(tokensPath)).toBe(false);
  });

  it("clears the encrypted file on sign-out", () => {
    const tokensPath = makeTempPath("v3-google-tokens.json");
    writeV3GoogleTokens({ tokensPath, tokens: sampleGoogleBundle, secretStorage: makeSecretStorage(true) });
    expect(fs.existsSync(tokensPath)).toBe(true);

    clearV3GoogleTokens(tokensPath);
    expect(fs.existsSync(tokensPath)).toBe(false);

    // Idempotent — clearing an absent file is a no-op.
    expect(() => clearV3GoogleTokens(tokensPath)).not.toThrow();
  });
});
