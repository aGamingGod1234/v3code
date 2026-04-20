// V3 Phase 7 — browser-local GitHub PAT storage for the cloud-mode
// repo picker.
//
// TEMPORARY storage. P8 replaces this with a server-node-mediated
// GitHub App flow so the browser never holds a raw token. Until then,
// cloud-mode users paste a scope-limited PAT into the picker. The PAT
// lives in `localStorage` scoped to this browser; clearing site data
// revokes it from V3's side.
//
// Why localStorage and not an HttpOnly cookie: the picker is pure
// browser-side — the server-node never calls GitHub in Phase 7. When
// P8 ships and the server mediates, the PAT storage goes away
// entirely and is replaced by a "Connect GitHub" affordance that
// writes the installation id server-side.

const STORAGE_KEY = "v3.cloud-mode.github-token";

export interface StoredGitHubToken {
  readonly token: string;
  readonly scope: string;
  readonly savedAt: string;
}

const safeRead = (): string | null => {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const safeWrite = (value: string): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* Private-mode / quota — caller will see "no token" on read. */
  }
};

const safeRemove = (): void => {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
};

export const readStoredGitHubToken = (): StoredGitHubToken | null => {
  const raw = safeRead();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredGitHubToken>;
    if (typeof parsed.token !== "string" || parsed.token.length === 0) return null;
    return {
      token: parsed.token,
      scope: typeof parsed.scope === "string" ? parsed.scope : "",
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
};

export const storeGitHubToken = (input: { token: string; scope?: string }): StoredGitHubToken => {
  const stored: StoredGitHubToken = {
    token: input.token.trim(),
    scope: (input.scope ?? "").trim(),
    savedAt: new Date().toISOString(),
  };
  safeWrite(JSON.stringify(stored));
  return stored;
};

export const clearGitHubToken = (): void => {
  safeRemove();
};

// Test seam.
export const __resetGitHubTokenStoreForTests = (): void => {
  safeRemove();
};
