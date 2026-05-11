// ImportChatDialog - ingest a provider-specific transcript into V3.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { scopeThreadRef } from "@v3tools/client-runtime";
import {
  CommandId,
  ThreadId,
  type ChatImportFormat,
  type DesktopParsedTranscriptSummary,
  type DesktopTranscriptEntry,
  type DesktopTranscriptListing,
  type DesktopTranscriptScanProvider,
  type DesktopTranscriptScannedRoot,
  type EnvironmentId,
  type MeshImportChatResult,
  type ParsedChat,
} from "@v3tools/contracts";
import { parseChatImport } from "@v3tools/shared/chatImport";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  FileTextIcon,
  FolderOpenIcon,
  FolderSearchIcon,
  LoaderIcon,
  UploadCloudIcon,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import { getPrimaryEnvironmentConnection } from "../../environments/runtime";
import { selectProjectsForEnvironment, useStore } from "../../store";
import { buildThreadRouteParams } from "../../threadRoutes";
import { resolveOrCreateProjectFromFolder } from "../../lib/startThreadFromFolder";
import { useMeshCurrentDeviceId } from "../../rpc/meshState";
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
import {
  buildImportProjectPlan,
  commitChatImports,
  summarizeImportCommitResult,
  type ImportCommitFailure,
  type ImportCommitParsedSummary,
  type ImportCommitProgress,
  type ImportCommitToastSummary,
} from "./importChatCommit";

type Mode = "scan" | "upload" | "paste";

interface PendingImport {
  readonly id: string;
  readonly source: string;
  readonly parsed: ImportCommitParsedSummary;
  readonly messageCount: number;
  readonly inlineParsed: ParsedChat | null;
  readonly desktopRead: DesktopPendingImportReadHandle | null;
  readonly enabled: boolean;
}

interface DesktopPendingImportReadHandle {
  readonly sessionId: string;
  readonly transcriptId: string;
  readonly format: ChatImportFormat;
}

interface ImportResultEntry {
  readonly environmentId: EnvironmentId;
  readonly pending: PendingImport;
  readonly result: MeshImportChatResult;
}

const FORMAT_LABEL: Record<ChatImportFormat, string> = {
  codex: "Codex",
  claude: "Claude Code",
  "anthropic-console": "Anthropic Console",
};

function isChatImportFormat(format: DesktopTranscriptEntry["format"]): format is ChatImportFormat {
  return format === "codex" || format === "claude" || format === "anthropic-console";
}

const ENTRY_FORMAT_LABEL: Record<DesktopTranscriptEntry["format"], string> = {
  codex: "Codex",
  claude: "Claude Code",
  "anthropic-console": "Anthropic Console",
  "gemini-cli": "Gemini CLI",
  cursor: "Cursor",
  windsurf: "Windsurf",
  opencode: "OpenCode",
  custom: "Custom",
  unknown: "Unknown",
};

const SCAN_PROVIDERS: ReadonlyArray<{
  readonly id: DesktopTranscriptScanProvider;
  readonly label: string;
  readonly description: string;
}> = [
  { id: "all", label: "All", description: "all supported local roots" },
  { id: "codex", label: "Codex", description: "~/.codex/sessions" },
  { id: "claude", label: "Claude", description: "~/.claude/projects" },
  { id: "anthropic-console", label: "Anthropic", description: "JSON exports" },
  { id: "custom", label: "Custom", description: "manual folder" },
];

const PAGE_SIZE = 100;

function summarizeParsedChat(parsed: ParsedChat): ImportCommitParsedSummary {
  return {
    format: parsed.format,
    title: parsed.title,
    sourceProvider: parsed.sourceProvider,
    sourceModel: parsed.sourceModel,
    sourceWorkspaceRoot: parsed.sourceWorkspaceRoot,
    startedAt: parsed.startedAt,
    references: parsed.references,
  };
}

function summarizeDesktopParsedTranscript(
  parsed: DesktopParsedTranscriptSummary,
): ImportCommitParsedSummary {
  return {
    format: parsed.format,
    title: parsed.title,
    sourceProvider: parsed.sourceProvider,
    sourceModel: parsed.sourceModel,
    sourceWorkspaceRoot: parsed.sourceWorkspaceRoot,
    startedAt: parsed.startedAt,
    references: parsed.references,
  };
}

function errorText(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : String(cause || fallback);
}

function readPrimaryEnvironmentIdForImport(): EnvironmentId | null {
  try {
    return getPrimaryEnvironmentConnection().environmentId;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function parserStatusLabel(entry: DesktopTranscriptEntry): string {
  switch (entry.parserStatus) {
    case "ready":
      return "Importable";
    case "unsupported":
      return "Recognized, parser pending";
    case "unknown":
      return "Unknown format";
  }
}

function modeTabClass(active: boolean): string {
  return `inline-flex min-h-8 min-w-28 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
    active
      ? "bg-foreground text-background"
      : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;
}

function StatusProgress({ label, value }: { readonly label: string; readonly value: number }) {
  const clampedValue = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs">
      <div className="mb-1.5 flex items-center justify-between gap-3 text-muted-foreground">
        <span className="truncate">{label}</span>
        <span className="shrink-0 font-mono">{Math.round(clampedValue * 100)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-200"
          style={{ width: `${clampedValue * 100}%` }}
        />
      </div>
    </div>
  );
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
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-border pb-3">
      {hasDesktopBridge ? (
        <button
          type="button"
          className={modeTabClass(mode === "scan")}
          onClick={() => onChange("scan")}
        >
          <FolderSearchIcon className="size-3.5" />
          Scan local
        </button>
      ) : null}
      <button
        type="button"
        className={modeTabClass(mode === "upload")}
        onClick={() => onChange("upload")}
      >
        <UploadCloudIcon className="size-3.5" />
        Upload file
      </button>
      <button
        type="button"
        className={modeTabClass(mode === "paste")}
        onClick={() => onChange("paste")}
      >
        <FileTextIcon className="size-3.5" />
        Paste JSON
      </button>
    </div>
  );
}

function ProviderPicker({
  provider,
  onChange,
  disabled,
}: {
  readonly provider: DesktopTranscriptScanProvider;
  readonly onChange: (provider: DesktopTranscriptScanProvider) => void;
  readonly disabled: boolean;
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-4">
      {SCAN_PROVIDERS.map((option) => {
        const active = option.id === provider;
        return (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.id)}
            className={`min-h-14 rounded-md border px-2.5 py-2 text-left text-xs transition-colors disabled:cursor-wait disabled:opacity-60 ${
              active
                ? "border-primary bg-primary/5 text-foreground"
                : "border-border bg-card/30 text-muted-foreground hover:border-border/70 hover:text-foreground"
            }`}
          >
            <span className="block font-medium">{option.label}</span>
            <span className="mt-0.5 block truncate text-[10px]">{option.description}</span>
          </button>
        );
      })}
    </div>
  );
}

function ScannedRootsFooter({
  scannedRoots,
}: {
  readonly scannedRoots: ReadonlyArray<DesktopTranscriptScannedRoot>;
}) {
  if (scannedRoots.length === 0) return null;
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground">
      <div className="mb-1 font-medium uppercase tracking-wide">Scanned</div>
      <ul className="space-y-0.5">
        {scannedRoots.map((root) => (
          <li
            key={`${root.path}|${root.format}`}
            className="flex items-center justify-between gap-3"
          >
            <span className="truncate font-mono">{root.path}</span>
            <span className="shrink-0">
              {root.existed ? `${root.fileCount} file${root.fileCount === 1 ? "" : "s"}` : "-"}
              {root.truncated ? " (truncated)" : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScanLocalTab({
  onPickedMany,
}: {
  readonly onPickedMany: (
    items: ReadonlyArray<{
      readonly entry: DesktopTranscriptEntry;
      readonly summary: ImportCommitParsedSummary;
      readonly messageCount: number;
      readonly readHandle: DesktopPendingImportReadHandle;
    }>,
    failures: ReadonlyArray<string>,
  ) => void;
}) {
  const bridge = window.desktopBridge?.chatImport;
  const localBridge = window.desktopBridge;
  const sessionRef = useRef<string | null>(null);
  const [provider, setProvider] = useState<DesktopTranscriptScanProvider>("all");
  const [listing, setListing] = useState<DesktopTranscriptListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanningFolder, setScanningFolder] = useState(false);
  const [readingId, setReadingId] = useState<string | null>(null);
  const [bulkReading, setBulkReading] = useState(false);
  const [bulkReadProgress, setBulkReadProgress] = useState<{
    readonly completed: number;
    readonly total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [previewById, setPreviewById] = useState<Record<string, string | null>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const previewedRef = useRef<Set<string>>(new Set());

  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (!bridge) return null;
    if (sessionRef.current) return sessionRef.current;
    const result = await bridge.openSession();
    sessionRef.current = result.sessionId;
    previewedRef.current = new Set();
    return result.sessionId;
  }, [bridge]);

  const resetListing = useCallback(() => {
    setListing(null);
    setPageSize(PAGE_SIZE);
    previewedRef.current = new Set();
    setPreviewById({});
    setSelectedIds(new Set());
  }, []);

  const refresh = useCallback(async () => {
    if (!bridge) return;
    setLoading(true);
    setError(null);
    try {
      const sessionId = await ensureSession();
      if (!sessionId) return;
      const result = await bridge.listLocal({ sessionId, provider });
      setListing(result);
      setPageSize(PAGE_SIZE);
      previewedRef.current = new Set();
      setPreviewById({});
      setSelectedIds(
        new Set(
          result.entries
            .filter((entry) => entry.parserStatus === "ready")
            .map((entry) => entry.transcriptId),
        ),
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not list transcripts.";
      if (message === "session-expired") {
        sessionRef.current = null;
        try {
          const newSessionId = await ensureSession();
          if (!newSessionId) return;
          const result = await bridge.listLocal({ sessionId: newSessionId, provider });
          setListing(result);
          setPageSize(PAGE_SIZE);
          previewedRef.current = new Set();
          setPreviewById({});
          setSelectedIds(
            new Set(
              result.entries
                .filter((entry) => entry.parserStatus === "ready")
                .map((entry) => entry.transcriptId),
            ),
          );
          return;
        } catch (retryCause) {
          setError(retryCause instanceof Error ? retryCause.message : message);
        }
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [bridge, ensureSession, provider]);

  const chooseFolder = useCallback(async () => {
    if (!bridge || !localBridge) return;
    setScanningFolder(true);
    setError(null);
    try {
      const folderPath = await localBridge.pickFolder();
      if (!folderPath) return;
      const sessionId = await ensureSession();
      if (!sessionId) return;
      const result = await bridge.scanFolder({ sessionId, folderPath, provider });
      setListing(result);
      setPageSize(PAGE_SIZE);
      previewedRef.current = new Set();
      setPreviewById({});
      setSelectedIds(
        new Set(
          result.entries
            .filter((entry) => entry.parserStatus === "ready")
            .map((entry) => entry.transcriptId),
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not scan folder.");
    } finally {
      setScanningFolder(false);
    }
  }, [bridge, ensureSession, localBridge, provider]);

  useEffect(() => {
    if (!bridge) return;
    let cancelled = false;
    resetListing();
    void (async () => {
      try {
        await ensureSession();
        if (cancelled) return;
        await refresh();
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge, ensureSession, provider, refresh, resetListing]);

  useEffect(() => {
    return () => {
      const sessionId = sessionRef.current;
      sessionRef.current = null;
      if (sessionId) {
        void bridge?.closeSession({ sessionId }).catch(() => {});
      }
    };
  }, [bridge]);

  const visibleEntries = useMemo(
    () =>
      (listing?.entries ?? [])
        .filter((entry) => provider !== "all" || entry.parserStatus === "ready")
        .slice(0, pageSize),
    [listing?.entries, pageSize, provider],
  );
  const selectedReadyEntries = useMemo(
    () =>
      (listing?.entries ?? []).filter(
        (entry) => entry.parserStatus === "ready" && selectedIds.has(entry.transcriptId),
      ),
    [listing?.entries, selectedIds],
  );

  const importSelected = useCallback(async () => {
    if (!bridge) return;
    const sessionId = sessionRef.current;
    if (!sessionId || selectedReadyEntries.length === 0) return;
    setBulkReading(true);
    setBulkReadProgress({ completed: 0, total: selectedReadyEntries.length });
    setError(null);
    const items: Array<{
      entry: DesktopTranscriptEntry;
      summary: ImportCommitParsedSummary;
      messageCount: number;
      readHandle: DesktopPendingImportReadHandle;
    }> = [];
    const failures: string[] = [];
    try {
      for (const entry of selectedReadyEntries) {
        try {
          if (!isChatImportFormat(entry.format)) {
            failures.push(`${entry.title}: unsupported parser`);
            continue;
          }
          const summary = await bridge.readSummary({
            sessionId,
            transcriptId: entry.transcriptId,
          });
          items.push({
            entry,
            summary: summarizeDesktopParsedTranscript(summary),
            messageCount: summary.messageCount,
            readHandle: {
              sessionId,
              transcriptId: entry.transcriptId,
              format: entry.format,
            },
          });
        } catch (cause) {
          failures.push(`${entry.title}: ${errorText(cause, "Could not read transcript.")}`);
        } finally {
          setBulkReadProgress({
            completed: items.length + failures.length,
            total: selectedReadyEntries.length,
          });
        }
      }
      onPickedMany(items, failures);
    } catch (cause) {
      toastManager.add({
        type: "error",
        title: "Could not read selected transcripts",
        description: errorText(cause, "Could not read selected transcripts."),
      });
      setError(errorText(cause, "Could not read selected transcripts."));
    } finally {
      setBulkReading(false);
      setBulkReadProgress(null);
    }
  }, [bridge, onPickedMany, selectedReadyEntries]);

  useEffect(() => {
    if (!bridge) return;
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    const toFetch = visibleEntries.filter((entry) => !previewedRef.current.has(entry.transcriptId));
    if (toFetch.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const entry of toFetch) {
        if (cancelled) return;
        previewedRef.current.add(entry.transcriptId);
        try {
          const result = await bridge.readPreview({ sessionId, transcriptId: entry.transcriptId });
          if (cancelled) return;
          setPreviewById((current) => ({ ...current, [entry.transcriptId]: result.previewLine }));
        } catch {
          if (!cancelled) {
            setPreviewById((current) => ({ ...current, [entry.transcriptId]: null }));
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge, visibleEntries]);

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

  const allEntries =
    listing?.entries.filter((entry) => provider !== "all" || entry.parserStatus === "ready") ?? [];
  const totalVisibleEntries = allEntries.length;
  const hasMore = totalVisibleEntries > pageSize;
  const readyEntries = allEntries.filter((entry) => entry.parserStatus === "ready");
  const selectedProvider = SCAN_PROVIDERS.find((option) => option.id === provider);

  return (
    <div className="space-y-3">
      <ProviderPicker
        provider={provider}
        onChange={setProvider}
        disabled={loading || scanningFolder || readingId !== null}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Scanning {selectedProvider?.label ?? "selected provider"} transcripts.
        </p>
        <div className="flex items-center gap-1.5">
          {readyEntries.length > 0 ? (
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                setSelectedIds(
                  selectedReadyEntries.length === readyEntries.length
                    ? new Set()
                    : new Set(readyEntries.map((entry) => entry.transcriptId)),
                )
              }
              disabled={loading || scanningFolder || bulkReading}
            >
              {selectedReadyEntries.length === readyEntries.length ? "Clear" : "Select all"}
            </Button>
          ) : null}
          {readyEntries.length > 0 ? (
            <Button
              size="xs"
              onClick={() => void importSelected()}
              disabled={
                loading || scanningFolder || bulkReading || selectedReadyEntries.length === 0
              }
            >
              {bulkReading ? <LoaderIcon className="mr-1 size-3 animate-spin" /> : null}
              Prepare import ({selectedReadyEntries.length})
            </Button>
          ) : null}
          {localBridge ? (
            <Button
              size="xs"
              variant="outline"
              onClick={() => void chooseFolder()}
              disabled={loading || scanningFolder || bulkReading}
            >
              {scanningFolder ? (
                <LoaderIcon className="mr-1 size-3 animate-spin" />
              ) : (
                <FolderOpenIcon className="mr-1 size-3" />
              )}
              Choose folder
            </Button>
          ) : null}
          <Button size="xs" variant="outline" onClick={() => void refresh()} disabled={loading}>
            {loading ? <LoaderIcon className="mr-1 size-3 animate-spin" /> : null}
            {listing === null ? "Scan now" : "Refresh"}
          </Button>
        </div>
      </div>
      {error ? (
        <Alert variant="error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {bulkReadProgress ? (
        <StatusProgress
          label={`Reading ${bulkReadProgress.completed}/${bulkReadProgress.total} selected transcripts`}
          value={
            bulkReadProgress.total === 0 ? 0 : bulkReadProgress.completed / bulkReadProgress.total
          }
        />
      ) : null}
      {listing !== null ? (
        totalVisibleEntries === 0 ? (
          <>
            <Alert>
              <AlertTitle>No transcripts found</AlertTitle>
              <AlertDescription>
                The {selectedProvider?.label ?? "selected provider"} scan did not find any
                transcript files. Use Choose folder to point at an archive directory.
              </AlertDescription>
            </Alert>
            <ScannedRootsFooter scannedRoots={listing.scannedRoots} />
          </>
        ) : (
          <>
            <ul className="max-h-80 space-y-1 overflow-y-auto rounded-md border border-border bg-background">
              {visibleEntries.map((entry) => {
                const preview = previewById[entry.transcriptId] ?? entry.summary;
                const disabled = readingId !== null || entry.parserStatus !== "ready";
                const selected = selectedIds.has(entry.transcriptId);
                return (
                  <li key={entry.transcriptId}>
                    <div
                      title={
                        entry.parserStatus === "ready"
                          ? "Select transcript for import"
                          : "This provider is recognized, but V3 does not have a safe parser for it yet."
                      }
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2.5 text-left text-xs hover:bg-muted"
                    >
                      <label
                        className={`flex min-w-0 items-start gap-2 ${
                          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={disabled || bulkReading}
                          onChange={(event) => {
                            const checked = event.currentTarget.checked;
                            setSelectedIds((current) => {
                              const next = new Set(current);
                              if (checked) {
                                next.add(entry.transcriptId);
                              } else {
                                next.delete(entry.transcriptId);
                              }
                              return next;
                            });
                          }}
                          className="mt-1 h-4 w-4 shrink-0 accent-primary"
                        />
                        <div className="min-w-0 space-y-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {ENTRY_FORMAT_LABEL[entry.provider]}
                            </span>
                            <span className="min-w-0 truncate font-medium text-foreground">
                              {entry.title}
                            </span>
                          </div>
                          {preview ? (
                            <div className="line-clamp-2 text-[11px] text-muted-foreground">
                              {preview}
                            </div>
                          ) : null}
                          <div className="truncate font-mono text-[10px] text-muted-foreground">
                            {entry.displayPath}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {formatBytes(entry.bytes)} -{" "}
                            {new Date(entry.modifiedAt).toLocaleString()}
                          </div>
                        </div>
                      </label>
                      <div className="flex min-w-28 flex-col items-end gap-1">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] ${
                            entry.parserStatus === "ready"
                              ? "bg-success/10 text-success"
                              : "bg-warning/10 text-warning"
                          }`}
                        >
                          {parserStatusLabel(entry)}
                        </span>
                        {readingId === entry.transcriptId ? (
                          <LoaderIcon className="size-3 shrink-0 animate-spin text-muted-foreground" />
                        ) : null}
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={disabled || bulkReading}
                          onClick={async () => {
                            if (entry.parserStatus !== "ready") return;
                            const sessionId = sessionRef.current;
                            if (!sessionId) return;
                            setReadingId(entry.transcriptId);
                            try {
                              if (!isChatImportFormat(entry.format)) {
                                onPickedMany([], [`${entry.title}: unsupported parser`]);
                                return;
                              }
                              const summary = await bridge.readSummary({
                                sessionId,
                                transcriptId: entry.transcriptId,
                              });
                              onPickedMany(
                                [
                                  {
                                    entry,
                                    summary: summarizeDesktopParsedTranscript(summary),
                                    messageCount: summary.messageCount,
                                    readHandle: {
                                      sessionId,
                                      transcriptId: entry.transcriptId,
                                      format: entry.format,
                                    },
                                  },
                                ],
                                [],
                              );
                            } catch (cause) {
                              toastManager.add({
                                type: "error",
                                title: "Could not read transcript",
                                description: errorText(cause, "Could not read transcript."),
                              });
                            } finally {
                              setReadingId(null);
                            }
                          }}
                        >
                          Review
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {hasMore ? (
              <Button
                size="xs"
                variant="outline"
                onClick={() =>
                  setPageSize((current) => Math.min(current + PAGE_SIZE, allEntries.length))
                }
              >
                Show more ({totalVisibleEntries - pageSize} remaining)
              </Button>
            ) : null}
            <ScannedRootsFooter scannedRoots={listing.scannedRoots} />
          </>
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
        Pick a .jsonl transcript from Codex or Claude Code, or an Anthropic Console .json export.
        Parsing happens locally; only the parsed structure is sent to the server.
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
        Paste a full Codex, Claude Code, or Anthropic Console transcript. Unsupported provider
        formats are rejected instead of guessed.
      </p>
      <Textarea
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
        placeholder='{"messages":[{"role":"user","content":"..."}, ...]} or one JSON envelope per line'
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
        description: "Copy is not supported in this browser context.",
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
          description: "Could not write to clipboard. Copy manually from the list.",
        });
      });
  };

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3 text-xs">
      <div>
        <div className="font-medium text-foreground">{pending.parsed.title ?? pending.source}</div>
        <div className="text-muted-foreground">
          {FORMAT_LABEL[pending.parsed.format]} - {result.importedMessageCount} messages
          {pending.parsed.sourceModel ? ` - ${pending.parsed.sourceModel}` : ""}
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
  readonly icon: ReactNode;
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

function ReferenceToggleList({
  title,
  items,
  disabledIds,
  onChange,
}: {
  readonly title: string;
  readonly items: ReadonlyArray<string>;
  readonly disabledIds: ReadonlySet<string>;
  readonly onChange: (next: Set<string>) => void;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-muted/20 p-2">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {items.length > 0 ? (
        <div className="max-h-28 space-y-1 overflow-y-auto">
          {items.map((id) => {
            const enabled = !disabledIds.has(id);
            return (
              <label key={id} className="flex min-w-0 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    const next = new Set(disabledIds);
                    if (checked) {
                      next.delete(id);
                    } else {
                      next.add(id);
                    }
                    onChange(next);
                  }}
                  className="h-3.5 w-3.5 accent-primary"
                />
                <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
                  {id}
                </span>
              </label>
            );
          })}
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground">No references found.</div>
      )}
    </div>
  );
}

function ImportOutcomePanel({
  results,
  failures,
  onOpenFirst,
}: {
  readonly results: ReadonlyArray<ImportResultEntry>;
  readonly failures: ReadonlyArray<ImportCommitFailure>;
  readonly onOpenFirst: () => void;
}) {
  if (results.length === 0 && failures.length === 0) return null;

  const importedMessages = results.reduce(
    (total, entry) => total + entry.result.importedMessageCount,
    0,
  );
  const hasFailures = failures.length > 0;
  const title =
    results.length === 0
      ? "Import failed"
      : hasFailures
        ? "Import partially completed"
        : "Import completed";

  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            {results.length > 0 ? (
              <CheckCircle2Icon className="size-3.5 text-success" />
            ) : (
              <AlertCircleIcon className="size-3.5 text-destructive" />
            )}
            <span>{title}</span>
          </div>
          <div className="text-muted-foreground">
            {results.length} chat{results.length === 1 ? "" : "s"} imported, {importedMessages}{" "}
            message{importedMessages === 1 ? "" : "s"} written
            {hasFailures ? `, ${failures.length} failed` : ""}
          </div>
        </div>
        {results.length > 0 ? (
          <Button size="xs" variant="outline" onClick={onOpenFirst}>
            Open first imported chat
          </Button>
        ) : null}
      </div>

      {results.length > 0 ? (
        <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-border/70 bg-muted/20 p-2">
          {results.slice(0, 20).map(({ pending, result }) => (
            <div
              key={result.targetThreadId}
              className="flex items-center justify-between gap-2 text-[11px]"
            >
              <span className="min-w-0 truncate text-foreground">
                {pending.parsed.title ?? pending.source}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {result.importedMessageCount} messages
              </span>
            </div>
          ))}
          {results.length > 20 ? (
            <div className="text-[11px] text-muted-foreground">
              {results.length - 20} more imported chats hidden from this summary.
            </div>
          ) : null}
        </div>
      ) : null}

      {failures.length > 0 ? (
        <Alert variant={results.length > 0 ? "default" : "error"}>
          <AlertTitle>
            {failures.length} chat{failures.length === 1 ? "" : "s"} failed
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto">
              {failures.slice(0, 10).map((failure) => (
                <li key={failure.itemId}>
                  <span className="font-medium">{failure.title}</span>: {failure.message}
                </li>
              ))}
              {failures.length > 10 ? <li>{failures.length - 10} more failures hidden.</li> : null}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

export function ImportChatDialog({ trigger }: { readonly trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const hasDesktopBridge =
    typeof window !== "undefined" && Boolean(window.desktopBridge?.chatImport);
  const [mode, setMode] = useState<Mode>(hasDesktopBridge ? "scan" : "upload");
  const [pendingImports, setPendingImports] = useState<PendingImport[]>([]);
  const [results, setResults] = useState<ReadonlyArray<ImportResultEntry>>([]);
  const [importFailures, setImportFailures] = useState<ReadonlyArray<ImportCommitFailure>>([]);
  const [importProgress, setImportProgress] = useState<ImportCommitProgress | null>(null);
  const [disabledSkillIds, setDisabledSkillIds] = useState<Set<string>>(() => new Set());
  const [disabledMcpServerIds, setDisabledMcpServerIds] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [commitSummary, setCommitSummary] = useState<ImportCommitToastSummary | null>(null);
  const navigate = useNavigate();
  const currentDeviceId = useMeshCurrentDeviceId();

  const primaryEnvironmentId = open ? readPrimaryEnvironmentIdForImport() : null;
  const projectsInPrimary = useStore(
    useShallow((state) => selectProjectsForEnvironment(state, primaryEnvironmentId)),
  );
  const enabledPendingImports = useMemo(
    () => pendingImports.filter((item) => item.enabled),
    [pendingImports],
  );
  const pendingProjectPlan = useMemo(
    () => buildImportProjectPlan({ items: enabledPendingImports, projects: projectsInPrimary }),
    [enabledPendingImports, projectsInPrimary],
  );
  const pendingProjectSummaries = pendingProjectPlan.groups;
  const pendingReferenceSummary = useMemo(() => {
    const skillIds = new Set<string>();
    const mcpServerIds = new Set<string>();
    for (const item of enabledPendingImports) {
      item.parsed.references.skillIds.forEach((id) => skillIds.add(id));
      item.parsed.references.mcpServerIds.forEach((id) => mcpServerIds.add(id));
    }
    return {
      skillIds: [...skillIds].toSorted(),
      mcpServerIds: [...mcpServerIds].toSorted(),
    };
  }, [enabledPendingImports]);
  const canSubmitImport =
    enabledPendingImports.length > 0 && pendingProjectPlan.missingWorkspaceItemIds.length === 0;

  const reset = useCallback(() => {
    setPendingImports([]);
    setResults([]);
    setImportFailures([]);
    setImportProgress(null);
    setCommitSummary(null);
    setDisabledSkillIds(new Set());
    setDisabledMcpServerIds(new Set());
    setParseError(null);
  }, []);

  const handleParsed = useCallback((source: string, content: string, format?: ChatImportFormat) => {
    setParseError(null);
    setResults([]);
    setImportFailures([]);
    setImportProgress(null);
    setCommitSummary(null);
    setDisabledSkillIds(new Set());
    setDisabledMcpServerIds(new Set());
    const outcome = parseChatImport(content, format);
    if (!outcome.ok) {
      setParseError(outcome.error.message);
      setPendingImports([]);
      return;
    }
    setPendingImports([
      {
        id: crypto.randomUUID(),
        source,
        parsed: summarizeParsedChat(outcome.parsed),
        messageCount: outcome.parsed.messages.length,
        inlineParsed: outcome.parsed,
        desktopRead: null,
        enabled: true,
      },
    ]);
  }, []);

  const handleParsedMany = useCallback(
    (
      items: ReadonlyArray<{
        readonly entry: DesktopTranscriptEntry;
        readonly summary: ImportCommitParsedSummary;
        readonly messageCount: number;
        readonly readHandle: DesktopPendingImportReadHandle;
      }>,
      failures: ReadonlyArray<string>,
    ) => {
      setParseError(null);
      setResults([]);
      setImportFailures([]);
      setImportProgress(null);
      setCommitSummary(null);
      setDisabledSkillIds(new Set());
      setDisabledMcpServerIds(new Set());
      const parsed: PendingImport[] = items.map((item) => ({
        id: item.entry.transcriptId,
        source: item.entry.displayPath,
        parsed: item.summary,
        messageCount: item.messageCount,
        inlineParsed: null,
        desktopRead: item.readHandle,
        enabled: true,
      }));
      setPendingImports(parsed);
      if (failures.length > 0) {
        setParseError(
          `${failures.length} transcript${failures.length === 1 ? "" : "s"} could not be parsed. ${
            failures[0] ?? ""
          }`,
        );
      }
      if (parsed.length > 0) {
        toastManager.add({
          type: "default",
          title: "Ready to import",
          description: `${parsed.length} chat${
            parsed.length === 1 ? "" : "s"
          } prepared but not imported yet. Review the project grouping, then click Import selected.`,
        });
      } else {
        toastManager.add({
          type: "error",
          title: "No chats parsed",
          description:
            failures[0] ?? "Selected transcripts could not be parsed into importable chats.",
        });
      }
    },
    [],
  );

  const submit = useCallback(async () => {
    if (enabledPendingImports.length === 0) return;
    if (!canSubmitImport) {
      toastManager.add({
        type: "error",
        title: "Workspace path required",
        description: "Each selected transcript needs a parsed workspace path.",
      });
      return;
    }
    setSubmitting(true);
    setResults([]);
    setImportFailures([]);
    setCommitSummary(null);
    setImportProgress({
      phase: "resolving-project",
      completed: 0,
      total: enabledPendingImports.length,
      label: "Starting import",
    });
    try {
      const connection = getPrimaryEnvironmentConnection();
      const pendingById = new Map(enabledPendingImports.map((pending) => [pending.id, pending]));
      const commitResult = await commitChatImports({
        items: enabledPendingImports,
        disabledSkillIds,
        disabledMcpServerIds,
        makeThreadId: () => ThreadId.make(crypto.randomUUID()),
        resolveProject: (folderPath) =>
          resolveOrCreateProjectFromFolder({
            folderPath,
            projects: projectsInPrimary,
            primaryEnvironmentId: connection.environmentId,
          }),
        loadParsedChat: async (item) => {
          const pending = pendingById.get(item.id);
          if (!pending) {
            throw new Error(`Import item ${item.id} disappeared before commit.`);
          }
          if (pending.inlineParsed) return pending.inlineParsed;
          if (!pending.desktopRead) {
            throw new Error(`Import item ${item.id} does not have a transcript source.`);
          }
          const bridge = window.desktopBridge?.chatImport;
          if (!bridge) {
            throw new Error("Desktop transcript reader is unavailable.");
          }
          const file = await bridge.readTranscript({
            sessionId: pending.desktopRead.sessionId,
            transcriptId: pending.desktopRead.transcriptId,
          });
          const outcome = parseChatImport(file.content, pending.desktopRead.format);
          if (!outcome.ok) {
            throw new Error(outcome.error.message);
          }
          return outcome.parsed;
        },
        importChat: ({ parsed, targetProjectId, targetThreadId }) =>
          connection.client.mesh.importChat({
            command: {
              type: "chat.import" as const,
              commandId: CommandId.make(crypto.randomUUID()),
              targetThreadId,
              targetProjectId,
              ...(currentDeviceId !== null ? { targetDeviceId: currentDeviceId } : {}),
              parsed,
              createdAt: new Date().toISOString(),
            },
          }),
        onProgress: setImportProgress,
      });
      const imported = commitResult.successes.flatMap((success) => {
        const pending = pendingById.get(success.itemId);
        return pending
          ? [
              {
                environmentId: connection.environmentId,
                pending,
                result: success.result,
              },
            ]
          : [];
      });
      setResults(imported);
      setImportFailures(commitResult.failures);
      const summary = summarizeImportCommitResult(commitResult);
      setCommitSummary(summary);
      toastManager.add(summary);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const firstPending = enabledPendingImports[0];
      setImportFailures(
        firstPending
          ? [
              {
                itemId: firstPending.id,
                source: firstPending.source,
                title: firstPending.parsed.title ?? firstPending.source,
                message,
              },
            ]
          : [],
      );
      toastManager.add({
        type: "error",
        title: "Import failed",
        description: message,
      });
      setCommitSummary({
        type: "error",
        title: "Import failed",
        description: message,
      });
    } finally {
      setSubmitting(false);
      setImportProgress(null);
    }
  }, [
    canSubmitImport,
    currentDeviceId,
    disabledMcpServerIds,
    disabledSkillIds,
    enabledPendingImports,
    projectsInPrimary,
  ]);

  const openFirstImportedChat = useCallback(() => {
    const firstResult = results[0];
    if (!firstResult) return;
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(
        scopeThreadRef(firstResult.environmentId, firstResult.result.targetThreadId),
      ),
    });
    setOpen(false);
  }, [navigate, results]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={trigger as ReactElement} />
      <DialogPopup className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import a chat</DialogTitle>
          <DialogDescription>
            Scan Codex, Claude Code, and Anthropic Console transcripts locally, then review exactly
            which chats, skills, and MCP references to import.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <ModeTabs mode={mode} onChange={setMode} hasDesktopBridge={hasDesktopBridge} />
          {mode === "scan" ? <ScanLocalTab onPickedMany={handleParsedMany} /> : null}
          {mode === "upload" ? <UploadTab onParsed={handleParsed} /> : null}
          {mode === "paste" ? <PasteTab onParsed={handleParsed} /> : null}

          {parseError ? (
            <Alert variant="error">
              <AlertTitle>Parse failed</AlertTitle>
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          ) : null}

          {pendingImports.length > 0 && results.length === 0 && importFailures.length === 0 ? (
            <div className="space-y-3 rounded-md border border-border bg-background p-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium text-foreground">Ready to import</div>
                  <div className="text-muted-foreground">
                    Nothing has been added to V3 yet. {enabledPendingImports.length}/
                    {pendingImports.length} chats selected - {pendingProjectSummaries.length}{" "}
                    project
                    {pendingProjectSummaries.length === 1 ? "" : "s"}
                  </div>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() =>
                    setPendingImports((current) =>
                      current.map((item) => ({
                        ...item,
                        enabled: enabledPendingImports.length !== current.length,
                      })),
                    )
                  }
                >
                  {enabledPendingImports.length === pendingImports.length ? "Clear" : "Select all"}
                </Button>
              </div>

              <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-border/70">
                {pendingImports.map((item) => {
                  const workspaceRoot = item.parsed.sourceWorkspaceRoot?.trim() || null;
                  return (
                    <label
                      key={item.id}
                      className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-2 px-3 py-2 hover:bg-muted/60"
                    >
                      <input
                        type="checkbox"
                        checked={item.enabled}
                        onChange={(event) => {
                          const enabled = event.currentTarget.checked;
                          setPendingImports((current) =>
                            current.map((candidate) =>
                              candidate.id === item.id ? { ...candidate, enabled } : candidate,
                            ),
                          );
                        }}
                        className="mt-1 h-4 w-4 accent-primary"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground">
                          {item.parsed.title ?? item.source}
                        </span>
                        <span className="block text-muted-foreground">
                          {FORMAT_LABEL[item.parsed.format]} - {item.messageCount} messages -{" "}
                          {item.parsed.references.skillIds.length} skills -{" "}
                          {item.parsed.references.mcpServerIds.length} MCPs referenced
                        </span>
                        <span className="block truncate font-mono text-[10px] text-muted-foreground">
                          {workspaceRoot ?? "Missing workspace path"}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>

              {pendingProjectSummaries.length > 0 ? (
                <div className="space-y-1 rounded-md border border-border/70 bg-muted/20 p-2">
                  <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Project grouping
                  </div>
                  {pendingProjectSummaries.map((summary) => (
                    <div
                      key={summary.path}
                      className="flex items-center justify-between gap-2 text-[11px]"
                    >
                      <span className="truncate font-mono text-muted-foreground">
                        {summary.path}
                      </span>
                      <span className="shrink-0 text-foreground">
                        {summary.count} chat{summary.count === 1 ? "" : "s"}
                        {summary.existingName ? "" : " - new project"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <Alert variant="error">
                  <AlertTitle>No project to import into</AlertTitle>
                  <AlertDescription>
                    Imported chats need a parsed workspace path so V3 can create or merge the
                    matching project.
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <ReferenceToggleList
                  title="Skills"
                  items={pendingReferenceSummary.skillIds}
                  disabledIds={disabledSkillIds}
                  onChange={setDisabledSkillIds}
                />
                <ReferenceToggleList
                  title="MCP servers"
                  items={pendingReferenceSummary.mcpServerIds}
                  disabledIds={disabledMcpServerIds}
                  onChange={setDisabledMcpServerIds}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  size="sm"
                  onClick={() => void submit()}
                  disabled={submitting || !canSubmitImport}
                >
                  {submitting ? <LoaderIcon className="mr-2 size-3 animate-spin" /> : null}
                  Import selected
                </Button>
              </div>
              {importProgress ? (
                <StatusProgress
                  label={`${
                    importProgress.phase === "resolving-project"
                      ? "Creating or matching project"
                      : "Importing chat"
                  }: ${importProgress.label}`}
                  value={
                    importProgress.total === 0 ? 0 : importProgress.completed / importProgress.total
                  }
                />
              ) : null}
            </div>
          ) : null}

          <ImportOutcomePanel
            failures={importFailures}
            onOpenFirst={openFirstImportedChat}
            results={results}
          />
          {commitSummary ? (
            <Alert variant={commitSummary.type === "error" ? "error" : "default"}>
              <AlertTitle>{commitSummary.title}</AlertTitle>
              <AlertDescription>{commitSummary.description}</AlertDescription>
            </Alert>
          ) : null}
          {results.length > 0 && results.length <= 3
            ? results.map(({ pending, result }) => (
                <ResolutionPanel key={result.targetThreadId} pending={pending} result={result} />
              ))
            : null}
        </DialogPanel>
        <DialogFooter variant="bare">
          <Button variant="outline" onClick={() => setOpen(false)}>
            {pendingImports.length > 0 && results.length === 0 && importFailures.length === 0
              ? "Close without importing"
              : "Close"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
