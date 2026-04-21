// V3 sign-in client state (renderer-side, non-sensitive).
//
// The actual session lives in an HTTP-only cookie set by the server's
// `/api/auth/google/bootstrap` route — the renderer never touches the
// session token directly. What this module persists is the *display* state:
// "are we signed in?", "what email does the user know themselves by?",
// and the soft-startup-nudge dismissal timestamp (per Lucas's P1d Q1d-1
// answer: nudge gently on startup, dismissible, don't be aggressive).
//
// Storage: `localStorage`. None of these values are secrets — losing them
// just means the UI shows "signed out" until the next bootstrap call
// confirms the cookie is still good. The next sign-in or
// `/api/auth/session` round-trip rehydrates them.
//
// NOTE: this is intentionally not a Zustand/Redux store. P1d ships a
// minimal subscribe-on-mount surface. The full mesh client store lands in
// P3 (sidebar rewrite) where state shape will firm up.

import { useEffect, useSyncExternalStore } from "react";

const SIGNED_IN_KEY = "v3.signed-in";
const NUDGE_DISMISSED_AT_KEY = "v3.startup-nudge.dismissed-at";
const NUDGE_REVISIT_DAYS = 7;

interface SignedInSnapshot {
  readonly email: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly pendingApproval: boolean;
}

interface SignedOutSnapshot {
  readonly email: null;
  readonly displayName: null;
  readonly avatarUrl: null;
  readonly pendingApproval: false;
}

export type V3SignInSnapshot = SignedInSnapshot | SignedOutSnapshot;

const SIGNED_OUT: SignedOutSnapshot = {
  email: null,
  displayName: null,
  avatarUrl: null,
  pendingApproval: false,
};

const safeRead = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeWrite = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
};

const safeRemove = (key: string): void => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

const readSnapshot = (): V3SignInSnapshot => {
  const raw = safeRead(SIGNED_IN_KEY);
  if (raw === null || raw.length === 0) return SIGNED_OUT;
  try {
    const parsed = JSON.parse(raw) as Partial<SignedInSnapshot>;
    if (typeof parsed.email !== "string" || parsed.email.length === 0) return SIGNED_OUT;
    return {
      email: parsed.email,
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : null,
      avatarUrl: typeof parsed.avatarUrl === "string" ? parsed.avatarUrl : null,
      pendingApproval: parsed.pendingApproval === true,
    };
  } catch {
    return SIGNED_OUT;
  }
};

// Local subscribers fire whenever this tab mutates state; cross-tab updates
// piggy-back on the browser's native `storage` event below.
const listeners = new Set<() => void>();

const notifyListeners = (): void => {
  for (const listener of listeners) listener();
};

let cachedSnapshot: V3SignInSnapshot = readSnapshot();

const refreshCache = (): void => {
  cachedSnapshot = readSnapshot();
  notifyListeners();
};

export const recordV3SignedIn = (snapshot: SignedInSnapshot): void => {
  safeWrite(SIGNED_IN_KEY, JSON.stringify(snapshot));
  refreshCache();
};

export const updateV3SignedIn = (patch: Partial<SignedInSnapshot>): void => {
  const current = readSnapshot();
  if (current.email === null) {
    return;
  }
  recordV3SignedIn({
    ...current,
    ...patch,
  });
};

export const clearV3SignedIn = (): void => {
  safeRemove(SIGNED_IN_KEY);
  refreshCache();
};

export const getV3SignInSnapshot = (): V3SignInSnapshot => cachedSnapshot;

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useV3SignInSnapshot = (): V3SignInSnapshot => {
  // Cross-tab parity: re-read the snapshot whenever another tab on the
  // same origin mutates either of our keys.
  useEffect(() => {
    const handle = (event: StorageEvent) => {
      if (event.key === SIGNED_IN_KEY || event.key === NUDGE_DISMISSED_AT_KEY) {
        refreshCache();
      }
    };
    window.addEventListener("storage", handle);
    return () => window.removeEventListener("storage", handle);
  }, []);
  return useSyncExternalStore(subscribe, getV3SignInSnapshot, getV3SignInSnapshot);
};

// --- Startup nudge dismissal --------------------------------------------

const parseDismissedAt = (raw: string | null): number | null => {
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return parsed;
};

export const dismissStartupNudge = (now: number = Date.now()): void => {
  safeWrite(NUDGE_DISMISSED_AT_KEY, String(now));
  notifyListeners();
};

export const dismissStartupNudgePermanently = (): void => {
  // Date.MAX_SAFE_INTEGER never falls into the revisit window, so the
  // nudge will not reappear even after a year.
  safeWrite(NUDGE_DISMISSED_AT_KEY, String(Number.MAX_SAFE_INTEGER));
  notifyListeners();
};

export const shouldShowStartupNudge = (signedIn: boolean, now: number = Date.now()): boolean => {
  if (signedIn) return false;
  const dismissedAt = parseDismissedAt(safeRead(NUDGE_DISMISSED_AT_KEY));
  if (dismissedAt === null) return true;
  if (dismissedAt === Number.MAX_SAFE_INTEGER) return false;
  const elapsedDays = (now - dismissedAt) / (1000 * 60 * 60 * 24);
  return elapsedDays >= NUDGE_REVISIT_DAYS;
};

// Test seam.
export const __resetSignInStateForTests = (): void => {
  safeRemove(SIGNED_IN_KEY);
  safeRemove(NUDGE_DISMISSED_AT_KEY);
  refreshCache();
};
