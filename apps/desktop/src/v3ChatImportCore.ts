// V3 chat-import core. Pure I/O, no electron imports; vitest runs this
// module directly without the electron bootstrap.
//
// Provider-specific scans keep imports predictable. Providers with tested
// parsers are marked `ready`; recognized providers without a safe parser are
// listed as unsupported rather than being silently mixed into Codex/Claude
// imports.

import * as Crypto from "node:crypto";
import * as FS from "node:fs/promises";
import * as OS from "node:os";
import * as Path from "node:path";

import type {
  ChatImportParserStatus,
  ChatImportProvider,
  DesktopTranscriptEntry,
  DesktopTranscriptFile,
  DesktopTranscriptFormat,
  DesktopTranscriptListing,
  DesktopTranscriptPreview,
  DesktopTranscriptScanFormat,
  DesktopTranscriptScanProvider,
  DesktopTranscriptScannedRoot,
} from "@v3tools/contracts";

const PREVIEW_BYTES = 64 * 1024;
const PREVIEW_LINE_MAX = 200;
const DETECTION_BYTES = 64 * 1024;
const MAX_CONCURRENT_READS = 8;
const MAX_FILES_PER_ROOT = 5000;
const CODEX_MAX_DEPTH = 6;
const MANUAL_MAX_DEPTH = 6;
const SESSION_IDLE_MS = 30 * 60 * 1000;
const SKIP_DIRS = new Set(["node_modules", ".git", "memory"]);
const DEFAULT_SCAN_PROVIDER: DesktopTranscriptScanProvider = "codex";

const PROVIDER_LABEL: Record<ChatImportProvider, string> = {
  codex: "Codex",
  claude: "Claude Code",
  "anthropic-console": "Anthropic Console",
  "gemini-cli": "Gemini CLI",
  cursor: "Cursor",
  windsurf: "Windsurf",
  opencode: "OpenCode",
  custom: "Custom",
};

const READY_FORMATS = new Set<DesktopTranscriptFormat>(["codex", "claude", "anthropic-console"]);

interface SessionState {
  readonly sessionId: string;
  readonly allowlist: Set<string>;
  readonly transcripts: Map<string, TranscriptRecord>;
  lastActivityAt: number;
}

interface TranscriptRecord {
  readonly realPath: string;
  readonly format: DesktopTranscriptFormat;
  readonly provider: ChatImportProvider;
  readonly parserStatus: ChatImportParserStatus;
  readonly title: string;
  readonly summary: string | null;
  readonly modifiedAt: string;
  readonly bytes: number;
  readonly displayPath: string;
}

const sessions = new Map<string, SessionState>();

const isPathTreeError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string";
};

const safeReadDir = async (path: string): Promise<readonly string[]> => {
  try {
    return await FS.readdir(path);
  } catch (error) {
    if (!isPathTreeError(error)) throw error;
    return [];
  }
};

const safeStat = async (path: string) => {
  try {
    return await FS.stat(path);
  } catch (error) {
    if (!isPathTreeError(error)) throw error;
    return null;
  }
};

const safeRealpath = async (path: string): Promise<string | null> => {
  try {
    return await FS.realpath(path);
  } catch (error) {
    if (!isPathTreeError(error)) throw error;
    return null;
  }
};

const isJsonlFile = (name: string): boolean => name.endsWith(".jsonl");
const isJsonFile = (name: string): boolean => name.endsWith(".json");
const isTranscriptCandidate = (name: string): boolean => isJsonlFile(name) || isJsonFile(name);

const ANTHROPIC_ROLE_PATTERN = /"role"\s*:\s*"(user|assistant|system|tool)"/;
const ANTHROPIC_CONTENT_PATTERN = /"content"\s*:/;
const ANTHROPIC_MESSAGES_PATTERN = /"messages"\s*:\s*\[/;
const CODEX_MESSAGE_TYPES = new Set([
  "user_message",
  "user_input",
  "assistant_message",
  "agent_message",
  "system_message",
  "tool_use",
  "exec",
  "tool_call",
  "tool_result",
  "exec_result",
  "session_meta",
]);
const CLAUDE_ENVELOPE_TYPES = new Set([
  "user",
  "assistant",
  "system",
  "summary",
  "tool_use",
  "tool_result",
]);

const isYearDir = (name: string): boolean => /^\d{4}$/.test(name);
const isMonthDayDir = (name: string): boolean => /^\d{2}$/.test(name);

const normalizeForCompare = (path: string): string =>
  process.platform === "win32" ? Path.normalize(path).toLowerCase() : Path.normalize(path);

const isUnderRoot = (rootReal: string, candidateReal: string): boolean => {
  const rootNorm = normalizeForCompare(rootReal);
  const candidateNorm = normalizeForCompare(candidateReal);
  if (rootNorm === candidateNorm) return false;
  const rel = Path.relative(rootNorm, candidateNorm);
  if (rel.length === 0) return false;
  if (rel.startsWith("..")) return false;
  if (Path.isAbsolute(rel)) return false;
  return true;
};

class Semaphore {
  active = 0;
  private readonly queue: Array<() => void> = [];
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve);
      });
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

const previewSemaphore = new Semaphore(MAX_CONCURRENT_READS);

interface CollectResult {
  readonly records: ReadonlyArray<{ readonly realPath: string; readonly stat: import("fs").Stats }>;
  readonly truncated: boolean;
}

const collectClaudeFlat = async (
  rootReal: string,
  visited: Set<string>,
): Promise<CollectResult> => {
  const out: Array<{ realPath: string; stat: import("fs").Stats }> = [];
  let truncated = false;
  const projectNames = await safeReadDir(rootReal);
  for (const projectName of projectNames) {
    if (out.length >= MAX_FILES_PER_ROOT) {
      truncated = true;
      break;
    }
    if (SKIP_DIRS.has(projectName)) continue;
    const projectPath = Path.join(rootReal, projectName);
    const projectReal = await safeRealpath(projectPath);
    if (!projectReal) continue;
    if (visited.has(normalizeForCompare(projectReal))) continue;
    visited.add(normalizeForCompare(projectReal));
    if (!isUnderRoot(rootReal, projectReal)) continue;
    const projectStat = await safeStat(projectReal);
    if (!projectStat?.isDirectory()) continue;
    const fileNames = await safeReadDir(projectReal);
    for (const fileName of fileNames) {
      if (out.length >= MAX_FILES_PER_ROOT) {
        truncated = true;
        break;
      }
      if (!isJsonlFile(fileName)) continue;
      const filePath = Path.join(projectReal, fileName);
      const fileReal = await safeRealpath(filePath);
      if (!fileReal) continue;
      if (!isUnderRoot(rootReal, fileReal)) continue;
      const fileStat = await safeStat(fileReal);
      if (!fileStat?.isFile()) continue;
      out.push({ realPath: fileReal, stat: fileStat });
    }
  }
  return { records: out, truncated };
};

const collectCodexBounded = async (
  rootReal: string,
  visited: Set<string>,
): Promise<CollectResult> => {
  const out: Array<{ realPath: string; stat: import("fs").Stats }> = [];
  let truncated = false;

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (out.length >= MAX_FILES_PER_ROOT) {
      truncated = true;
      return;
    }
    if (depth > CODEX_MAX_DEPTH) return;
    const entries = await safeReadDir(dir);
    for (const name of entries) {
      if (out.length >= MAX_FILES_PER_ROOT) {
        truncated = true;
        return;
      }
      if (name.startsWith(".")) continue;
      if (SKIP_DIRS.has(name)) continue;
      const childPath = Path.join(dir, name);
      const childReal = await safeRealpath(childPath);
      if (!childReal) continue;
      const key = normalizeForCompare(childReal);
      if (visited.has(key)) continue;
      visited.add(key);
      if (!isUnderRoot(rootReal, childReal) && childReal !== rootReal) continue;
      const childStat = await safeStat(childReal);
      if (!childStat) continue;
      if (childStat.isDirectory()) {
        if (depth === 0 && !isYearDir(name)) continue;
        if (depth === 1 && !isMonthDayDir(name)) continue;
        if (depth === 2 && !isMonthDayDir(name)) continue;
        await walk(childReal, depth + 1);
      } else if (childStat.isFile() && isJsonlFile(name)) {
        out.push({ realPath: childReal, stat: childStat });
      }
    }
  };

  await walk(rootReal, 0);
  return { records: out, truncated };
};

const collectManualBounded = async (
  rootReal: string,
  visited: Set<string>,
): Promise<CollectResult> => {
  const out: Array<{ realPath: string; stat: import("fs").Stats }> = [];
  let truncated = false;

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (out.length >= MAX_FILES_PER_ROOT) {
      truncated = true;
      return;
    }
    if (depth > MANUAL_MAX_DEPTH) return;
    const entries = await safeReadDir(dir);
    for (const name of entries) {
      if (out.length >= MAX_FILES_PER_ROOT) {
        truncated = true;
        return;
      }
      if (name.startsWith(".")) continue;
      if (SKIP_DIRS.has(name)) continue;
      const childPath = Path.join(dir, name);
      const childReal = await safeRealpath(childPath);
      if (!childReal) continue;
      const key = normalizeForCompare(childReal);
      if (visited.has(key)) continue;
      visited.add(key);
      if (!isUnderRoot(rootReal, childReal) && childReal !== rootReal) continue;
      const childStat = await safeStat(childReal);
      if (!childStat) continue;
      if (childStat.isDirectory()) {
        await walk(childReal, depth + 1);
      } else if (childStat.isFile() && isTranscriptCandidate(name)) {
        out.push({ realPath: childReal, stat: childStat });
      }
    }
  };

  await walk(rootReal, 0);
  return { records: out, truncated };
};

const parserStatusForFormat = (format: DesktopTranscriptFormat): ChatImportParserStatus => {
  if (READY_FORMATS.has(format)) return "ready";
  if (format === "unknown") return "unknown";
  return "unsupported";
};

const detectFormatFromPath = (filePath: string): DesktopTranscriptFormat => {
  const lower = filePath.toLowerCase().replace(/\\/g, "/");
  if (lower.includes("/.codex/sessions/")) return "codex";
  if (lower.includes("/.claude/projects/")) return "claude";
  if (lower.includes("/.gemini/")) return "gemini-cli";
  if (lower.includes("/cursor/")) return "cursor";
  if (lower.includes("/windsurf/")) return "windsurf";
  return "unknown";
};

const readDetectionHead = async (filePath: string): Promise<string | null> => {
  try {
    const handle = await FS.open(filePath, "r");
    try {
      const buffer = Buffer.alloc(DETECTION_BYTES);
      const { bytesRead } = await handle.read(buffer, 0, DETECTION_BYTES, 0);
      return buffer.subarray(0, bytesRead).toString("utf8");
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
};

const firstNonEmptyLine = (text: string): string | null => {
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.length > 0) return line;
  }
  return null;
};

const parseJsonRecord = (text: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};

const detectFormatFromContentHead = async (filePath: string): Promise<DesktopTranscriptFormat> => {
  const head = await readDetectionHead(filePath);
  if (!head) return "unknown";
  const trimmed = head.trimStart();
  const lower = filePath.toLowerCase();

  if (
    isJsonFile(lower) &&
    (trimmed.startsWith("[") || ANTHROPIC_MESSAGES_PATTERN.test(head)) &&
    ANTHROPIC_ROLE_PATTERN.test(head) &&
    ANTHROPIC_CONTENT_PATTERN.test(head)
  ) {
    return "anthropic-console";
  }

  if (!isJsonlFile(lower)) return "unknown";
  const firstLine = firstNonEmptyLine(head);
  if (!firstLine) return "unknown";
  const record = parseJsonRecord(firstLine);
  if (!record) return "unknown";
  const msg = record.msg;
  if (
    typeof msg === "object" &&
    msg !== null &&
    !Array.isArray(msg) &&
    typeof (msg as Record<string, unknown>).type === "string" &&
    CODEX_MESSAGE_TYPES.has((msg as Record<string, unknown>).type as string)
  ) {
    return "codex";
  }
  if (typeof record.type === "string" && CLAUDE_ENVELOPE_TYPES.has(record.type)) {
    return "claude";
  }
  return "unknown";
};

const resolveScannedFormat = async (
  provider: DesktopTranscriptScanProvider,
  filePath: string,
): Promise<DesktopTranscriptFormat> => {
  const pathFormat = detectFormatFromPath(filePath);
  if (provider === "custom") {
    return pathFormat === "unknown" ? detectFormatFromContentHead(filePath) : pathFormat;
  }
  if (provider === "anthropic-console") {
    return (await detectFormatFromContentHead(filePath)) === "anthropic-console"
      ? "anthropic-console"
      : "unknown";
  }
  if (provider === "codex" || provider === "claude") {
    return provider;
  }
  return pathFormat === "unknown" ? provider : pathFormat;
};

const hasTranscriptPath = (session: SessionState, realPath: string): boolean => {
  for (const record of session.transcripts.values()) {
    if (record.realPath === realPath) return true;
  }
  return false;
};

const providerRootPath = (
  homeDir: string,
  provider: DesktopTranscriptScanProvider,
): string | null => {
  const appData = process.env.APPDATA?.trim() || Path.join(homeDir, "AppData", "Roaming");
  switch (provider) {
    case "codex":
      return Path.join(homeDir, ".codex", "sessions");
    case "claude":
      return Path.join(homeDir, ".claude", "projects");
    case "anthropic-console":
      return Path.join(homeDir, "Downloads");
    case "gemini-cli":
      return Path.join(homeDir, ".gemini");
    case "cursor":
      return Path.join(appData, "Cursor", "User", "workspaceStorage");
    case "windsurf":
      return Path.join(appData, "Windsurf", "User", "workspaceStorage");
    case "opencode":
      return Path.join(homeDir, ".local", "share", "opencode");
    case "custom":
      return null;
  }
};

interface ScanRootInput {
  readonly absolutePath: string;
  readonly format: DesktopTranscriptScanFormat;
  readonly provider: DesktopTranscriptScanProvider;
}

const scanRoot = async (
  input: ScanRootInput,
  session: SessionState,
  visited: Set<string>,
): Promise<DesktopTranscriptScannedRoot> => {
  const realRoot = await safeRealpath(input.absolutePath);
  if (!realRoot) {
    return {
      path: input.absolutePath,
      format: input.format,
      fileCount: 0,
      truncated: false,
      existed: false,
    };
  }
  const rootStat = await safeStat(realRoot);
  if (!rootStat?.isDirectory()) {
    return {
      path: input.absolutePath,
      format: input.format,
      fileCount: 0,
      truncated: false,
      existed: false,
    };
  }

  let collected: CollectResult;
  if (input.provider === "claude") {
    collected = await collectClaudeFlat(realRoot, visited);
  } else if (input.provider === "codex") {
    collected = await collectCodexBounded(realRoot, visited);
  } else {
    collected = await collectManualBounded(realRoot, visited);
  }

  for (const record of collected.records) {
    if (hasTranscriptPath(session, record.realPath)) continue;
    const id = Crypto.randomUUID();
    const detectedFormat = await resolveScannedFormat(input.provider, record.realPath);
    const format = detectedFormat;
    const provider =
      input.provider === "custom" && detectedFormat !== "unknown" ? detectedFormat : input.provider;
    const parserStatus = parserStatusForFormat(format);
    session.transcripts.set(id, {
      realPath: record.realPath,
      format,
      provider,
      parserStatus,
      title: titleFromPath(provider, record.realPath),
      summary: null,
      modifiedAt: record.stat.mtime.toISOString(),
      bytes: record.stat.size,
      displayPath: record.realPath,
    });
  }
  session.allowlist.add(normalizeForCompare(realRoot));

  return {
    path: input.absolutePath,
    format: input.format,
    fileCount: collected.records.length,
    truncated: collected.truncated,
    existed: true,
  };
};

const builtInRoots = (
  homeDir: string,
  provider: DesktopTranscriptScanProvider = DEFAULT_SCAN_PROVIDER,
): ReadonlyArray<ScanRootInput> => {
  const rootPath = providerRootPath(homeDir, provider);
  if (!rootPath) return [];
  return [{ absolutePath: rootPath, format: provider, provider }];
};

const allKnownRoots = (homeDir: string): ReadonlyArray<string> =>
  (
    [
      "codex",
      "claude",
      "anthropic-console",
      "gemini-cli",
      "cursor",
      "windsurf",
      "opencode",
      "custom",
    ] as const
  )
    .map((provider) => providerRootPath(homeDir, provider))
    .filter((path): path is string => Boolean(path));

const buildListingFromSession = (
  session: SessionState,
  scannedRoots: ReadonlyArray<DesktopTranscriptScannedRoot>,
): DesktopTranscriptListing => {
  const entries: DesktopTranscriptEntry[] = [];
  for (const [transcriptId, record] of session.transcripts) {
    entries.push({
      transcriptId,
      displayPath: record.displayPath,
      format: record.format,
      provider: record.provider,
      parserStatus: record.parserStatus,
      title: record.title,
      summary: record.summary,
      modifiedAt: record.modifiedAt,
      bytes: record.bytes,
    });
  }
  entries.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
  return { entries, scannedRoots };
};

const touchSession = (session: SessionState): void => {
  session.lastActivityAt = Date.now();
};

const reapExpiredSessions = (now: number = Date.now()): void => {
  for (const [id, session] of sessions) {
    if (now - session.lastActivityAt > SESSION_IDLE_MS) {
      sessions.delete(id);
    }
  }
};

const requireSession = (sessionId: string): SessionState => {
  reapExpiredSessions();
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error("session-expired");
  }
  touchSession(session);
  return session;
};

export interface OpenSessionResult {
  readonly sessionId: string;
}

export const openSession = (homeDir: string = OS.homedir()): OpenSessionResult => {
  reapExpiredSessions();
  const sessionId = Crypto.randomUUID();
  const session: SessionState = {
    sessionId,
    allowlist: new Set<string>(),
    transcripts: new Map(),
    lastActivityAt: Date.now(),
  };
  for (const root of allKnownRoots(homeDir)) {
    session.allowlist.add(normalizeForCompare(root));
  }
  sessions.set(sessionId, session);
  return { sessionId };
};

export const closeSession = (sessionId: string): void => {
  sessions.delete(sessionId);
};

export const listLocal = async (
  sessionId: string,
  homeDir: string = OS.homedir(),
  provider: DesktopTranscriptScanProvider = DEFAULT_SCAN_PROVIDER,
): Promise<DesktopTranscriptListing> => {
  const session = requireSession(sessionId);
  session.transcripts.clear();
  const visited = new Set<string>();
  const scannedRoots: DesktopTranscriptScannedRoot[] = [];
  for (const root of builtInRoots(homeDir, provider)) {
    scannedRoots.push(await scanRoot(root, session, visited));
  }
  touchSession(session);
  return buildListingFromSession(session, scannedRoots);
};

export const scanFolder = async (
  sessionId: string,
  folderPath: string,
  provider: DesktopTranscriptScanProvider = "custom",
): Promise<DesktopTranscriptListing> => {
  const session = requireSession(sessionId);
  const visited = new Set<string>();
  const scannedRoots: DesktopTranscriptScannedRoot[] = [
    await scanRoot({ absolutePath: folderPath, format: "auto", provider }, session, visited),
  ];
  touchSession(session);
  return buildListingFromSession(session, scannedRoots);
};

const titleFromPath = (provider: ChatImportProvider, filePath: string): string => {
  const basename = Path.basename(filePath).replace(/\.(jsonl|json)$/i, "");
  return `${PROVIDER_LABEL[provider]} - ${basename}`;
};

const maybeJson = (text: string): unknown | null => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const textFromValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = textFromValue(item);
      if (result) return result;
    }
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["summary", "title", "content", "text", "prompt"]) {
    const result = textFromValue(record[key]);
    if (result) return result;
  }
  for (const key of ["message", "msg", "payload"]) {
    const result = textFromValue(record[key]);
    if (result) return result;
  }
  return null;
};

const readPreviewLineFromHead = (head: string, fallbackPath: string): string | null => {
  for (const line of head.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const parsed = maybeJson(trimmed);
    const text = parsed === null ? trimmed : textFromValue(parsed);
    if (text) return text.slice(0, PREVIEW_LINE_MAX);
  }
  return titleFromPath("custom", fallbackPath).slice(0, PREVIEW_LINE_MAX);
};

export const readPreview = async (
  sessionId: string,
  transcriptId: string,
): Promise<DesktopTranscriptPreview> => {
  const session = requireSession(sessionId);
  const record = session.transcripts.get(transcriptId);
  if (!record) {
    throw new Error("not-found");
  }
  return previewSemaphore.run(async () => {
    try {
      const handle = await FS.open(record.realPath, "r");
      try {
        const buffer = Buffer.alloc(PREVIEW_BYTES);
        const { bytesRead } = await handle.read(buffer, 0, PREVIEW_BYTES, 0);
        const head = buffer.subarray(0, bytesRead).toString("utf8");
        return { previewLine: readPreviewLineFromHead(head, record.realPath) };
      } finally {
        await handle.close();
      }
    } catch {
      return { previewLine: null };
    }
  });
};

const isAllowed = (session: SessionState, candidateReal: string): boolean => {
  const candidateNorm = normalizeForCompare(candidateReal);
  for (const allowed of session.allowlist) {
    if (candidateNorm === allowed) return true;
    if (candidateNorm.startsWith(`${allowed}${Path.sep}`)) return true;
    if (candidateNorm.startsWith(`${allowed}/`)) return true;
  }
  return false;
};

export const readTranscript = async (
  sessionId: string,
  transcriptId: string,
): Promise<DesktopTranscriptFile> => {
  const session = requireSession(sessionId);
  const record = session.transcripts.get(transcriptId);
  if (!record) {
    throw new Error("not-found");
  }
  if (!isAllowed(session, record.realPath)) {
    throw new Error("not-allowed");
  }
  if (record.parserStatus !== "ready") {
    throw new Error("unsupported-provider");
  }
  const content = await FS.readFile(record.realPath, "utf8");
  return { content };
};

// Test hooks ---------------------------------------------------------------

export const __testing__ = {
  reset: (): void => {
    sessions.clear();
  },
  forceExpire: (sessionId: string): void => {
    const session = sessions.get(sessionId);
    if (session) session.lastActivityAt = 0;
  },
  sessionCount: (): number => sessions.size,
  inFlightPreviewCount: (): number => (previewSemaphore as unknown as { active: number }).active,
};
