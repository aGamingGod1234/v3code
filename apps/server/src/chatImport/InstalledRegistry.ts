// InstalledRegistry — locates skills and MCP servers already installed on
// the host so we can resolve references found in imported chat transcripts
// to either "enabled" or "missing" without trying to install third-party
// code on the user's behalf.
//
// Skills: scan well-known directories for `SKILL.md` (each subdirectory of
// the registry is a skill, named after the directory). Three host-CLI
// locations are checked: ~/.codex/skills, ~/.agents/skills, ~/.claude/skills.
//
// MCPs: read host-CLI config files. Codex has ~/.codex/config.toml with a
// [mcp_servers] table; Claude Code has ~/.claude.json with an `mcpServers`
// object. We only enumerate ids — actual install / enable is deferred to the
// host CLI.

import * as FS from "node:fs/promises";
import * as OS from "node:os";
import * as Path from "node:path";

const SKILL_REGISTRIES = [".codex/skills", ".agents/skills", ".claude/skills"] as const;

const safeReadDir = async (path: string): Promise<readonly string[]> => {
  try {
    const entries = await FS.readdir(path, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
};

const safeStat = async (path: string): Promise<boolean> => {
  try {
    await FS.access(path, FS.constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

const safeReadFile = async (path: string): Promise<string | null> => {
  try {
    return await FS.readFile(path, "utf8");
  } catch {
    return null;
  }
};

export interface InstalledSkill {
  readonly id: string;
  readonly source: string;
}

export interface InstalledMcp {
  readonly id: string;
  readonly source: string;
}

export interface InstalledSnapshot {
  readonly skills: ReadonlyArray<InstalledSkill>;
  readonly mcpServers: ReadonlyArray<InstalledMcp>;
}

const collectSkills = async (homeDir: string): Promise<ReadonlyArray<InstalledSkill>> => {
  const out: InstalledSkill[] = [];
  for (const rel of SKILL_REGISTRIES) {
    const root = Path.join(homeDir, rel);
    const subdirs = await safeReadDir(root);
    for (const id of subdirs) {
      const skillFile = Path.join(root, id, "SKILL.md");
      if (await safeStat(skillFile)) {
        out.push({ id, source: rel });
      }
    }
  }
  return out;
};

// Tiny TOML key extractor — pulls server names out of a [mcp_servers.<name>]
// header. Avoids depending on a real TOML parser; we only need the
// section names, not their fields.
const extractCodexMcpIds = (toml: string): ReadonlyArray<string> => {
  const out: string[] = [];
  for (const raw of toml.split("\n")) {
    const line = raw.trim();
    const match = line.match(/^\[mcp_servers\.([^\]\s]+)\]/);
    if (match && match[1]) out.push(match[1]);
  }
  return out;
};

const collectMcps = async (homeDir: string): Promise<ReadonlyArray<InstalledMcp>> => {
  const out: InstalledMcp[] = [];

  const codexToml = await safeReadFile(Path.join(homeDir, ".codex", "config.toml"));
  if (codexToml !== null) {
    for (const id of extractCodexMcpIds(codexToml)) {
      out.push({ id, source: "~/.codex/config.toml" });
    }
  }

  const claudeJson = await safeReadFile(Path.join(homeDir, ".claude.json"));
  if (claudeJson !== null) {
    try {
      const parsed = JSON.parse(claudeJson) as { mcpServers?: Record<string, unknown> };
      const servers = parsed.mcpServers;
      if (servers && typeof servers === "object" && !Array.isArray(servers)) {
        for (const id of Object.keys(servers)) {
          out.push({ id, source: "~/.claude.json" });
        }
      }
    } catch {
      // Ignore — corrupt JSON shouldn't fail the whole resolution.
    }
  }

  return out;
};

export const readInstalledSnapshot = async (
  homeDir: string = OS.homedir(),
): Promise<InstalledSnapshot> => {
  const [skills, mcpServers] = await Promise.all([collectSkills(homeDir), collectMcps(homeDir)]);
  return { skills, mcpServers };
};

export interface ResolutionInput {
  readonly skillIds: ReadonlyArray<string>;
  readonly mcpServerIds: ReadonlyArray<string>;
}

export interface SkillResolution {
  readonly id: string;
  readonly status: "enabled" | "missing";
  readonly source: string | null;
}

export interface McpResolution {
  readonly id: string;
  readonly status: "enabled" | "missing";
  readonly source: string | null;
}

export interface ResolutionOutput {
  readonly skills: ReadonlyArray<SkillResolution>;
  readonly mcpServers: ReadonlyArray<McpResolution>;
}

export const resolveReferences = (
  references: ResolutionInput,
  snapshot: InstalledSnapshot,
): ResolutionOutput => {
  const skillIndex = new Map(snapshot.skills.map((s) => [s.id, s]));
  const mcpIndex = new Map(snapshot.mcpServers.map((s) => [s.id, s]));

  const skills: SkillResolution[] = [];
  for (const id of new Set(references.skillIds)) {
    const hit = skillIndex.get(id);
    skills.push(
      hit
        ? { id, status: "enabled", source: hit.source }
        : { id, status: "missing", source: null },
    );
  }

  const mcpServers: McpResolution[] = [];
  for (const id of new Set(references.mcpServerIds)) {
    const hit = mcpIndex.get(id);
    mcpServers.push(
      hit
        ? { id, status: "enabled", source: hit.source }
        : { id, status: "missing", source: null },
    );
  }

  return { skills, mcpServers };
};
