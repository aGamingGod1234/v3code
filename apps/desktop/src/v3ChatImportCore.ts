// Pure I/O for the chat-import IPC. Lives in a separate module so the
// vitest unit tests can import it without pulling `electron` (which
// blows up under Node).

import * as FS from "node:fs/promises";
import * as OS from "node:os";
import * as Path from "node:path";

import type {
  DesktopTranscriptEntry,
  DesktopTranscriptFile,
  DesktopTranscriptListing,
} from "@v3tools/contracts";

const PREVIEW_BYTES = 512;

interface CandidateRoot {
  readonly absolutePath: string;
  readonly format: "codex" | "claude";
  readonly recurseOneLevel: boolean;
}

const candidateRoots = (homeDir: string): ReadonlyArray<CandidateRoot> => [
  {
    absolutePath: Path.join(homeDir, ".codex", "sessions"),
    format: "codex",
    recurseOneLevel: false,
  },
  {
    absolutePath: Path.join(homeDir, ".claude", "projects"),
    format: "claude",
    recurseOneLevel: true,
  },
];

const safeReadDir = async (path: string): Promise<readonly string[]> => {
  try {
    return await FS.readdir(path);
  } catch {
    return [];
  }
};

const safeStat = async (path: string) => {
  try {
    return await FS.stat(path);
  } catch {
    return null;
  }
};

const isJsonlFile = (name: string): boolean => name.endsWith(".jsonl");

const readPreview = async (path: string): Promise<string | null> => {
  try {
    const handle = await FS.open(path, "r");
    try {
      const buffer = Buffer.alloc(PREVIEW_BYTES);
      const { bytesRead } = await handle.read(buffer, 0, PREVIEW_BYTES, 0);
      const head = buffer.slice(0, bytesRead).toString("utf8");
      const firstLine = head.split("\n").find((line) => line.trim().length > 0) ?? null;
      return firstLine?.slice(0, 200) ?? null;
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
};

const collectInRoot = async (root: CandidateRoot): Promise<ReadonlyArray<DesktopTranscriptEntry>> => {
  const out: DesktopTranscriptEntry[] = [];

  if (root.recurseOneLevel) {
    const subdirs = await safeReadDir(root.absolutePath);
    for (const sub of subdirs) {
      const sessionsPath = Path.join(root.absolutePath, sub, "sessions");
      const stat = await safeStat(sessionsPath);
      if (!stat?.isDirectory()) continue;
      const entries = await safeReadDir(sessionsPath);
      for (const name of entries) {
        if (!isJsonlFile(name)) continue;
        const filePath = Path.join(sessionsPath, name);
        const fileStat = await safeStat(filePath);
        if (!fileStat?.isFile()) continue;
        out.push({
          path: filePath,
          format: root.format,
          modifiedAt: fileStat.mtime.toISOString(),
          bytes: fileStat.size,
          preview: await readPreview(filePath),
        });
      }
    }
    return out;
  }

  const entries = await safeReadDir(root.absolutePath);
  for (const name of entries) {
    if (!isJsonlFile(name)) continue;
    const filePath = Path.join(root.absolutePath, name);
    const fileStat = await safeStat(filePath);
    if (!fileStat?.isFile()) continue;
    out.push({
      path: filePath,
      format: root.format,
      modifiedAt: fileStat.mtime.toISOString(),
      bytes: fileStat.size,
      preview: await readPreview(filePath),
    });
  }
  return out;
};

export const listLocalTranscripts = async (
  homeDir: string = OS.homedir(),
): Promise<DesktopTranscriptListing> => {
  const groups = await Promise.all(candidateRoots(homeDir).map(collectInRoot));
  const flat = groups.flat();
  flat.sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
  return { entries: flat };
};

export const readTranscript = async (
  path: string,
  homeDir: string = OS.homedir(),
): Promise<DesktopTranscriptFile> => {
  const roots = candidateRoots(homeDir).map((root) => Path.resolve(root.absolutePath));
  const resolved = Path.resolve(path);
  const allowed = roots.some((root) => resolved.startsWith(`${root}${Path.sep}`));
  if (!allowed) {
    throw new Error(
      `Refusing to read ${resolved} — chat-import only allows files under ~/.codex/sessions or ~/.claude/projects.`,
    );
  }
  const content = await FS.readFile(resolved, "utf8");
  return { path: resolved, content };
};
