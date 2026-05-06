import { DownloadIcon } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";

import { useSettings, useUpdateSettings } from "../../hooks/useSettings";
import {
  deriveLatestContextWindowSnapshot,
  formatContextWindowTokens,
} from "../../lib/contextWindow";
import {
  deriveLatestProviderLimitSnapshot,
  providerLimitSummary,
  type ProviderLimitSnapshot,
} from "../../lib/providerUsage";
import { selectThreadsAcrossEnvironments, useStore } from "../../store";
import type { Thread } from "../../types";
import { Button } from "../ui/button";

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: ReadonlyArray<ReadonlyArray<unknown>>) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function messagesForCsv(thread: Thread): string {
  return thread.messages
    .filter((message) => message.text.trim().length > 0)
    .map((message) => {
      const timestamp = message.createdAt ? ` ${message.createdAt}` : "";
      return `[${message.role}${timestamp}]\n${message.text}`;
    })
    .join("\n\n");
}

function durationMsForThread(thread: Thread, nowMs: number): number | null {
  const start = thread.latestTurn?.startedAt ?? thread.latestTurn?.requestedAt ?? null;
  if (!start) return null;
  const end =
    thread.latestTurn?.completedAt ?? (thread.session?.status === "running" ? null : start);
  const startMs = Date.parse(start);
  const endMs = end ? Date.parse(end) : nowMs;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
  return endMs - startMs;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "Unavailable";
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function UsageSettings() {
  const usage = useSettings((settings) => settings.usage);
  const { updateSettings } = useUpdateSettings();
  const threads = useStore(useShallow(selectThreadsAcrossEnvironments));
  const nowMs = Date.now();
  const stats = useMemo(() => {
    const active = threads.filter((thread) => thread.session?.status === "running").length;
    const archived = threads.filter((thread) => thread.archivedAt !== null).length;
    const turns = threads.reduce((sum, thread) => sum + (thread.latestTurn ? 1 : 0), 0);
    const byProvider = new Map<string, number>();
    let contextUsedTokens = 0;
    let totalProcessedTokens = 0;
    let activeDurationMs = 0;
    let limitReportCount = 0;
    const latestLimitReports: ProviderLimitSnapshot[] = [];

    for (const thread of threads) {
      const provider = thread.modelSelection.provider;
      byProvider.set(provider, (byProvider.get(provider) ?? 0) + 1);

      const contextWindow = deriveLatestContextWindowSnapshot(thread.activities);
      if (contextWindow) {
        contextUsedTokens += contextWindow.usedTokens;
        totalProcessedTokens += contextWindow.totalProcessedTokens ?? contextWindow.usedTokens;
      }

      const duration = durationMsForThread(thread, nowMs);
      if (thread.session?.status === "running" && duration !== null) {
        activeDurationMs += duration;
      }

      const limitSnapshot = deriveLatestProviderLimitSnapshot(thread);
      if (limitSnapshot) {
        limitReportCount += 1;
        latestLimitReports.push(limitSnapshot);
      }
    }

    latestLimitReports.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

    return {
      active,
      archived,
      turns,
      byProvider,
      contextUsedTokens,
      totalProcessedTokens,
      activeDurationMs,
      limitReportCount,
      latestLimitReports: latestLimitReports.slice(0, 5),
    };
  }, [nowMs, threads]);

  const exportRows = () => {
    const includeMessages = usage.exportCsvIncludesPrompts;
    downloadCsv("v3-usage.csv", [
      [
        "thread_id",
        "environment_id",
        "title",
        "provider",
        "model",
        "status",
        "context_used_tokens",
        "total_processed_tokens",
        "provider_limit_summary",
        "archived_at",
        ...(includeMessages ? ["messages"] : []),
      ],
      ...threads.map((thread) => {
        const contextWindow = deriveLatestContextWindowSnapshot(thread.activities);
        const providerLimit = deriveLatestProviderLimitSnapshot(thread);
        return [
          thread.id,
          thread.environmentId,
          thread.title,
          thread.modelSelection.provider,
          thread.modelSelection.model,
          thread.session?.status ?? "idle",
          contextWindow?.usedTokens ?? "",
          contextWindow?.totalProcessedTokens ?? "",
          providerLimitSummary(providerLimit),
          thread.archivedAt ?? "",
          ...(includeMessages ? [messagesForCsv(thread)] : []),
        ];
      }),
    ]);
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Usage</h3>
            <p className="text-xs text-muted-foreground">
              Token totals and quota snapshots use provider-reported events only. Exact remaining
              quota is shown only when the provider reports it.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={exportRows}>
            <DownloadIcon className="size-3.5" />
            Export CSV
          </Button>
        </header>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Chats" value={threads.length} />
          <Stat label="Active" value={stats.active} />
          <Stat label="Context tokens" value={formatContextWindowTokens(stats.contextUsedTokens)} />
          <Stat
            label="Processed tokens"
            value={formatContextWindowTokens(stats.totalProcessedTokens)}
          />
          <Stat label="Archived" value={stats.archived} />
          <Stat label="Latest turns" value={stats.turns} />
          <Stat label="Active runtime" value={formatDuration(stats.activeDurationMs)} />
          <Stat label="Limit reports" value={stats.limitReportCount} />
        </div>
      </section>

      <section className="space-y-3">
        <header>
          <h3 className="text-sm font-semibold text-foreground">Provider breakdown</h3>
        </header>
        <div className="space-y-2">
          {[...stats.byProvider.entries()].map(([provider, count]) => (
            <div
              key={provider}
              className="flex items-center justify-between rounded-lg border border-border bg-card/40 px-3 py-2 text-sm"
            >
              <span className="font-medium text-foreground">{provider}</span>
              <span className="text-muted-foreground">{count} chats</span>
            </div>
          ))}
          {stats.byProvider.size === 0 ? (
            <div className="rounded-lg border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
              Usage appears after the first chat is created.
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <header>
          <h3 className="text-sm font-semibold text-foreground">Provider limit snapshots</h3>
          <p className="text-xs text-muted-foreground">
            Some providers expose exact quota fields, some only report that a limit state changed.
          </p>
        </header>
        <div className="space-y-2">
          {stats.latestLimitReports.map((snapshot) => (
            <div
              key={`${snapshot.provider}:${snapshot.updatedAt}`}
              className="rounded-lg border border-border bg-card/40 px-3 py-2 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-foreground">{snapshot.provider}</span>
                <span className="text-muted-foreground">
                  {new Date(snapshot.updatedAt).toLocaleString()}
                </span>
              </div>
              <div className="mt-1 text-muted-foreground">{providerLimitSummary(snapshot)}</div>
              {snapshot.resetAt ? (
                <div className="mt-1 text-muted-foreground">Resets {snapshot.resetAt}</div>
              ) : null}
            </div>
          ))}
          {stats.latestLimitReports.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
              No provider has reported rate-limit or quota details yet.
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs">
          <span className="font-medium text-foreground">Retention days</span>
          <input
            type="number"
            min={1}
            max={3650}
            value={usage.retentionDays}
            onChange={(event) =>
              updateSettings({
                usage: {
                  ...usage,
                  retentionDays: Math.max(1, Number(event.currentTarget.value) || 90),
                },
              })
            }
            className="h-8 w-full rounded-md border border-border bg-background px-2"
          />
        </label>
        <label className="space-y-1 text-xs">
          <span className="font-medium text-foreground">Pricing table URL</span>
          <input
            value={usage.pricingTableUrl}
            onChange={(event) =>
              updateSettings({
                usage: { ...usage, pricingTableUrl: event.currentTarget.value },
              })
            }
            className="h-8 w-full rounded-md border border-border bg-background px-2"
            placeholder="https://..."
          />
        </label>
        <label className="flex min-h-14 items-center gap-2 rounded-lg border border-border bg-card/40 p-3 text-xs text-foreground sm:col-span-2">
          <input
            type="checkbox"
            checked={usage.exportCsvIncludesPrompts}
            onChange={(event) =>
              updateSettings({
                usage: {
                  ...usage,
                  exportCsvIncludesPrompts: event.currentTarget.checked,
                },
              })
            }
            className="h-4 w-4 accent-primary"
          />
          Include prompt/message text in CSV exports
        </label>
      </section>
    </div>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}
