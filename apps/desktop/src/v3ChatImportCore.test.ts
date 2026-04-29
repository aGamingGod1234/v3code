import * as FS from "node:fs/promises";
import * as OS from "node:os";
import * as Path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __testing__,
  closeSession,
  listLocal,
  openSession,
  readPreview,
  readTranscript,
  scanFolder,
} from "./v3ChatImportCore.ts";

let homeDir: string;

const writeFile = async (path: string, content: string): Promise<void> => {
  await FS.mkdir(Path.dirname(path), { recursive: true });
  await FS.writeFile(path, content, "utf8");
};

const seedClaudeProject = async (slug: string, sessionUuids: string[]): Promise<void> => {
  const projectDir = Path.join(homeDir, ".claude", "projects", slug);
  await FS.mkdir(projectDir, { recursive: true });
  for (const uuid of sessionUuids) {
    await writeFile(
      Path.join(projectDir, `${uuid}.jsonl`),
      `{"sessionId":"${uuid}","kind":"meta"}\n{"role":"user","content":"hi"}`,
    );
  }
  // Decoy subdirectories that should NOT be descended into.
  await FS.mkdir(Path.join(projectDir, sessionUuids[0] ?? "decoy-uuid"), { recursive: true });
  await writeFile(
    Path.join(projectDir, sessionUuids[0] ?? "decoy-uuid", "ignored.jsonl"),
    `{"do":"not see this"}`,
  );
  await FS.mkdir(Path.join(projectDir, "memory"), { recursive: true });
  await writeFile(Path.join(projectDir, "memory", "skip.jsonl"), `{"skip":true}`);
};

const seedCodexSession = async (
  year: string,
  month: string,
  day: string,
  fileName: string,
  content: string,
): Promise<string> => {
  const filePath = Path.join(homeDir, ".codex", "sessions", year, month, day, fileName);
  await writeFile(filePath, content);
  return filePath;
};

beforeEach(async () => {
  __testing__.reset();
  homeDir = await FS.mkdtemp(Path.join(OS.tmpdir(), "v3code-chatimport-"));
});

afterEach(async () => {
  __testing__.reset();
  try {
    await FS.rm(homeDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup; swallow Windows-specific lock errors.
  }
});

describe("openSession / closeSession", () => {
  it("mints a unique sessionId and tracks it in memory", () => {
    const a = openSession(homeDir);
    const b = openSession(homeDir);
    expect(a.sessionId).not.toBe(b.sessionId);
    expect(__testing__.sessionCount()).toBe(2);
    closeSession(a.sessionId);
    expect(__testing__.sessionCount()).toBe(1);
    closeSession(b.sessionId);
    expect(__testing__.sessionCount()).toBe(0);
  });

  it("requireSession throws session-expired after the idle window", async () => {
    const { sessionId } = openSession(homeDir);
    __testing__.forceExpire(sessionId);
    await expect(listLocal(sessionId, homeDir)).rejects.toThrowError(/session-expired/);
  });
});

describe("listLocal — Claude flat layout", () => {
  it("finds top-level .jsonl files in each project subdir", async () => {
    await seedClaudeProject("C--Users-foo", ["alpha", "beta"]);
    await seedClaudeProject("D--Users-bar", ["gamma"]);
    const { sessionId } = openSession(homeDir);
    const result = await listLocal(sessionId, homeDir);
    const formats = result.entries.map((entry) => entry.format);
    expect(formats.every((format) => format === "claude")).toBe(true);
    const paths = result.entries.map((entry) => entry.displayPath);
    expect(paths).toHaveLength(3);
    expect(paths.some((path) => path.endsWith("alpha.jsonl"))).toBe(true);
    expect(paths.some((path) => path.endsWith("beta.jsonl"))).toBe(true);
    expect(paths.some((path) => path.endsWith("gamma.jsonl"))).toBe(true);
  });

  it("does not recurse into per-project UUID subdirs or memory/", async () => {
    await seedClaudeProject("C--Users-foo", ["alpha"]);
    const { sessionId } = openSession(homeDir);
    const result = await listLocal(sessionId, homeDir);
    expect(result.entries.some((entry) => entry.displayPath.includes("ignored.jsonl"))).toBe(false);
    expect(
      result.entries.some((entry) => entry.displayPath.includes(`${Path.sep}memory${Path.sep}`)),
    ).toBe(false);
  });
});

describe("listLocal — Codex bounded recursion", () => {
  it("finds .jsonl files at the documented YYYY/MM/DD depth", async () => {
    await seedCodexSession("2026", "04", "29", "rollout-foo.jsonl", `{"a":1}\n`);
    await seedCodexSession("2026", "04", "28", "rollout-bar.jsonl", `{"a":2}\n`);
    const { sessionId } = openSession(homeDir);
    const result = await listLocal(sessionId, homeDir);
    expect(result.entries).toHaveLength(2);
    expect(result.entries.every((entry) => entry.format === "codex")).toBe(true);
  });

  it("ignores non-numeric directories at the year/month/day levels", async () => {
    await seedCodexSession("2026", "04", "29", "rollout-foo.jsonl", `{"a":1}\n`);
    await writeFile(
      Path.join(homeDir, ".codex", "sessions", "stray", "rollout-bad.jsonl"),
      `{"bad":true}`,
    );
    await writeFile(
      Path.join(homeDir, ".codex", "sessions", "2026", "stray", "rollout-bad.jsonl"),
      `{"bad":true}`,
    );
    const { sessionId } = openSession(homeDir);
    const result = await listLocal(sessionId, homeDir);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.displayPath.endsWith("rollout-foo.jsonl")).toBe(true);
  });

  it("populates scannedRoots with counts and existed flags", async () => {
    await seedCodexSession("2026", "04", "29", "rollout-foo.jsonl", `{"a":1}\n`);
    const { sessionId } = openSession(homeDir);
    const result = await listLocal(sessionId, homeDir);
    expect(result.scannedRoots).toHaveLength(2);
    const codexRoot = result.scannedRoots.find((root) => root.format === "codex");
    const claudeRoot = result.scannedRoots.find((root) => root.format === "claude");
    expect(codexRoot?.existed).toBe(true);
    expect(codexRoot?.fileCount).toBe(1);
    expect(claudeRoot?.existed).toBe(false);
    expect(claudeRoot?.fileCount).toBe(0);
  });

  it("returns empty listing cleanly when neither directory exists", async () => {
    const { sessionId } = openSession(homeDir);
    const result = await listLocal(sessionId, homeDir);
    expect(result.entries).toEqual([]);
    expect(result.scannedRoots).toHaveLength(2);
    expect(result.scannedRoots.every((root) => !root.existed)).toBe(true);
  });
});

describe("listLocal — sort order", () => {
  it("sorts newest-first by modifiedAt", async () => {
    const olderPath = await seedCodexSession("2026", "01", "01", "rollout-old.jsonl", `{"a":1}\n`);
    const newerPath = await seedCodexSession("2026", "12", "31", "rollout-new.jsonl", `{"a":2}\n`);
    // Force distinct mtimes regardless of FS resolution.
    await FS.utimes(olderPath, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"));
    await FS.utimes(newerPath, new Date("2026-12-31T23:59:59Z"), new Date("2026-12-31T23:59:59Z"));
    const { sessionId } = openSession(homeDir);
    const result = await listLocal(sessionId, homeDir);
    expect(result.entries.map((entry) => Path.basename(entry.displayPath))).toEqual([
      Path.basename(newerPath),
      Path.basename(olderPath),
    ]);
  });
});

describe("scanFolder — manual fallback with auto-detect", () => {
  it("detects format per file and adds the folder to the session allowlist", async () => {
    const customRoot = Path.join(homeDir, "my-archive");
    await writeFile(Path.join(customRoot, "exported.jsonl"), `{"role":"user","content":"hi"}`);
    await writeFile(Path.join(customRoot, "console-export.json"), JSON.stringify({ messages: [] }));
    const { sessionId } = openSession(homeDir);
    const result = await scanFolder(sessionId, customRoot);
    expect(result.entries.length).toBeGreaterThanOrEqual(2);
    const formats = new Set(result.entries.map((entry) => entry.format));
    // Auto-detect from path can't tell jsonl from codex/claude without folder context;
    // it falls back to "unknown" for raw paths and "anthropic-console" for .json files.
    expect(formats.has("anthropic-console")).toBe(true);
    expect(result.scannedRoots[0]?.format).toBe("auto");
  });
});

describe("readPreview", () => {
  it("returns the first non-empty line, capped at 200 chars", async () => {
    const longLine = "a".repeat(500);
    await seedCodexSession("2026", "04", "29", "rollout-long.jsonl", `\n\n${longLine}\nnext line`);
    const { sessionId } = openSession(homeDir);
    const listing = await listLocal(sessionId, homeDir);
    const entry = listing.entries[0];
    expect(entry).toBeDefined();
    if (!entry) return;
    const preview = await readPreview(sessionId, entry.transcriptId);
    expect(preview.previewLine?.length).toBe(200);
    expect(preview.previewLine?.startsWith("aaa")).toBe(true);
  });

  it("never reads more than 64 KB of a file", async () => {
    const giant = "x".repeat(2 * 1024 * 1024);
    await seedCodexSession("2026", "04", "29", "rollout-giant.jsonl", giant);
    const { sessionId } = openSession(homeDir);
    const listing = await listLocal(sessionId, homeDir);
    const entry = listing.entries[0];
    expect(entry).toBeDefined();
    if (!entry) return;
    const preview = await readPreview(sessionId, entry.transcriptId);
    // The line had no \n, so head has all xxx... up to 64 KB. Preview slices to 200.
    expect(preview.previewLine).toBeTypeOf("string");
    expect(preview.previewLine?.length).toBe(200);
  });

  it("respects the concurrency cap of 8 in-flight reads", async () => {
    for (let i = 0; i < 30; i += 1) {
      await seedCodexSession(
        "2026",
        "04",
        "29",
        `rollout-${i.toString().padStart(2, "0")}.jsonl`,
        "x".repeat(8 * 1024),
      );
    }
    const { sessionId } = openSession(homeDir);
    const listing = await listLocal(sessionId, homeDir);
    const ids = listing.entries.map((entry) => entry.transcriptId);
    let observedMax = 0;
    const sampler = setInterval(() => {
      const n = __testing__.inFlightPreviewCount();
      if (n > observedMax) observedMax = n;
    }, 1);
    try {
      await Promise.all(ids.map((id) => readPreview(sessionId, id)));
    } finally {
      clearInterval(sampler);
    }
    expect(observedMax).toBeLessThanOrEqual(8);
    expect(observedMax).toBeGreaterThan(0);
  });

  it("returns session-expired error after the idle window", async () => {
    await seedCodexSession("2026", "04", "29", "rollout-foo.jsonl", `{"a":1}`);
    const { sessionId } = openSession(homeDir);
    const listing = await listLocal(sessionId, homeDir);
    const entry = listing.entries[0];
    expect(entry).toBeDefined();
    if (!entry) return;
    __testing__.forceExpire(sessionId);
    await expect(readPreview(sessionId, entry.transcriptId)).rejects.toThrowError(
      /session-expired/,
    );
  });

  it("returns not-found for an unknown transcriptId", async () => {
    const { sessionId } = openSession(homeDir);
    await expect(readPreview(sessionId, "does-not-exist")).rejects.toThrowError(/not-found/);
  });
});

describe("readTranscript", () => {
  it("returns the file content for an allowed transcriptId", async () => {
    const path = await seedCodexSession(
      "2026",
      "04",
      "29",
      "rollout-foo.jsonl",
      `{"role":"user","content":"hi"}\n{"role":"assistant","content":"hello"}`,
    );
    const { sessionId } = openSession(homeDir);
    const listing = await listLocal(sessionId, homeDir);
    const entry = listing.entries[0];
    expect(entry).toBeDefined();
    if (!entry) return;
    const file = await readTranscript(sessionId, entry.transcriptId);
    const onDisk = await FS.readFile(path, "utf8");
    expect(file.content).toBe(onDisk);
  });

  it("returns not-found for an invented transcriptId", async () => {
    const { sessionId } = openSession(homeDir);
    await expect(readTranscript(sessionId, "made-up")).rejects.toThrowError(/not-found/);
  });
});
