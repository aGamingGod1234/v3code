// V3 chat-import core. Pure I/O, no electron imports — vitest runs this
// module directly without the electron bootstrap.
//
// Layout assumptions (verified on disk Apr 29 2026):
//   * Codex CLI:   ~/.codex/sessions/<YYYY>/<MM>/<DD>/rollout-*.jsonl
//                  Walked with bounded recursion (maxDepth 6, maxFiles 5000)
//                  so future Codex layout changes don't immediately break us.
//   * Claude Code: ~/.claude/projects/<slug>/<uuid>.jsonl
//                  Flat scan — one level deep into <slug>/, no recursion into
//                  the per-project UUID subdir or memory/.
//
// Session model:
//   * `openSession()` mints a sessionId, registers the two built-in roots in
//     the session's allowlist, and returns the handle.
//   * `listLocal()` re-scans the built-in roots into the session.
//   * `scanFolder()` walks an arbitrary user-picked folder with bounded
//     recursion + per-file format auto-detect, adds it to the allowlist, and
//     returns the merged listing.
//   * `readPreview()` lazily reads at most 64 KB of one file (≤ 8 in flight).
//   * `readTranscript()` returns the full content for parsing.
//   * `closeSession()` evicts the session from memory.
//
// Sessions expire after 30 minutes of inactivity. Allowlists never persist.

import * as Crypto from "node:crypto";
import * as FS from "node:fs/promises";
import * as OS from "node:os";
import * as Path from "node:path";

import type {
  DesktopTranscriptEntry,
  DesktopTranscriptFile,
  DesktopTranscriptFormat,
  DesktopTranscriptListing,
  DesktopTranscriptPreview,
  DesktopTranscriptScanFormat,
  DesktopTranscriptScannedRoot,
} from "@v3tools/contracts";

const PREVIEW_BYTES = 64 * 1024;
const PREVIEW_LINE_MAX = 200;
const MAX_CONCURRENT_READS = 8;
const MAX_FILES_PER_ROOT = 5000;
const CODEX_MAX_DEPTH = 6;
const MANUAL_MAX_DEPTH = 6;
const SESSION_IDLE_MS = 30 * 60 * 1000;
const SKIP_DIRS = new Set(["node_modules", ".git", "memory"]);

interface SessionState {
  readonly sessionId: string;
  readonly allowlist: Set<string>;
  readonly transcripts: Map<string, TranscriptRecord>;
  lastActivityAt: number;
}

interface TranscriptRecord {
  readonly realPath: string;
  readonly format: DesktopTranscriptFormat;
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
      // Fast-path: Codex's known layout is YYYY/MM/DD. We don't enforce it
      // (so future restructures still find files), but we DO use it to skip
      // obviously-unrelated directories like `node_modules` or hidden ones.
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
        // Only descend into dirs that look like part of the date tree, OR are
        // ambiguous and we haven't blown past depth. This keeps the walker
        // tight on the well-known layout but tolerant of small changes.
        if (depth === 0 && !isYearDir(name)) {
          // Codex's first level is always YYYY. Skip stray dirs at this level.
          continue;
        }
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
      } else if (childStat.isFile() && (isJsonlFile(name) || name.endsWith(".json"))) {
        out.push({ realPath: childReal, stat: childStat });
      }
    }
  };

  await walk(rootReal, 0);
  return { records: out, truncated };
};

const detectFormatFromPath = (filePath: string): DesktopTranscriptFormat => {
  const lower = filePath.toLowerCase().replace(/\\/g, "/");
  if (lower.includes("/.codex/sessions/")) return "codex";
  if (lower.includes("/.claude/projects/")) return "claude";
  if (lower.endsWith(".json") && !lower.endsWith(".jsonl")) return "anthropic-console";
  return "unknown";
};

interface ScanRootInput {
  readonly absolutePath: string;
  readonly format: DesktopTranscriptScanFormat;
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
  if (input.format === "claude") {
    collected = await collectClaudeFlat(realRoot, visited);
  } else if (input.format === "codex") {
    collected = await collectCodexBounded(realRoot, visited);
  } else {
    collected = await collectManualBounded(realRoot, visited);
  }

  for (const record of collected.records) {
    if (session.transcripts.has(record.realPath)) continue;
    const id = Crypto.randomUUID();
    const format = input.format === "auto" ? detectFormatFromPath(record.realPath) : input.format;
    session.transcripts.set(id, {
      realPath: record.realPath,
      format,
      modifiedAt: record.stat.mtime.toISOString(),
      bytes: record.stat.size,
      displayPath: record.realPath,
    });
  }
  // Make sure the root is on the allowlist so reads can reach files under it.
  session.allowlist.add(normalizeForCompare(realRoot));

  return {
    path: input.absolutePath,
    format: input.format,
    fileCount: collected.records.length,
    truncated: collected.truncated,
    existed: true,
  };
};

const builtInRoots = (homeDir: string): ReadonlyArray<ScanRootInput> => [
  { absolutePath: Path.join(homeDir, ".codex", "sessions"), format: "codex" },
  { absolutePath: Path.join(homeDir, ".claude", "projects"), format: "claude" },
];

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
  // Pre-register built-in root prefixes so future reads can pass the
  // allowlist check even before listLocal/scanFolder records the realpath.
  for (const root of builtInRoots(homeDir)) {
    session.allowlist.add(normalizeForCompare(root.absolutePath));
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
): Promise<DesktopTranscriptListing> => {
  const session = requireSession(sessionId);
  // Reset transcripts that came from built-in roots so the listing is fresh.
  // Manually-scanned folders persist across listLocal calls in the same
  // session.
  session.transcripts.clear();
  const visited = new Set<string>();
  const scannedRoots: DesktopTranscriptScannedRoot[] = [];
  for (const root of builtInRoots(homeDir)) {
    scannedRoots.push(await scanRoot(root, session, visited));
  }
  touchSession(session);
  return buildListingFromSession(session, scannedRoots);
};

export const scanFolder = async (
  sessionId: string,
  folderPath: string,
): Promise<DesktopTranscriptListing> => {
  const session = requireSession(sessionId);
  const visited = new Set<string>();
  const scannedRoots: DesktopTranscriptScannedRoot[] = [
    await scanRoot({ absolutePath: folderPath, format: "auto" }, session, visited),
  ];
  touchSession(session);
  return buildListingFromSession(session, scannedRoots);
};

const readFirstLineFromHead = (head: string): string | null => {
  for (const line of head.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed.slice(0, PREVIEW_LINE_MAX);
  }
  return null;
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
        return { previewLine: readFirstLineFromHead(head) };
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
    // Path.sep on Windows is \, but realpath/Path.normalize keep mixed
    // separators sometimes — guard against both.
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
  inFlightPreviewCount: (): number =>
    // Reading the private `active` for tests is fine — there's only one
    // shared semaphore.
    (previewSemaphore as unknown as { active: number }).active,
};
