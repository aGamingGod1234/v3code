import {
  GoogleTokenBundle,
  GoogleTokenHandoffConsumeResult,
  GoogleTokenRefreshInput,
  type GoogleTokenBundle as GoogleTokenBundleValue,
  type GoogleTokenHandoffConsumeResult as GoogleTokenHandoffConsumeResultValue,
} from "@v3tools/contracts";
import { withGoogleTokenExpiry, shouldRefreshGoogleTokens } from "@v3tools/shared/googleTokens";
import { Schema } from "effect";

import { resolvePrimaryEnvironmentHttpUrl } from "../../environments/primary";

const BROWSER_FALLBACK_STORAGE_KEY = "v3.google-tokens";
const DB_NAME = "v3-auth";
const STORE_NAME = "google";
const STORE_KEY = "tokens";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

async function fetchGoogleClientId(): Promise<string | null> {
  const response = await fetch(resolvePrimaryEnvironmentHttpUrl("/api/auth/google/config"), {
    credentials: "include",
  });
  if (!response.ok) {
    return null;
  }
  const json = (await response.json()) as { clientId?: unknown };
  return typeof json.clientId === "string" && json.clientId.length > 0 ? json.clientId : null;
}

interface GoogleTokenStore {
  readonly read: () => Promise<GoogleTokenBundleValue | null>;
  readonly write: (tokens: GoogleTokenBundleValue) => Promise<void>;
  readonly clear: () => Promise<void>;
}

function canUseIndexedDb(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

function readFallbackTokens(): GoogleTokenBundleValue | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(BROWSER_FALLBACK_STORAGE_KEY);
    return raw ? Schema.decodeUnknownSync(GoogleTokenBundle)(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeFallbackTokens(tokens: GoogleTokenBundleValue): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(BROWSER_FALLBACK_STORAGE_KEY, JSON.stringify(tokens));
  } catch {
    // ignore
  }
}

function clearFallbackTokens(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(BROWSER_FALLBACK_STORAGE_KEY);
  } catch {
    // ignore
  }
}

async function openTokenDatabase(): Promise<IDBDatabase> {
  return await new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);
    request.addEventListener("error", () => {
      reject(request.error ?? new Error("Failed to open IndexedDB."));
    });
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    });
    request.addEventListener("success", () => {
      resolve(request.result);
    });
  });
}

async function readIndexedDbTokens(): Promise<GoogleTokenBundleValue | null> {
  const database = await openTokenDatabase();
  return await new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(STORE_KEY);
    request.addEventListener("error", () => {
      reject(request.error ?? new Error("Failed to read IndexedDB token store."));
    });
    request.addEventListener("success", () => {
      try {
        resolve(
          request.result ? Schema.decodeUnknownSync(GoogleTokenBundle)(request.result) : null,
        );
      } catch (error) {
        reject(error);
      } finally {
        database.close();
      }
    });
  });
}

async function writeIndexedDbTokens(tokens: GoogleTokenBundleValue): Promise<void> {
  const database = await openTokenDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(tokens, STORE_KEY);
    request.addEventListener("error", () => {
      reject(request.error ?? new Error("Failed to write IndexedDB token store."));
    });
    transaction.addEventListener("complete", () => {
      database.close();
      resolve();
    });
    transaction.addEventListener("error", () => {
      reject(transaction.error ?? new Error("Failed to commit IndexedDB token store write."));
    });
  });
}

async function clearIndexedDbTokens(): Promise<void> {
  const database = await openTokenDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(STORE_KEY);
    request.addEventListener("error", () => {
      reject(request.error ?? new Error("Failed to clear IndexedDB token store."));
    });
    transaction.addEventListener("complete", () => {
      database.close();
      resolve();
    });
    transaction.addEventListener("error", () => {
      reject(transaction.error ?? new Error("Failed to commit IndexedDB token store clear."));
    });
  });
}

function createBrowserTokenStore(): GoogleTokenStore {
  return {
    read: async () => {
      if (!canUseIndexedDb()) {
        return readFallbackTokens();
      }
      try {
        return await readIndexedDbTokens();
      } catch {
        return readFallbackTokens();
      }
    },
    write: async (tokens) => {
      if (!canUseIndexedDb()) {
        writeFallbackTokens(tokens);
        return;
      }
      try {
        await writeIndexedDbTokens(tokens);
      } catch {
        writeFallbackTokens(tokens);
      }
    },
    clear: async () => {
      if (!canUseIndexedDb()) {
        clearFallbackTokens();
        return;
      }
      try {
        await clearIndexedDbTokens();
      } catch {
        clearFallbackTokens();
      }
    },
  };
}

function createDesktopTokenStore(): GoogleTokenStore {
  return {
    read: async () => window.desktopBridge?.getV3GoogleTokens() ?? null,
    write: async (tokens) => {
      await window.desktopBridge?.setV3GoogleTokens(tokens);
    },
    clear: async () => {
      await window.desktopBridge?.clearV3GoogleTokens();
    },
  };
}

function resolveTokenStore(): GoogleTokenStore {
  return window.desktopBridge ? createDesktopTokenStore() : createBrowserTokenStore();
}

export async function readPersistedGoogleTokens(): Promise<GoogleTokenBundleValue | null> {
  if (typeof window === "undefined") {
    return null;
  }
  return await resolveTokenStore().read();
}

export async function writePersistedGoogleTokens(tokens: GoogleTokenBundleValue): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }
  await resolveTokenStore().write(tokens);
}

export async function clearPersistedGoogleTokens(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }
  await resolveTokenStore().clear();
}

async function refreshBrowserGoogleTokens(
  tokens: GoogleTokenBundleValue,
): Promise<GoogleTokenBundleValue | null> {
  if (!tokens.refreshToken) {
    return null;
  }
  const response = await fetch(
    resolvePrimaryEnvironmentHttpUrl("/api/auth/google/tokens/refresh"),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        Schema.encodeSync(GoogleTokenRefreshInput)({
          refreshToken: tokens.refreshToken ?? "",
          idToken: tokens.idToken,
        }),
      ),
    },
  );
  if (!response.ok) {
    return null;
  }
  return Schema.decodeUnknownSync(GoogleTokenBundle)(await response.json());
}

async function refreshDesktopGoogleTokens(
  tokens: GoogleTokenBundleValue,
): Promise<GoogleTokenBundleValue | null> {
  if (!tokens.refreshToken) {
    return null;
  }

  const clientId = await fetchGoogleClientId();
  if (!clientId) {
    return null;
  }

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: tokens.refreshToken,
    }).toString(),
  });
  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
    id_token?: unknown;
    refresh_token?: unknown;
    scope?: unknown;
    token_type?: unknown;
  };
  if (typeof json.access_token !== "string" || json.access_token.length === 0) {
    return null;
  }

  return withGoogleTokenExpiry(
    {
      accessToken: json.access_token,
      idToken: typeof json.id_token === "string" ? json.id_token : tokens.idToken,
      refreshToken:
        typeof json.refresh_token === "string" ? json.refresh_token : tokens.refreshToken,
      scope: typeof json.scope === "string" ? json.scope : tokens.scope,
      tokenType: typeof json.token_type === "string" ? json.token_type : tokens.tokenType,
    },
    typeof json.expires_in === "number" ? json.expires_in : 3600,
  );
}

export async function getFreshGoogleTokens(): Promise<GoogleTokenBundleValue | null> {
  const tokens = await readPersistedGoogleTokens();
  if (!tokens) {
    return null;
  }
  if (!shouldRefreshGoogleTokens(tokens)) {
    return tokens;
  }

  const refreshed = window.desktopBridge
    ? await refreshDesktopGoogleTokens(tokens)
    : await refreshBrowserGoogleTokens(tokens);
  if (!refreshed) {
    await clearPersistedGoogleTokens();
    return null;
  }
  await writePersistedGoogleTokens(refreshed);
  return refreshed;
}

export async function getFreshGoogleAccessToken(): Promise<string | null> {
  const tokens = await getFreshGoogleTokens();
  return tokens?.accessToken ?? null;
}

export async function consumeBrowserGoogleTokenHandoff(): Promise<GoogleTokenHandoffConsumeResultValue | null> {
  const response = await fetch(
    resolvePrimaryEnvironmentHttpUrl("/api/auth/google/tokens/consume"),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  );

  if (response.status === 204) {
    return null;
  }
  if (!response.ok) {
    return null;
  }
  return Schema.decodeUnknownSync(GoogleTokenHandoffConsumeResult)(await response.json());
}
