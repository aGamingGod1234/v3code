import type { MessageId, OrchestrationThreadActivity, TurnId } from "@v3tools/contracts";

import type { ChatMessage, Thread } from "../types";
import { formatContextWindowTokens } from "./contextWindow";

const MILLISECONDS_PER_SECOND = 1000;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * MILLISECONDS_PER_SECOND;
const WEEK_START_OFFSET_DAYS = 4;

export interface ModelRunStats {
  readonly turnId: TurnId | null;
  readonly provider: string;
  readonly model: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly timeToFirstTokenMs: number | null;
  readonly durationMs: number | null;
  readonly tokensPerSecond: number | null;
  readonly totalTokens: number | null;
  readonly inputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly outputTokens: number | null;
  readonly reasoningOutputTokens: number | null;
  readonly toolCalls: number;
}

export interface ModelRunStatsAggregate {
  readonly runs: number;
  readonly timeToFirstTokenMs: number | null;
  readonly durationMs: number | null;
  readonly tokensPerSecond: number | null;
  readonly totalTokens: number;
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly reasoningOutputTokens: number;
  readonly toolCalls: number;
}

export interface ModelUsageBucket {
  readonly key: string;
  readonly label: string;
  readonly runs: number;
  readonly totalTokens: number;
  readonly outputTokens: number;
  readonly toolCalls: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function elapsedMs(
  start: string | null | undefined,
  end: string | null | undefined,
): number | null {
  const startMs = parseTime(start);
  const endMs = parseTime(end);
  if (startMs === null || endMs === null || endMs < startMs) return null;
  return endMs - startMs;
}

function positiveDurationMs(value: number | null): number | null {
  return value !== null && value > 0 ? value : null;
}

function positiveOrZero(value: number | null | undefined): number {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;
}

function computeDurationStartByMessageId(
  messages: ReadonlyArray<ChatMessage>,
): Map<MessageId, string> {
  const result = new Map<MessageId, string>();
  let lastBoundary: string | null = null;

  for (const message of messages) {
    if (message.role === "user") {
      lastBoundary = message.createdAt;
    }
    result.set(message.id, lastBoundary ?? message.createdAt);
    if (message.role === "assistant" && message.completedAt) {
      lastBoundary = message.completedAt;
    }
  }

  return result;
}

function findUsagePayloadForTurn(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  turnId: TurnId | null | undefined,
  completedAt: string | null | undefined,
): Record<string, unknown> | null {
  const completedAtMs = parseTime(completedAt);

  for (let index = activities.length - 1; index >= 0; index -= 1) {
    const activity = activities[index];
    if (!activity || activity.kind !== "context-window.updated") continue;
    if (turnId && activity.turnId !== turnId) continue;
    if (!turnId && completedAtMs !== null) {
      const activityMs = parseTime(activity.createdAt);
      if (activityMs !== null && activityMs > completedAtMs + MILLISECONDS_PER_SECOND) {
        continue;
      }
    }
    return asRecord(activity.payload);
  }

  return null;
}

function countToolActivitiesForTurn(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  turnId: TurnId | null | undefined,
): number {
  if (!turnId) return 0;
  const seen = new Set<string>();
  for (const activity of activities) {
    if (activity.turnId !== turnId || activity.tone !== "tool") continue;
    const payload = asRecord(activity.payload);
    const toolKey =
      typeof payload?.itemId === "string"
        ? payload.itemId
        : typeof payload?.id === "string"
          ? payload.id
          : activity.id;
    seen.add(toolKey);
  }
  return seen.size;
}

function totalTokensFromPayload(payload: Record<string, unknown> | null): number | null {
  const direct =
    asFiniteNumber(payload?.lastUsedTokens) ??
    asFiniteNumber(payload?.usedTokens) ??
    asFiniteNumber(payload?.totalProcessedTokens);
  if (direct !== null && direct > 0) return direct;

  const input = positiveOrZero(asFiniteNumber(payload?.lastInputTokens));
  const output = positiveOrZero(asFiniteNumber(payload?.lastOutputTokens));
  const reasoning = positiveOrZero(asFiniteNumber(payload?.lastReasoningOutputTokens));
  const total = input + output + reasoning;
  return total > 0 ? total : null;
}

function rateForOutput(
  outputTokens: number | null,
  totalTokens: number | null,
  durationMs: number | null,
): number | null {
  const durationSeconds =
    durationMs !== null && durationMs > 0 ? durationMs / MILLISECONDS_PER_SECOND : null;
  if (durationSeconds === null) return null;
  const numerator =
    outputTokens !== null && outputTokens > 0
      ? outputTokens
      : totalTokens !== null && totalTokens > 0
        ? totalTokens
        : null;
  return numerator === null ? null : numerator / durationSeconds;
}

export function deriveAssistantMessageModelStats(thread: Thread): Map<MessageId, ModelRunStats> {
  const durationStartByMessageId = computeDurationStartByMessageId(thread.messages);
  const result = new Map<MessageId, ModelRunStats>();

  for (const message of thread.messages) {
    if (message.role !== "assistant" || message.streaming || !message.completedAt) {
      continue;
    }

    const startedAt = durationStartByMessageId.get(message.id) ?? message.createdAt;
    const usage = findUsagePayloadForTurn(thread.activities, message.turnId, message.completedAt);
    const outputTokens =
      asFiniteNumber(usage?.lastOutputTokens) ?? asFiniteNumber(usage?.outputTokens);
    const totalTokens = totalTokensFromPayload(usage);
    const durationMs =
      positiveDurationMs(asFiniteNumber(usage?.durationMs)) ??
      positiveDurationMs(elapsedMs(startedAt, message.completedAt));
    const toolCalls =
      Math.round(positiveOrZero(asFiniteNumber(usage?.toolUses))) ||
      countToolActivitiesForTurn(thread.activities, message.turnId);

    result.set(message.id, {
      turnId: message.turnId ?? null,
      provider: thread.modelSelection.provider,
      model: thread.modelSelection.model,
      startedAt,
      completedAt: message.completedAt,
      timeToFirstTokenMs: elapsedMs(startedAt, message.createdAt),
      durationMs,
      tokensPerSecond: rateForOutput(outputTokens, totalTokens, durationMs),
      totalTokens,
      inputTokens: asFiniteNumber(usage?.lastInputTokens) ?? asFiniteNumber(usage?.inputTokens),
      cachedInputTokens:
        asFiniteNumber(usage?.lastCachedInputTokens) ?? asFiniteNumber(usage?.cachedInputTokens),
      outputTokens,
      reasoningOutputTokens:
        asFiniteNumber(usage?.lastReasoningOutputTokens) ??
        asFiniteNumber(usage?.reasoningOutputTokens),
      toolCalls,
    });
  }

  return result;
}

export function deriveThreadModelRunStats(thread: Thread): ModelRunStatsAggregate {
  return aggregateModelRunStats([...deriveAssistantMessageModelStats(thread).values()]);
}

export function aggregateModelRunStats(runs: ReadonlyArray<ModelRunStats>): ModelRunStatsAggregate {
  let totalTokens = 0;
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let outputTokens = 0;
  let reasoningOutputTokens = 0;
  let toolCalls = 0;
  const ttft: number[] = [];
  const durations: number[] = [];

  for (const run of runs) {
    totalTokens += positiveOrZero(run.totalTokens);
    inputTokens += positiveOrZero(run.inputTokens);
    cachedInputTokens += positiveOrZero(run.cachedInputTokens);
    outputTokens += positiveOrZero(run.outputTokens);
    reasoningOutputTokens += positiveOrZero(run.reasoningOutputTokens);
    toolCalls += run.toolCalls;
    if (run.timeToFirstTokenMs !== null) ttft.push(run.timeToFirstTokenMs);
    if (run.durationMs !== null) durations.push(run.durationMs);
  }

  const durationMs = sum(durations);
  return {
    runs: runs.length,
    timeToFirstTokenMs: average(ttft),
    durationMs: durationMs > 0 ? durationMs : null,
    tokensPerSecond:
      outputTokens > 0 && durationMs > 0
        ? outputTokens / (durationMs / MILLISECONDS_PER_SECOND)
        : null,
    totalTokens,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningOutputTokens,
    toolCalls,
  };
}

export function collectModelRunStats(threads: ReadonlyArray<Thread>): ModelRunStats[] {
  return threads.flatMap((thread) => [...deriveAssistantMessageModelStats(thread).values()]);
}

export function buildModelUsageBuckets(
  runs: ReadonlyArray<ModelRunStats>,
  period: "week" | "month",
): ModelUsageBucket[] {
  const buckets = new Map<string, ModelUsageBucket>();
  for (const run of runs) {
    const completedAt = parseTime(run.completedAt);
    if (completedAt === null) continue;
    const key =
      period === "week" ? weekKey(new Date(completedAt)) : monthKey(new Date(completedAt));
    const existing = buckets.get(key) ?? {
      key,
      label: period === "week" ? formatWeekLabel(key) : formatMonthLabel(key),
      runs: 0,
      totalTokens: 0,
      outputTokens: 0,
      toolCalls: 0,
    };
    buckets.set(key, {
      ...existing,
      runs: existing.runs + 1,
      totalTokens: existing.totalTokens + positiveOrZero(run.totalTokens),
      outputTokens: existing.outputTokens + positiveOrZero(run.outputTokens),
      toolCalls: existing.toolCalls + run.toolCalls,
    });
  }
  return [...buckets.values()].toSorted((left, right) => left.key.localeCompare(right.key));
}

export function formatModelStatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "n/a";
  if (ms < MILLISECONDS_PER_SECOND) return `${Math.round(ms)} ms`;
  const seconds = ms / MILLISECONDS_PER_SECOND;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0).replace(/\.0$/, "")}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

export function formatTokens(value: number | null): string {
  return formatContextWindowTokens(value);
}

export function formatTokenRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  if (value < 10) return `${value.toFixed(1).replace(/\.0$/, "")}/s`;
  return `${Math.round(value)}/s`;
}

function sum(values: ReadonlyArray<number>): number {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: ReadonlyArray<number>): number | null {
  return values.length === 0 ? null : sum(values) / values.length;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function weekKey(date: Date): string {
  const utcDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const weekStart =
    utcDay - ((new Date(utcDay).getUTCDay() + WEEK_START_OFFSET_DAYS) % 7) * MILLISECONDS_PER_DAY;
  return new Date(weekStart).toISOString().slice(0, 10);
}

function formatWeekLabel(key: string): string {
  return `Week of ${key.slice(5)}`;
}

function formatMonthLabel(key: string): string {
  const [year, month] = key.split("-");
  if (!year || !month) return key;
  return new Date(Number(year), Number(month) - 1, 1).toLocaleString(undefined, {
    month: "short",
    year: "numeric",
  });
}
