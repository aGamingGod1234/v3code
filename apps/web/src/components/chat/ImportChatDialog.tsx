// ImportChatDialog — three ways to ingest a chat transcript:
//   1. Scan local: enumerate ~/.codex/sessions and ~/.claude/projects
//      via the desktop bridge, pick a file, parse + send to the server
//      for skill/MCP resolution. Desktop only.
//   2. Upload file: pick a transcript via <input type="file">, parse it,
//      send to server. Works on web + desktop.
//   3. Paste JSON: drop a transcript directly into a textarea and
//      auto-detect format.
//
// In every flow, the parser runs in the renderer (pure, lives in
// @v3tools/shared/chatImport), and the server call is mesh.importChat
// which today returns skill/MCP resolution + a message-count preview.
// Persistence as a real orchestration thread is a follow-up — for now,
// the dialog surfaces what would be enabled and lets the user copy
// missing IDs to clipboard for manual install.

import { useCallback, useState } from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  FileTextIcon,
  FolderSearchIcon,
  LoaderIcon,
  UploadCloudIcon,
} from "lucide-react";
import {
  CommandId,
  ThreadId,
  type ChatImportFormat,
  type DesktopTranscriptEntry,
  type MeshImportChatResult,
  type ParsedChat,
} from "@v3tools/contracts";
import { parseChatImport } from "@v3tools/shared/chatImport";

import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { getPrimaryEnvironmentConnection } from "../../environments/runtime";

type Mode = "scan" | "upload" | "paste";

interface PendingImport {
  readonly source: string;
  readonly parsed: ParsedChat;
}

const FORMAT_LABEL: Record<ChatImportFormat, string> = {
  codex: "Codex",
  claude: "Claude Code",
  "anthropic-console": "Anthropic Console",
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ModeTabs({
  mode,
  onChange,
  hasDesktopBridge,
}: {
  readonly mode: Mode;
  readonly onChange: (next: Mode) => void;
  readonly hasDesktopBridge: boolean;
}) {
  const tabClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
      active
        ? "bg-foreground text-background"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`;
  return (
    <div className="flex items-center gap-1 border-b border-border pb-3">
      {hasDesktopBridge ? (
        <button
          type="button"
          className={tabClass(mode === "scan")}
          onClick={() => onChange("scan")}
        >
          <FolderSearchIcon className="size-3.5" />
          Scan local
        </button>
      ) : null}
      <button
        type="button"
        className={tabClass(mode === "upload")}
        onClick={() => onChange("upload")}
      >
        <UploadCloudIcon className="size-3.5" />
        Upload file
      </button>
      <button
        type="button"
        className={tabClass(mode === "paste")}
        onClick={() => onChange("paste")}
      >
        <FileTextIcon className="size-3.5" />
        Paste JSON
      </button>
    </div>
  );
}

function ScanLocalTab({
  onPicked,
}: {
  readonly onPicked: (entry: DesktopTranscriptEntry, content: string) => void;
}) {
  const bridge = window.desktopBridge?.chatImport;
  const [entries, setEntries] = useState<ReadonlyArray<DesktopTranscriptEntry> | null>(null);
  const [loading, setLoading] = useState(false);
  const [readingPath, setReadingPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!bridge) return;
    setLoading(true);
    setError(null);
    try {
      const result = await bridge.listLocalTranscripts();
      setEntries(result.entries);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not list transcripts.");
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  if (!bridge) {
    return (
      <Alert>
        <AlertTitle>Desktop only</AlertTitle>
        <AlertDescription>
          Local-disk scan is only available in the V3 desktop app. Use Upload or Paste in the
          browser.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Scans <code>~/.codex/sessions</code> and{" "}
          <code>~/.claude/projects/&lt;slug&gt;/sessions</code>.
        </p>
        <Button size="xs" variant="outline" onClick={() => void refresh()} disabled={loading}>
          {loading ? <LoaderIcon className="size-3 animate-spin" /> : null}
          {entries === null ? "Scan now" : "Refresh"}
        </Button>
      </div>
      {error ? (
        <Alert variant="error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {entries !== null ? (
        entries.length === 0 ? (
          <Alert>
            <AlertTitle>No transcripts found</AlertTitle>
            <AlertDescription>
              Neither <code>~/.codex/sessions</code> nor any{" "}
              <code>~/.claude/projects/*/sessions</code> folder contained <code>.jsonl</code> files.
              If you've used Codex or Claude Code, those host CLIs should have created these
              directories — check that the host is installed and you've signed in at least once.
            </AlertDescription>
          </Alert>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-border bg-background">
            {entries.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  disabled={readingPath !== null}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-muted disabled:cursor-wait disabled:opacity-60"
                  onClick={async () => {
                    setReadingPath(entry.path);
                    try {
                      const file = await bridge.readTranscript(entry.path);
                      onPicked(entry, file.content);
                    } catch (cause) {
                      toastManager.add({
                        type: "error",
                        title: "Could not read transcript",
                        description: cause instanceof Error ? cause.message : String(cause),
                      });
                    } finally {
                      setReadingPath(null);
                    }
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-foreground">
                      {entry.preview ?? entry.path}
                    </div>
                    <div className="truncate text-[10px] text-muted-foreground">
                      {FORMAT_LABEL[entry.format]} · {formatBytes(entry.bytes)} ·{" "}
                      {new Date(entry.modifiedAt).toLocaleString()}
                    </div>
                  </div>
                  {readingPath === entry.path ? (
                    <LoaderIcon className="size-3 shrink-0 animate-spin text-muted-foreground" />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}

function UploadTab({ onParsed }: { readonly onParsed: (source: string, content: string) => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Pick a <code>.jsonl</code> (Codex or Claude Code) or <code>.json</code> (Anthropic Console)
        file. Parsing happens locally; only the parsed structure is sent to the server.
      </p>
      <input
        type="file"
        accept=".jsonl,.json,application/json"
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0];
          if (!file) return;
          setError(null);
          try {
            const content = await file.text();
            onParsed(file.name, content);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not read file.");
          }
        }}
        className="block w-full text-xs file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-foreground hover:file:bg-muted/80"
      />
      {error ? (
        <Alert variant="error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

function PasteTab({ onParsed }: { readonly onParsed: (source: string, content: string) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Paste the entire transcript file contents below. Format is auto-detected.
      </p>
      <Textarea
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
        placeholder='{"messages":[{"role":"user","content":"..."}, ...]}  or  one JSON envelope per line'
        rows={8}
        className="font-mono text-xs"
      />
      <Button
        size="sm"
        disabled={text.trim().length === 0}
        onClick={() => onParsed("Pasted transcript", text)}
      >
        Parse + import
      </Button>
    </div>
  );
}

function ResolutionPanel({
  pending,
  result,
}: {
  readonly pending: PendingImport;
  readonly result: MeshImportChatResult;
}) {
  const enabledSkills = result.skills.filter((s) => s.status === "enabled");
  const missingSkills = result.skills.filter((s) => s.status === "missing");
  const enabledMcps = result.mcpServers.filter((s) => s.status === "enabled");
  const missingMcps = result.mcpServers.filter((s) => s.status === "missing");

  const copyMissing = (items: ReadonlyArray<{ readonly id: string }>) => {
    const text = items.map((i) => i.id).join("\n");
    const writeText = navigator.clipboard?.writeText;
    if (!writeText) {
      toastManager.add({
        type: "error",
        title: "Clipboard unavailable",
        description: "Copy isn't supported in this browser context.",
      });
      return;
    }
    void writeText
      .call(navigator.clipboard, text)
      .then(() => {
        toastManager.add({ type: "success", title: "Copied", description: `${items.length} ids` });
      })
      .catch(() => {
        toastManager.add({
          type: "error",
          title: "Copy failed",
          description: "Couldn't write to clipboard. Copy manually from the list.",
        });
      });
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3 text-xs">
      <div>
        <div className="font-medium text-foreground">{pending.parsed.title ?? pending.source}</div>
        <div className="text-muted-foreground">
          {FORMAT_LABEL[pending.parsed.format]} · {result.importedMessageCount} messages
          {pending.parsed.sourceModel ? ` · ${pending.parsed.sourceModel}` : ""}
        </div>
      </div>

      <ResolutionRow
        title={`Skills enabled (${enabledSkills.length})`}
        icon={<CheckCircle2Icon className="size-3.5 text-success" />}
        items={enabledSkills.map((s) => s.id)}
      />
      {missingSkills.length > 0 ? (
        <ResolutionRow
          title={`Skills referenced but not installed (${missingSkills.length})`}
          icon={<AlertCircleIcon className="size-3.5 text-warning" />}
          items={missingSkills.map((s) => s.id)}
          onCopy={() => copyMissing(missingSkills)}
        />
      ) : null}
      <ResolutionRow
        title={`MCP servers enabled (${enabledMcps.length})`}
        icon={<CheckCircle2Icon className="size-3.5 text-success" />}
        items={enabledMcps.map((s) => s.id)}
      />
      {missingMcps.length > 0 ? (
        <ResolutionRow
          title={`MCP servers referenced but not installed (${missingMcps.length})`}
          icon={<AlertCircleIcon className="size-3.5 text-warning" />}
          items={missingMcps.map((s) => s.id)}
          onCopy={() => copyMissing(missingMcps)}
        />
      ) : null}

      <Alert>
        <CircleDashedIcon />
        <AlertTitle>Preview only</AlertTitle>
        <AlertDescription>
          The resolved import isn't yet persisted as a new chat thread. Persistence ships in a
          follow-up. For now, the missing-skill / missing-MCP lists above are the actionable output
          — install the host CLI tooling that provides them and re-import.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function ResolutionRow({
  title,
  icon,
  items,
  onCopy,
}: {
  readonly title: string;
  readonly icon: React.ReactNode;
  readonly items: ReadonlyArray<string>;
  readonly onCopy?: () => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          <span>{title}</span>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-foreground">
          {icon}
          <span>{title}</span>
        </div>
        {onCopy ? (
          <button
            type="button"
            className="text-[10px] text-muted-foreground hover:text-foreground"
            onClick={onCopy}
          >
            Copy ids
          </button>
        ) : null}
      </div>
      <ul className="space-y-0.5 pl-5 font-mono text-[11px]">
        {items.map((id) => (
          <li key={id}>{id}</li>
        ))}
      </ul>
    </div>
  );
}

export function ImportChatDialog({ trigger }: { readonly trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const hasDesktopBridge =
    typeof window !== "undefined" && Boolean(window.desktopBridge?.chatImport);
  const [mode, setMode] = useState<Mode>(hasDesktopBridge ? "scan" : "upload");
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [result, setResult] = useState<MeshImportChatResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPending(null);
    setResult(null);
    setParseError(null);
  }, []);

  const handleParsed = useCallback((source: string, content: string) => {
    setParseError(null);
    setResult(null);
    const outcome = parseChatImport(content);
    if (!outcome.ok) {
      setParseError(outcome.error.message);
      setPending(null);
      return;
    }
    setPending({ source, parsed: outcome.parsed });
  }, []);

  const submit = useCallback(async () => {
    if (!pending) return;
    setSubmitting(true);
    try {
      const connection = getPrimaryEnvironmentConnection();
      const response = await connection.client.mesh.importChat({
        command: {
          type: "chat.import" as const,
          commandId: CommandId.make(crypto.randomUUID()),
          targetThreadId: ThreadId.make(crypto.randomUUID()),
          parsed: pending.parsed,
          createdAt: new Date().toISOString(),
        },
      });
      setResult(response);
    } catch (cause) {
      toastManager.add({
        type: "error",
        title: "Import failed",
        description: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      setSubmitting(false);
    }
  }, [pending]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import a chat</DialogTitle>
          <DialogDescription>
            Bring a Codex CLI, Claude Code, or Anthropic Console transcript into V3. Skills and MCP
            servers referenced in the transcript that you already have installed will be flagged as
            enabled — anything missing is surfaced for manual install.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <ModeTabs mode={mode} onChange={setMode} hasDesktopBridge={hasDesktopBridge} />
          {mode === "scan" ? (
            <ScanLocalTab onPicked={(entry, content) => handleParsed(entry.path, content)} />
          ) : null}
          {mode === "upload" ? <UploadTab onParsed={handleParsed} /> : null}
          {mode === "paste" ? <PasteTab onParsed={handleParsed} /> : null}

          {parseError ? (
            <Alert variant="error">
              <AlertTitle>Parse failed</AlertTitle>
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          ) : null}

          {pending && !result ? (
            <div className="rounded-md border border-border bg-background p-3 text-xs">
              <div className="font-medium text-foreground">
                {pending.parsed.title ?? pending.source}
              </div>
              <div className="text-muted-foreground">
                {FORMAT_LABEL[pending.parsed.format]} · {pending.parsed.messages.length} messages ·{" "}
                {pending.parsed.references.skillIds.length} skills ·{" "}
                {pending.parsed.references.mcpServerIds.length} MCPs referenced
              </div>
              <div className="mt-3">
                <Button size="sm" onClick={() => void submit()} disabled={submitting}>
                  {submitting ? <LoaderIcon className="mr-2 size-3 animate-spin" /> : null}
                  Resolve references
                </Button>
              </div>
            </div>
          ) : null}

          {pending && result ? <ResolutionPanel pending={pending} result={result} /> : null}
        </DialogPanel>
        <DialogFooter variant="bare">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
