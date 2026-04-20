// V3 Phase 2g — Admin panel.
//
// Four tabs on a single page: Overview, Sessions, Event log, Logs.
// Cloud env containers render as an empty state until P8 lands.
//
// The route itself renders in every runtime mode, but every server
// endpoint the page calls into (`/api/v3/admin/*`) returns 403 in
// `desktop` / `web` mode. The page detects this at fetch time and
// shows a "server-node only" banner instead of blanket-hiding on the
// client side — that way an operator on the desktop checkpoint can
// still navigate to `/admin` to learn why it's not available.

import {
  AdminActiveSessionsResponse,
  AdminContainersResponse,
  AdminEventLogResponse,
  AdminLogsResponse,
  AdminSummaryResponse,
} from "@v3tools/contracts";
import { DateTime, Schema } from "effect";
import { createFileRoute } from "@tanstack/react-router";
import {
  ActivityIcon,
  ContainerIcon,
  DatabaseIcon,
  FileTextIcon,
  RefreshCwIcon,
  ShieldAlertIcon,
  UsersIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { resolvePrimaryEnvironmentHttpUrl } from "../environments/primary";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";

const formatIsoDate = (value: DateTime.Utc | null): string =>
  value === null ? "—" : new Date(DateTime.toEpochMillis(value)).toLocaleString();

export const Route = createFileRoute("/admin")({
  component: V3AdminPage,
});

type Tab = "overview" | "sessions" | "event-log" | "containers" | "logs";

function V3AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  return (
    <div className="mx-auto flex h-dvh max-w-6xl flex-col gap-4 overflow-hidden px-6 py-6 text-foreground">
      <header className="flex items-center justify-between border-b border-border/70 pb-3">
        <div>
          <h1 className="text-xl font-semibold">V3 server node admin</h1>
          <p className="text-xs text-muted-foreground">
            Read-only view of the process hosting this V3 mesh.
          </p>
        </div>
      </header>
      <nav className="flex gap-2 border-b border-border/50 pb-2 text-sm">
        {(
          [
            { value: "overview", label: "Overview", Icon: ActivityIcon },
            { value: "sessions", label: "Sessions", Icon: UsersIcon },
            { value: "event-log", label: "Event log", Icon: DatabaseIcon },
            { value: "containers", label: "Containers", Icon: ContainerIcon },
            { value: "logs", label: "Logs", Icon: FileTextIcon },
          ] as const
        ).map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === value
                ? "bg-primary/15 text-foreground"
                : "text-muted-foreground hover:bg-muted/40",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </nav>
      <main className="min-h-0 flex-1 overflow-auto rounded-md border border-border/60 bg-muted/20 p-4">
        {tab === "overview" ? <OverviewTab /> : null}
        {tab === "sessions" ? <SessionsTab /> : null}
        {tab === "event-log" ? <EventLogTab /> : null}
        {tab === "containers" ? <ContainersTab /> : null}
        {tab === "logs" ? <LogsTab /> : null}
      </main>
    </div>
  );
}

interface FetchState<T> {
  readonly loading: boolean;
  readonly data: T | null;
  readonly error: string | null;
}

const initialState = <T,>(): FetchState<T> => ({ loading: true, data: null, error: null });

function useAdminEndpoint<T>(
  path: string,
  decoder: (input: unknown) => T,
): FetchState<T> & { refresh: () => void } {
  const [state, setState] = useState<FetchState<T>>(initialState<T>());
  const refresh = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const controller = new AbortController();
    void fetch(resolvePrimaryEnvironmentHttpUrl(path), {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const message =
            response.status === 403 || response.status === 404
              ? "Admin endpoints are only available in server-node mode."
              : `Request failed with status ${response.status}`;
          setState({ loading: false, data: null, error: message });
          return;
        }
        const parsed = decoder(await response.json());
        setState({ loading: false, data: parsed, error: null });
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setState({
          loading: false,
          data: null,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return () => controller.abort();
  }, [path, decoder]);
  useEffect(() => {
    return refresh();
  }, [refresh]);
  return { ...state, refresh };
}

function StatCard({
  label,
  value,
  hint,
}: {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-background px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function ErrorBanner({ message }: { readonly message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <ShieldAlertIcon className="mt-0.5 size-3.5" />
      <span>{message}</span>
    </div>
  );
}

function OverviewTab() {
  const summary = useAdminEndpoint(
    "/api/v3/admin/summary",
    Schema.decodeUnknownSync(AdminSummaryResponse),
  );
  if (summary.error) return <ErrorBanner message={summary.error} />;
  if (summary.loading || !summary.data) {
    return <p className="text-xs text-muted-foreground">Loading server info…</p>;
  }
  const { server, activeSessionCount, chatCount, totalEventCount, totalEventBytes } = summary.data;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Mode" value={server.mode} />
        <StatCard label="Version" value={server.version} />
        <StatCard
          label="Uptime"
          value={`${Math.floor(server.uptimeSeconds / 60)} min`}
          hint={`Started ${formatIsoDate(server.startedAt)}`}
        />
        <StatCard label="Public URL" value={server.publicUrl ?? "(not configured)"} />
        <StatCard
          label="Postgres"
          value={server.postgresConnected ? "Connected" : "Not configured"}
        />
        <StatCard
          label="Docker"
          value={server.dockerAvailable ? "Available" : "Not installed"}
          hint="Required by P8 Cloud env."
        />
        <StatCard
          label="Google sign-in"
          value={server.googleConfigured ? "Configured" : "Missing"}
        />
        <StatCard label="GitHub OAuth" value={server.githubConfigured ? "Configured" : "Missing"} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Active sessions" value={String(activeSessionCount)} />
        <StatCard label="Chats" value={String(chatCount)} />
        <StatCard
          label="Event log"
          value={`${totalEventCount} events`}
          hint={`${(totalEventBytes / 1024).toFixed(1)} KB`}
        />
      </div>
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={summary.refresh} className="gap-1">
          <RefreshCwIcon className="size-3" />
          Refresh
        </Button>
      </div>
    </div>
  );
}

function SessionsTab() {
  const result = useAdminEndpoint(
    "/api/v3/admin/sessions",
    Schema.decodeUnknownSync(AdminActiveSessionsResponse),
  );
  if (result.error) return <ErrorBanner message={result.error} />;
  if (result.loading || !result.data) {
    return <p className="text-xs text-muted-foreground">Loading sessions…</p>;
  }
  if (result.data.sessions.length === 0) {
    return <p className="text-xs text-muted-foreground">No sessions have been issued yet.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={result.refresh} className="gap-1">
          <RefreshCwIcon className="size-3" />
          Refresh
        </Button>
      </div>
      <div className="overflow-auto rounded-md border border-border/60">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Device</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Last heartbeat</th>
              <th className="px-3 py-2">Session id</th>
            </tr>
          </thead>
          <tbody>
            {result.data.sessions.map((row) => (
              <tr key={row.sessionId} className="border-t border-border/50">
                <td className="px-3 py-2">
                  <div className="font-medium text-foreground">{row.deviceName ?? "—"}</div>
                  <div className="text-muted-foreground">
                    {row.devicePlatform ?? "?"} · {row.deviceKind ?? "?"}
                  </div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{row.userEmail ?? "—"}</td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
                      row.connected
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-muted/60 text-muted-foreground",
                    )}
                  >
                    {row.connected ? "Connected" : "Idle"}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {formatIsoDate(row.lastHeartbeatAt)}
                </td>
                <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                  {row.sessionId.slice(0, 16)}…
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EventLogTab() {
  const result = useAdminEndpoint(
    "/api/v3/admin/event-log",
    Schema.decodeUnknownSync(AdminEventLogResponse),
  );
  if (result.error) return <ErrorBanner message={result.error} />;
  if (result.loading || !result.data) {
    return <p className="text-xs text-muted-foreground">Loading event log stats…</p>;
  }
  if (result.data.chats.length === 0) {
    return <p className="text-xs text-muted-foreground">No chat events have been recorded yet.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {result.data.totalEventCount} events across {result.data.chats.length} chats ·{" "}
          {(result.data.totalSizeBytes / 1024).toFixed(1)} KB total
        </div>
        <Button variant="outline" size="sm" onClick={result.refresh} className="gap-1">
          <RefreshCwIcon className="size-3" />
          Refresh
        </Button>
      </div>
      <div className="overflow-auto rounded-md border border-border/60">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Chat</th>
              <th className="px-3 py-2">Events</th>
              <th className="px-3 py-2">Size</th>
              <th className="px-3 py-2">Last event</th>
            </tr>
          </thead>
          <tbody>
            {result.data.chats.map((row) => (
              <tr key={row.chatId} className="border-t border-border/50">
                <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">
                  <div className="text-foreground">{row.title ?? row.chatId.slice(0, 12)}</div>
                  <div>{row.chatId.slice(0, 16)}…</div>
                </td>
                <td className="px-3 py-2 text-foreground">{row.eventCount.toLocaleString()}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {(row.sizeBytes / 1024).toFixed(1)} KB
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {formatIsoDate(row.lastEventAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ContainersTab() {
  const result = useAdminEndpoint(
    "/api/v3/admin/containers",
    Schema.decodeUnknownSync(AdminContainersResponse),
  );
  if (result.error) return <ErrorBanner message={result.error} />;
  if (result.loading || !result.data) {
    return <p className="text-xs text-muted-foreground">Loading containers…</p>;
  }
  if (!result.data.dockerAvailable) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center text-xs text-muted-foreground">
        <ContainerIcon className="size-8 text-muted-foreground/40" />
        <p>Docker is not available on this server node.</p>
        <p>Cloud env chats ship in P8 — check back once that lands.</p>
      </div>
    );
  }
  if (result.data.containers.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No Cloud env chats are running right now.</p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={result.refresh} className="gap-1">
          <RefreshCwIcon className="size-3" />
          Refresh
        </Button>
      </div>
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Chat</th>
            <th className="px-3 py-2">Container</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">CPU</th>
            <th className="px-3 py-2">Memory</th>
            <th className="px-3 py-2">Uptime</th>
          </tr>
        </thead>
        <tbody>
          {result.data.containers.map((row) => (
            <tr key={row.containerId} className="border-t border-border/50">
              <td className="px-3 py-2 font-mono text-[10px]">{row.chatId.slice(0, 16)}…</td>
              <td className="px-3 py-2 font-mono text-[10px]">{row.containerId.slice(0, 12)}…</td>
              <td className="px-3 py-2">{row.status}</td>
              <td className="px-3 py-2">{row.cpuCount} cores</td>
              <td className="px-3 py-2">{row.memoryMb} MB</td>
              <td className="px-3 py-2">{Math.floor(row.uptimeSeconds / 60)} min</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LogsTab() {
  const result = useAdminEndpoint(
    "/api/v3/admin/logs?tail=200",
    Schema.decodeUnknownSync(AdminLogsResponse),
  );
  if (result.error) return <ErrorBanner message={result.error} />;
  if (result.loading || !result.data) {
    return <p className="text-xs text-muted-foreground">Loading logs…</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Tail of <span className="font-mono">{result.data.filePath}</span> ·{" "}
          {result.data.lines.length} lines
        </div>
        <Button variant="outline" size="sm" onClick={result.refresh} className="gap-1">
          <RefreshCwIcon className="size-3" />
          Refresh
        </Button>
      </div>
      <pre className="h-[60vh] overflow-auto rounded-md border border-border/60 bg-background p-3 text-[11px] font-mono text-muted-foreground">
        {result.data.lines.length === 0 ? "(log file is empty)" : result.data.lines.join("\n")}
      </pre>
    </div>
  );
}
