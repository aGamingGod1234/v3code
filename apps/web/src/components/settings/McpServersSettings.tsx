import type { McpServerSettings } from "@v3tools/contracts";
import { BoxesIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";

import { useSettings, useUpdateSettings } from "../../hooks/useSettings";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";

type McpDraft = McpServerSettings;

const DEFAULT_TIMEOUT_SECONDS = 30;

const createDraft = (): McpDraft => ({
  id: crypto.randomUUID(),
  name: "",
  enabled: true,
  transport: "stdio",
  command: "",
  args: "",
  url: "",
  env: "",
  disabledTools: "",
  timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
});

function normalizeDraft(draft: McpDraft): McpDraft {
  return {
    ...draft,
    name: draft.name.trim(),
    command: draft.command.trim(),
    args: draft.args.trim(),
    url: draft.url.trim(),
    env: draft.env.trim(),
    disabledTools: draft.disabledTools.trim(),
    timeoutSeconds: Math.max(1, Math.min(600, Math.round(Number(draft.timeoutSeconds) || 30))),
  };
}

function parseEnvPreview(raw: string): string {
  const count = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.includes("=")).length;
  return count === 0 ? "No env vars" : `${count} env var${count === 1 ? "" : "s"}`;
}

export function McpServersSettings() {
  const servers = useSettings((settings) => settings.mcpServers);
  const { updateSettings } = useUpdateSettings();
  const [draft, setDraft] = useState<McpDraft>(() => createDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enabledCount = useMemo(() => servers.filter((server) => server.enabled).length, [servers]);

  const resetDraft = () => {
    setDraft(createDraft());
    setEditingId(null);
    setError(null);
  };

  const saveDraft = () => {
    const normalized = normalizeDraft(draft);
    if (!normalized.name) {
      setError("Server name is required.");
      return;
    }
    if (normalized.transport === "stdio" && !normalized.command) {
      setError("Stdio servers need a command.");
      return;
    }
    if (normalized.transport !== "stdio" && !normalized.url) {
      setError("HTTP/SSE servers need a URL.");
      return;
    }
    const next = editingId
      ? servers.map((server) => (server.id === editingId ? normalized : server))
      : [...servers, normalized];
    updateSettings({ mcpServers: next });
    resetDraft();
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">MCP servers</h3>
            <p className="text-xs text-muted-foreground">
              Configure Model Context Protocol servers that provider sessions can mount at run
              start. Environment variables are stored in local settings and never echoed in chat.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {enabledCount}/{servers.length} enabled
          </div>
        </header>

        <div className="space-y-2">
          {servers.map((server) => (
            <div
              key={server.id}
              className="flex flex-col gap-3 rounded-lg border border-border bg-card/40 p-3 sm:flex-row sm:items-center"
            >
              <BoxesIcon className="hidden size-4 text-muted-foreground sm:block" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {server.name}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {server.transport}
                  </span>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {server.transport === "stdio" ? server.command : server.url} ·{" "}
                  {parseEnvPreview(server.env)}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="xs"
                  variant={server.enabled ? "outline" : "ghost"}
                  onClick={() =>
                    updateSettings({
                      mcpServers: servers.map((candidate) =>
                        candidate.id === server.id
                          ? { ...candidate, enabled: !candidate.enabled }
                          : candidate,
                      ),
                    })
                  }
                >
                  {server.enabled ? "Enabled" : "Disabled"}
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setDraft(server);
                    setEditingId(server.id);
                    setError(null);
                  }}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  aria-label="Delete MCP server"
                  onClick={() =>
                    updateSettings({
                      mcpServers: servers.filter((candidate) => candidate.id !== server.id),
                    })
                  }
                >
                  <Trash2Icon className="size-3" />
                </Button>
              </div>
            </div>
          ))}
          {servers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground">
              No MCP servers configured. Add the command or URL from your Codex, Claude, Cursor, or
              Windsurf MCP setup.
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card/40 p-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-foreground">
              {editingId ? "Edit MCP server" : "Add MCP server"}
            </h4>
            <p className="text-xs text-muted-foreground">
              Use stdio for local commands, or HTTP/SSE for remote MCP endpoints.
            </p>
          </div>
          {editingId ? (
            <Button type="button" size="xs" variant="ghost" onClick={resetDraft}>
              Cancel
            </Button>
          ) : null}
        </header>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs">
            <span className="font-medium text-foreground">Name</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
              className="h-8 w-full rounded-md border border-border bg-background px-2"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="font-medium text-foreground">Transport</span>
            <select
              value={draft.transport}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  transport: event.currentTarget.value as McpDraft["transport"],
                })
              }
              className="h-8 w-full rounded-md border border-border bg-background px-2"
            >
              <option value="stdio">stdio</option>
              <option value="sse">SSE</option>
              <option value="http">HTTP</option>
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="font-medium text-foreground">Command</span>
            <input
              value={draft.command}
              onChange={(event) => setDraft({ ...draft, command: event.currentTarget.value })}
              disabled={draft.transport !== "stdio"}
              className="h-8 w-full rounded-md border border-border bg-background px-2 disabled:opacity-60"
              placeholder="npx"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="font-medium text-foreground">Args</span>
            <input
              value={draft.args}
              onChange={(event) => setDraft({ ...draft, args: event.currentTarget.value })}
              disabled={draft.transport !== "stdio"}
              className="h-8 w-full rounded-md border border-border bg-background px-2 disabled:opacity-60"
              placeholder="-y @modelcontextprotocol/server-filesystem"
            />
          </label>
          <label className="space-y-1 text-xs sm:col-span-2">
            <span className="font-medium text-foreground">URL</span>
            <input
              value={draft.url}
              onChange={(event) => setDraft({ ...draft, url: event.currentTarget.value })}
              disabled={draft.transport === "stdio"}
              className="h-8 w-full rounded-md border border-border bg-background px-2 disabled:opacity-60"
              placeholder="https://mcp.example.com/sse"
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="font-medium text-foreground">Environment</span>
            <Textarea
              value={draft.env}
              rows={4}
              onChange={(event) => setDraft({ ...draft, env: event.currentTarget.value })}
              className="font-mono text-xs"
              placeholder={"KEY=value\nANOTHER=value"}
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="font-medium text-foreground">Disabled tools</span>
            <Textarea
              value={draft.disabledTools}
              rows={4}
              onChange={(event) => setDraft({ ...draft, disabledTools: event.currentTarget.value })}
              className="font-mono text-xs"
              placeholder={"tool_one\ntool_two"}
            />
          </label>
        </div>
        {error ? <div className="text-xs text-destructive">{error}</div> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={resetDraft}>
            Reset
          </Button>
          <Button type="button" size="sm" onClick={saveDraft}>
            <PlusIcon className="size-3.5" />
            {editingId ? "Save server" : "Add server"}
          </Button>
        </div>
      </section>
    </div>
  );
}
