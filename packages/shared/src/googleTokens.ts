import type { GoogleTokenBundle } from "@v3tools/contracts";

export const GOOGLE_TOKEN_REFRESH_SKEW_MS = 60_000;

export function getGoogleTokenExpiryEpochMs(tokens: GoogleTokenBundle): number | null {
  const parsed = Date.parse(tokens.expiresAt);
  return Number.isFinite(parsed) ? parsed : null;
}

export function shouldRefreshGoogleTokens(
  tokens: GoogleTokenBundle,
  now: number = Date.now(),
): boolean {
  const expiry = getGoogleTokenExpiryEpochMs(tokens);
  if (expiry === null) {
    return true;
  }
  return expiry - now <= GOOGLE_TOKEN_REFRESH_SKEW_MS;
}

export function withGoogleTokenExpiry(
  tokens: Omit<GoogleTokenBundle, "expiresAt">,
  expiresInSeconds: number,
  now: number = Date.now(),
): GoogleTokenBundle {
  return {
    ...tokens,
    expiresAt: new Date(now + Math.max(expiresInSeconds, 1) * 1_000).toISOString(),
  };
}
