// Pull skill / MCP-server / model references out of a stream of parsed
// messages. Heuristic only — we look for tool-use names matching the
// well-known `mcp__<server>__<tool>` namespace, plus a small set of skill
// hint patterns (skill IDs are commonly invoked as `mcp__plugin_*__skill-id`
// or surface in tool args as `{"skill": "..."}`).

import type { ParsedMessage, ParsedReferences } from "@v3tools/contracts";

const MCP_TOOL_PREFIX = "mcp__";

const dedupe = (values: ReadonlyArray<string>): ReadonlyArray<string> => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (v.length === 0 || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
};

const extractMcpServerId = (toolName: string): string | null => {
  if (!toolName.startsWith(MCP_TOOL_PREFIX)) return null;
  const rest = toolName.slice(MCP_TOOL_PREFIX.length);
  const sep = rest.indexOf("__");
  if (sep === -1) return rest;
  return rest.slice(0, sep);
};

const SKILL_ARG_PATTERN = /(?:skill|skill_id|name)\s*[:=]\s*"([a-zA-Z0-9_-]{2,80})"/g;
const MCP_TOOL_NAME_PATTERN = /mcp__([a-zA-Z0-9_-]+)__[a-zA-Z0-9_-]+/g;

const extractSkillIdsFromContent = (content: string): ReadonlyArray<string> => {
  const out: string[] = [];
  SKILL_ARG_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SKILL_ARG_PATTERN.exec(content)) !== null) {
    if (match[1]) out.push(match[1]);
  }
  return out;
};

const extractMcpServerIdsFromContent = (content: string): ReadonlyArray<string> => {
  const out: string[] = [];
  MCP_TOOL_NAME_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MCP_TOOL_NAME_PATTERN.exec(content)) !== null) {
    if (match[1]) out.push(match[1]);
  }
  return out;
};

export const collectReferences = (
  messages: ReadonlyArray<ParsedMessage>,
  modelHints: ReadonlyArray<string | null>,
): ParsedReferences => {
  const skills: string[] = [];
  const mcps: string[] = [];

  for (const message of messages) {
    if (message.toolName) {
      const mcp = extractMcpServerId(message.toolName);
      if (mcp) mcps.push(mcp);

      if (message.toolName.startsWith("mcp__plugin_")) {
        const parts = message.toolName.split("__");
        if (parts.length >= 3 && parts[2]) skills.push(parts[2]);
      }
    }
    for (const skill of extractSkillIdsFromContent(message.content)) {
      skills.push(skill);
    }
    for (const mcp of extractMcpServerIdsFromContent(message.content)) {
      mcps.push(mcp);
    }
  }

  return {
    skillIds: dedupe(skills),
    mcpServerIds: dedupe(mcps),
    modelIds: dedupe(modelHints.filter((m): m is string => m !== null && m.length > 0)),
  };
};
