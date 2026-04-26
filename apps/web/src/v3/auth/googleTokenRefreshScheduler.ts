// Proactive Google ID-token refresh scheduler.
//
// Spec §3.1: "V3 uses stored refresh token to get a fresh ID token
// before expiry." The existing `getFreshGoogleTokens` only refreshes
// on demand — if nothing in the app touches the token store for an
// hour, the ID token silently expires and the user gets kicked back
// to the sign-in dialog the next time something (Drive API, mesh
// RPC) actually needs it.
//
// This module wakes up a little before expiry, calls the same
// refresh path, and re-schedules itself. Browsers don't throttle
// setTimeout for visible tabs, and backgrounded tabs that miss a
// wake-up fall through to the opportunistic refresh on the next
// foreground tick — so the worst case is still "refresh just before
// use," not "kicked out."

import {
  getGoogleTokenExpiryEpochMs,
  GOOGLE_TOKEN_REFRESH_SKEW_MS,
} from "@v3tools/shared/googleTokens";

import { getFreshGoogleTokens, readPersistedGoogleTokens } from "./googleTokenStore";

// Wake up this far before expiry so the refresh completes before any
// downstream consumer actually needs a fresh token. Must stay larger
// than GOOGLE_TOKEN_REFRESH_SKEW_MS so `shouldRefreshGoogleTokens`
// returns true when we trigger the refresh.
const PROACTIVE_REFRESH_MARGIN_MS = 5 * 60_000;

// Fallback cadence when we can't read a persisted bundle (signed-out
// sessions, storage races). Keeps the scheduler probing without
// hammering the token store on every frame.
const FALLBACK_RETRY_MS = 60_000;

// setTimeout is capped at ~24 days on every major engine. The
// scheduler only ever deals with one-hour token windows, so this is
// purely belt-and-braces.
const MAX_TIMER_MS = 6 * 60 * 60_000;

export interface GoogleTokenRefreshSchedulerHandle {
  readonly stop: () => void;
}

type SchedulerDeps = {
  readonly now?: () => number;
  readonly readTokens?: () => Promise<Awaited<ReturnType<typeof readPersistedGoogleTokens>>>;
  readonly refreshTokens?: () => Promise<Awaited<ReturnType<typeof getFreshGoogleTokens>>>;
  readonly setTimer?: (fn: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
};

export function startGoogleTokenRefreshScheduler(
  deps: SchedulerDeps = {},
): GoogleTokenRefreshSchedulerHandle {
  const now = deps.now ?? (() => Date.now());
  const readTokens = deps.readTokens ?? readPersistedGoogleTokens;
  const refreshTokens = deps.refreshTokens ?? getFreshGoogleTokens;
  const setTimer =
    deps.setTimer ??
    ((fn: () => void, ms: number) =>
      typeof globalThis.setTimeout === "function" ? globalThis.setTimeout(fn, ms) : null);
  const clearTimer =
    deps.clearTimer ??
    ((handle: unknown) => {
      if (handle !== null && typeof globalThis.clearTimeout === "function") {
        globalThis.clearTimeout(handle as number);
      }
    });

  let currentTimer: unknown = null;
  let stopped = false;

  const scheduleNext = (delayMs: number) => {
    if (stopped) return;
    const clamped = Math.min(Math.max(delayMs, 0), MAX_TIMER_MS);
    currentTimer = setTimer(() => {
      currentTimer = null;
      void tick();
    }, clamped);
  };

  const tick = async () => {
    if (stopped) return;
    let tokens: Awaited<ReturnType<typeof readPersistedGoogleTokens>>;
    try {
      tokens = await readTokens();
    } catch {
      scheduleNext(FALLBACK_RETRY_MS);
      return;
    }
    if (!tokens) {
      // No session persisted; keep probing so a sign-in on another tab
      // pulls this tab back into the rotation.
      scheduleNext(FALLBACK_RETRY_MS);
      return;
    }

    const expiresAt = getGoogleTokenExpiryEpochMs(tokens);
    if (expiresAt === null) {
      scheduleNext(FALLBACK_RETRY_MS);
      return;
    }

    const nowMs = now();
    const refreshAt = expiresAt - PROACTIVE_REFRESH_MARGIN_MS;

    if (nowMs >= refreshAt) {
      try {
        await refreshTokens();
      } catch {
        // Swallow errors — the opportunistic path will retry on the
        // next actual RPC. We still reschedule so we don't lock up.
      }
      // After refresh, re-read to find the new expiry and schedule.
      try {
        const nextTokens = await readTokens();
        const nextExpiry = nextTokens ? getGoogleTokenExpiryEpochMs(nextTokens) : null;
        if (nextExpiry === null) {
          scheduleNext(FALLBACK_RETRY_MS);
        } else {
          scheduleNext(
            Math.max(
              nextExpiry - now() - PROACTIVE_REFRESH_MARGIN_MS,
              GOOGLE_TOKEN_REFRESH_SKEW_MS,
            ),
          );
        }
      } catch {
        scheduleNext(FALLBACK_RETRY_MS);
      }
      return;
    }

    scheduleNext(Math.max(refreshAt - nowMs, GOOGLE_TOKEN_REFRESH_SKEW_MS));
  };

  // Fire an immediate probe so we catch a token that's already past
  // its refresh window when the scheduler starts (e.g. after a long
  // tab sleep on laptops returning from suspend).
  void tick();

  return {
    stop: () => {
      stopped = true;
      clearTimer(currentTimer);
      currentTimer = null;
    },
  };
}
