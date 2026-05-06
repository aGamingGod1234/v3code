import type { Thread } from "../types";
import { formatContextWindowTokens } from "./contextWindow";

export interface ProviderLimitSnapshot {
  readonly provider: string;
  readonly activityId: string;
  readonly turnId: string | null;
  readonly updatedAt: string;
  readonly remaining: number | null;
  readonly limit: number | null;
  readonly resetAt: string | null;
  readonly exactRemainingAvailable: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function findNumberByKey(value: unknown, keys: ReadonlyArray<string>): number | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findNumberByKey(item, keys);
      if (result !== null) return result;
    }
    return null;
  }
  const record = asRecord(value);
  if (!record) return null;
  for (const key of keys) {
    const result = asFiniteNumber(record[key]);
    if (result !== null) return result;
  }
  for (const nested of Object.values(record)) {
    const result = findNumberByKey(nested, keys);
    if (result !== null) return result;
  }
  return null;
}

function findStringByKey(value: unknown, keys: ReadonlyArray<string>): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findStringByKey(item, keys);
      if (result !== null) return result;
    }
    return null;
  }
  const record = asRecord(value);
  if (!record) return null;
  for (const key of keys) {
    const result = asString(record[key]);
    if (result !== null) return result;
  }
  for (const nested of Object.values(record)) {
    const result = findStringByKey(nested, keys);
    if (result !== null) return result;
  }
  return null;
}

export function deriveLatestProviderLimitSnapshot(
  thread: Thread,
  options: { readonly turnId?: string | null } = {},
): ProviderLimitSnapshot | null {
  for (let index = thread.activities.length - 1; index >= 0; index -= 1) {
    const activity = thread.activities[index];
    if (!activity || activity.kind !== "provider.rate-limits.updated") continue;
    if (options.turnId !== undefined && activity.turnId !== options.turnId) continue;
    const payload = asRecord(activity.payload);
    const rateLimits = payload?.rateLimits;
    const remaining = findNumberByKey(rateLimits, [
      "remaining",
      "remainingTokens",
      "tokensRemaining",
      "requestsRemaining",
      "remaining_requests",
      "remaining_tokens",
    ]);
    const limit = findNumberByKey(rateLimits, ["limit", "max", "quota", "total"]);
    const resetAt = findStringByKey(rateLimits, [
      "resetAt",
      "reset_at",
      "resetsAt",
      "resets_at",
      "resetTime",
    ]);
    return {
      provider: asString(payload?.provider) ?? thread.modelSelection.provider,
      activityId: activity.id,
      turnId: activity.turnId,
      updatedAt: activity.createdAt,
      remaining,
      limit,
      resetAt,
      exactRemainingAvailable: remaining !== null,
    };
  }
  return null;
}

export function providerLimitSummary(snapshot: ProviderLimitSnapshot | null): string {
  if (!snapshot) return "No provider report";
  if (!snapshot.exactRemainingAvailable) return "Provider report, exact remaining unavailable";
  const limit = snapshot.limit !== null ? ` / ${formatContextWindowTokens(snapshot.limit)}` : "";
  return `${formatContextWindowTokens(snapshot.remaining)}${limit} remaining`;
}

export function hasExplicitUsageLimitSignal(thread: Thread): boolean {
  const turnId = thread.latestTurn?.turnId ?? null;
  if (turnId === null) return false;

  const snapshot = deriveLatestProviderLimitSnapshot(thread, { turnId });
  if (snapshot !== null && snapshot.remaining !== null && snapshot.remaining <= 0) return true;
  const latestRuntimeError = thread.activities
    .toReversed()
    .find((activity) => activity.kind === "runtime.error" && activity.turnId === turnId);
  if (!latestRuntimeError) return false;
  const payload = asRecord(latestRuntimeError?.payload);
  const text = [asString(payload?.message), latestRuntimeError?.summary]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
  return /\b(rate.?limit|usage.?limit|quota|too many requests|insufficient[_\s-]?quota)\b/.test(
    text,
  );
}
