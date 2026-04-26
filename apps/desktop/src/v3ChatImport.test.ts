import * as FS from "node:fs/promises";
import * as OS from "node:os";
import * as Path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listLocalTranscripts, readTranscript } from "./v3ChatImportCore.ts";

const __testing = { listLocalTranscripts, readTranscript };

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

describe("listLocalTranscripts", () => {
  it("returns an empty list when no transcript directories exist", async () => {
    const home = await makeFakeHome();
    const result = await __testing.listLocalTranscripts(home);
    expect(result.entries).toEqual([]);
  });

  it("enumerates Codex sessions directly under ~/.codex/sessions", async () => {
    const home = await makeFakeHome();
    await writeFile(
      Path.join(home, ".codex", "sessions", "abc.jsonl"),
      `{"id":"x","timestamp":"2026-04-26T01:00:00Z","msg":{"type":"user_message","content":"Hi"}}\n`,
    );
    const result = await __testing.listLocalTranscripts(home);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.format).toBe("codex");
    expect(result.entries[0]?.preview).toContain("user_message");
  });

  it("recurses one level into ~/.claude/projects/<slug>/sessions", async () => {
    const home = await makeFakeHome();
    await writeFile(
      Path.join(home, ".claude", "projects", "myproj", "sessions", "s1.jsonl"),
      `{"type":"summary","summary":"Refactor"}\n`,
    );
    await writeFile(
      Path.join(home, ".claude", "projects", "other", "sessions", "s2.jsonl"),
      `{"type":"summary","summary":"Explore"}\n`,
    );
    // A non-jsonl file should be ignored.
    await writeFile(
      Path.join(home, ".claude", "projects", "myproj", "sessions", "junk.txt"),
      "ignored",
    );
    const result = await __testing.listLocalTranscripts(home);
    expect(result.entries.map((e) => Path.basename(e.path)).sort()).toEqual(["s1.jsonl", "s2.jsonl"]);
    expect(result.entries.every((e) => e.format === "claude")).toBe(true);
  });

  it("sorts newest first by modifiedAt", async () => {
    const home = await makeFakeHome();
    const oldPath = Path.join(home, ".codex", "sessions", "old.jsonl");
    const newPath = Path.join(home, ".codex", "sessions", "new.jsonl");
    await writeFile(oldPath, "{}\n");
    await writeFile(newPath, "{}\n");
    // Force the older file to look older by stamping its mtime.
    const past = new Date(Date.now() - 60_000);
    await FS.utimes(oldPath, past, past);

    const result = await __testing.listLocalTranscripts(home);
    expect(result.entries.map((e) => Path.basename(e.path))).toEqual(["new.jsonl", "old.jsonl"]);
  });
});

describe("readTranscript", () => {
  it("rejects paths outside the well-known transcript roots", async () => {
    const home = await makeFakeHome();
    const escapingPath = Path.join(home, "evil.jsonl");
    await writeFile(escapingPath, "{}");
    await expect(__testing.readTranscript(escapingPath, home)).rejects.toThrow(/Refusing to read/);
  });

  it("reads a transcript inside ~/.codex/sessions", async () => {
    const home = await makeFakeHome();
    const transcript = Path.join(home, ".codex", "sessions", "abc.jsonl");
    await writeFile(transcript, `{"id":"x"}\n`);
    const result = await __testing.readTranscript(transcript, home);
    expect(result.content).toContain('"id":"x"');
    expect(result.path).toBe(Path.resolve(transcript));
  });
});
