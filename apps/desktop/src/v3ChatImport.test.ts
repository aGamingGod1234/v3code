import * as FS from "node:fs/promises";
import * as OS from "node:os";
import * as Path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  closeSession,
  listLocal,
  openSession,
  readPreview,
  readTranscript,
} from "./v3ChatImportCore.ts";

const __testing = { closeSession, listLocal, openSession, readPreview, readTranscript };

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await FS.rm(root, { recursive: true, force: true });
  }
});

const makeFakeHome = async (): Promise<string> => {
  const root = await FS.mkdtemp(Path.join(OS.tmpdir(), "v3-chat-import-test-"));
  tempRoots.push(root);
  return root;
};

const writeFile = async (path: string, content: string): Promise<void> => {
  await FS.mkdir(Path.dirname(path), { recursive: true });
  await FS.writeFile(path, content, "utf8");
};

describe("listLocal", () => {
  it("returns an empty list when no transcript directories exist", async () => {
    const home = await makeFakeHome();
    const { sessionId } = __testing.openSession(home);
    const result = await __testing.listLocal(sessionId, home);
    expect(result.entries).toEqual([]);
    __testing.closeSession(sessionId);
  });

  it("enumerates Codex sessions below ~/.codex/sessions", async () => {
    const home = await makeFakeHome();
    await writeFile(
      Path.join(home, ".codex", "sessions", "2026", "04", "26", "abc.jsonl"),
      `{"id":"x","timestamp":"2026-04-26T01:00:00Z","msg":{"type":"user_message","content":"Hi"}}\n`,
    );
    const { sessionId } = __testing.openSession(home);
    const result = await __testing.listLocal(sessionId, home);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.format).toBe("codex");
    const preview = await __testing.readPreview(sessionId, result.entries[0]!.transcriptId);
    expect(preview.previewLine).toContain("Hi");
    __testing.closeSession(sessionId);
  });

  it("reads top-level Claude jsonl files under ~/.claude/projects/<slug>", async () => {
    const home = await makeFakeHome();
    await writeFile(
      Path.join(home, ".claude", "projects", "myproj", "s1.jsonl"),
      `{"type":"summary","summary":"Refactor"}\n`,
    );
    await writeFile(
      Path.join(home, ".claude", "projects", "other", "s2.jsonl"),
      `{"type":"summary","summary":"Explore"}\n`,
    );
    await writeFile(
      Path.join(home, ".claude", "projects", "myproj", "nested", "ignored.jsonl"),
      "{}\n",
    );
    await writeFile(Path.join(home, ".claude", "projects", "myproj", "junk.txt"), "ignored");
    const { sessionId } = __testing.openSession(home);
    const result = await __testing.listLocal(sessionId, home, "claude");
    expect(result.entries.map((entry) => Path.basename(entry.displayPath)).toSorted()).toEqual([
      "s1.jsonl",
      "s2.jsonl",
    ]);
    expect(result.entries.every((entry) => entry.format === "claude")).toBe(true);
    __testing.closeSession(sessionId);
  });

  it("sorts newest first by modifiedAt", async () => {
    const home = await makeFakeHome();
    const oldPath = Path.join(home, ".codex", "sessions", "2026", "01", "01", "old.jsonl");
    const newPath = Path.join(home, ".codex", "sessions", "2026", "01", "02", "new.jsonl");
    await writeFile(oldPath, "{}\n");
    await writeFile(newPath, "{}\n");
    // Force the older file to look older by stamping its mtime.
    const past = new Date(Date.now() - 60_000);
    await FS.utimes(oldPath, past, past);

    const { sessionId } = __testing.openSession(home);
    const result = await __testing.listLocal(sessionId, home);
    expect(result.entries.map((entry) => Path.basename(entry.displayPath))).toEqual([
      "new.jsonl",
      "old.jsonl",
    ]);
    __testing.closeSession(sessionId);
  });
});

describe("readTranscript", () => {
  it("rejects unknown transcript ids without path leakage", async () => {
    const home = await makeFakeHome();
    const { sessionId } = __testing.openSession(home);
    await expect(__testing.readTranscript(sessionId, "missing")).rejects.toThrow(/not-found/);
    __testing.closeSession(sessionId);
  });

  it("reads a transcript inside ~/.codex/sessions", async () => {
    const home = await makeFakeHome();
    const transcript = Path.join(home, ".codex", "sessions", "2026", "04", "26", "abc.jsonl");
    await writeFile(transcript, `{"id":"x"}\n`);
    const { sessionId } = __testing.openSession(home);
    const listing = await __testing.listLocal(sessionId, home);
    const result = await __testing.readTranscript(sessionId, listing.entries[0]!.transcriptId);
    expect(result.content).toContain('"id":"x"');
    __testing.closeSession(sessionId);
  });
});
