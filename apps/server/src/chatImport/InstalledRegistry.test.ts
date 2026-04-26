import * as FS from "node:fs/promises";
import * as OS from "node:os";
import * as Path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { readInstalledSnapshot, resolveReferences } from "./InstalledRegistry.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await FS.rm(root, { recursive: true, force: true });
  }
});

const makeFakeHome = async (): Promise<string> => {
  const root = await FS.mkdtemp(Path.join(OS.tmpdir(), "v3-installed-registry-"));
  tempRoots.push(root);
  return root;
};

describe("readInstalledSnapshot", () => {
  it("returns empty arrays when no host-CLI dirs exist", async () => {
    const home = await makeFakeHome();
    const snapshot = await readInstalledSnapshot(home);
    expect(snapshot.skills).toEqual([]);
    expect(snapshot.mcpServers).toEqual([]);
  });

  it("enumerates skills as directories containing SKILL.md", async () => {
    const home = await makeFakeHome();
    const codexSkillDir = Path.join(home, ".codex", "skills", "smart_search");
    await FS.mkdir(codexSkillDir, { recursive: true });
    await FS.writeFile(Path.join(codexSkillDir, "SKILL.md"), "# Smart search\n", "utf8");

    const claudeSkillDir = Path.join(home, ".claude", "skills", "review");
    await FS.mkdir(claudeSkillDir, { recursive: true });
    await FS.writeFile(Path.join(claudeSkillDir, "SKILL.md"), "# Review\n", "utf8");

    // A directory without SKILL.md should NOT be reported.
    const dudDir = Path.join(home, ".agents", "skills", "scratch");
    await FS.mkdir(dudDir, { recursive: true });

    const snapshot = await readInstalledSnapshot(home);
    expect(snapshot.skills.map((s) => s.id).sort()).toEqual(["review", "smart_search"]);
  });

  it("extracts Codex MCP server ids from config.toml [mcp_servers.<name>] tables", async () => {
    const home = await makeFakeHome();
    await FS.mkdir(Path.join(home, ".codex"), { recursive: true });
    await FS.writeFile(
      Path.join(home, ".codex", "config.toml"),
      `# header
[mcp_servers.context-mode]
command = "ctx"

[mcp_servers.claude-mem]
command = "mem"
`,
      "utf8",
    );

    const snapshot = await readInstalledSnapshot(home);
    expect(snapshot.mcpServers.map((m) => m.id).sort()).toEqual(["claude-mem", "context-mode"]);
  });

  it("extracts Claude Code MCP server ids from ~/.claude.json", async () => {
    const home = await makeFakeHome();
    await FS.writeFile(
      Path.join(home, ".claude.json"),
      JSON.stringify({
        mcpServers: {
          "context-mode": { command: "node" },
          "claude-mem": { command: "node" },
        },
      }),
      "utf8",
    );

    const snapshot = await readInstalledSnapshot(home);
    expect(snapshot.mcpServers.map((m) => m.id).sort()).toEqual(["claude-mem", "context-mode"]);
  });

  it("ignores corrupt ~/.claude.json without throwing", async () => {
    const home = await makeFakeHome();
    await FS.writeFile(Path.join(home, ".claude.json"), "{not-json", "utf8");
    const snapshot = await readInstalledSnapshot(home);
    expect(snapshot.mcpServers).toEqual([]);
  });
});

describe("resolveReferences", () => {
  it("marks ids that match the snapshot as enabled and the rest as missing", () => {
    const result = resolveReferences(
      {
        skillIds: ["smart_search", "unknown_skill"],
        mcpServerIds: ["context-mode", "missing-mcp"],
      },
      {
        skills: [{ id: "smart_search", source: ".codex/skills" }],
        mcpServers: [{ id: "context-mode", source: "~/.claude.json" }],
      },
    );

    expect(result.skills).toEqual([
      { id: "smart_search", status: "enabled", source: ".codex/skills" },
      { id: "unknown_skill", status: "missing", source: null },
    ]);
    expect(result.mcpServers).toEqual([
      { id: "context-mode", status: "enabled", source: "~/.claude.json" },
      { id: "missing-mcp", status: "missing", source: null },
    ]);
  });

  it("dedupes input ids before resolving", () => {
    const result = resolveReferences(
      { skillIds: ["x", "x", "y"], mcpServerIds: [] },
      { skills: [], mcpServers: [] },
    );
    expect(result.skills).toHaveLength(2);
  });
});
