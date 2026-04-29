import { DownloadIcon } from "lucide-react";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { useSettings, useUpdateSettings } from "../../hooks/useSettings";
import { selectThreadsAcrossEnvironments, useStore } from "../../store";
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

export function UsageSettings() {
  const usage = useSettings((settings) => settings.usage);
  const { updateSettings } = useUpdateSettings();
  const threads = useStore(useShallow(selectThreadsAcrossEnvironments));
  const stats = useMemo(() => {
    const active = threads.filter((thread) => thread.session?.status === "running").length;
    const archived = threads.filter((thread) => thread.archivedAt !== null).length;
    const turns = threads.reduce((sum, thread) => sum + (thread.latestTurn ? 1 : 0), 0);
    const byProvider = new Map<string, number>();
    for (const thread of threads) {
      const provider = thread.modelSelection.provider;
      byProvider.set(provider, (byProvider.get(provider) ?? 0) + 1);
    }
    return { active, archived, turns, byProvider };
  }, [threads]);

  const exportRows = () => {
    downloadCsv("v3-usage.csv", [
      ["thread_id", "environment_id", "title", "provider", "model", "status", "archived_at"],
      ...threads.map((thread) => [
        thread.id,
        thread.environmentId,
        thread.title,
        thread.modelSelection.provider,
        thread.modelSelection.model,
        thread.session?.status ?? "idle",
        thread.archivedAt ?? "",
      ]),
    ]);
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Usage</h3>
            <p className="text-xs text-muted-foreground">
              Local usage is derived from projected chats and runtime state. Server-node event-log
              totals are also available in Control Center.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={exportRows}>
            <DownloadIcon className="size-3.5" />
            Export CSV
          </Button>
        </header>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Chats" value={threads.length} />
          <Stat label="Active" value={stats.active} />
          <Stat label="Archived" value={stats.archived} />
          <Stat label="Latest turns" value={stats.turns} />
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
        <label className="flex items-center gap-2 rounded-lg border border-border bg-card/40 p-3 text-xs text-foreground sm:col-span-2">
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
          />
          Include prompt/message text in CSV exports
        </label>
      </section>
    </div>
  );
}

function Stat({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}
