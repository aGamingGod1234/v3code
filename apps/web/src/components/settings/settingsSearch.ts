import type { SettingsSectionPath } from "./settingsNavigation";

const DEFAULT_SETTINGS_SEARCH_LIMIT = 12;

export interface SettingsSearchEntry {
  readonly id: string;
  readonly path: SettingsSectionPath;
  readonly sectionLabel: string;
  readonly title: string;
  readonly description: string;
  readonly terms?: ReadonlyArray<string>;
}

export interface SettingsSearchResult extends SettingsSearchEntry {
  readonly score: number;
}

const entry = (
  sectionLabel: string,
  path: SettingsSectionPath,
  title: string,
  description: string,
  terms?: ReadonlyArray<string>,
): SettingsSearchEntry => ({
  id: `${path}:${title}`,
  path,
  sectionLabel,
  title,
  description,
  ...(terms ? { terms } : {}),
});

export const SETTINGS_SEARCH_ENTRIES: ReadonlyArray<SettingsSearchEntry> = [
  entry(
    "General",
    "/settings/general",
    "General",
    "Theme, time format, diff line wrapping, assistant output, new threads, project directory, archive confirmation, delete confirmation, text generation model, providers, keybindings, onboarding, about, diagnostics, and archived threads.",
  ),
  entry("General", "/settings/general", "Theme", "Choose how V3 Code looks across the app."),
  entry(
    "General",
    "/settings/general",
    "Time format",
    "System default follows your browser or OS clock preference. 12-hour and 24-hour timestamps.",
  ),
  entry(
    "General",
    "/settings/general",
    "Diff line wrapping",
    "Set the default wrap state when the diff panel opens.",
  ),
  entry(
    "General",
    "/settings/general",
    "Assistant output",
    "Show token-by-token output while a response is in progress. Stream assistant messages.",
  ),
  entry(
    "General",
    "/settings/general",
    "New threads",
    "Pick the default workspace mode for newly created draft threads.",
  ),
  entry(
    "General",
    "/settings/general",
    "Add project starts in",
    'Leave empty to use "~/" when the Add Project browser opens.',
  ),
  entry(
    "General",
    "/settings/general",
    "Archive confirmation",
    "Require a second click on the inline archive action before a thread is archived.",
  ),
  entry(
    "General",
    "/settings/general",
    "Delete confirmation",
    "Ask before deleting a thread and its chat history.",
  ),
  entry(
    "General",
    "/settings/general",
    "Text generation model",
    "Configure the model used for generated commit messages, PR titles, and similar Git text.",
  ),
  entry(
    "General",
    "/settings/general",
    "Providers",
    "Codex, Claude, Cursor, OpenCode, provider status, model lists, spawn commands, CODEX_HOME, and provider settings.",
  ),
  entry(
    "General",
    "/settings/general",
    "Keybindings",
    "Open the persisted keybindings.json file to edit advanced bindings directly.",
  ),
  entry(
    "General",
    "/settings/general",
    "Onboarding",
    "Re-run server-node setup and re-take guided tour.",
  ),
  entry(
    "General",
    "/settings/general",
    "About",
    "Current version of the application, update track, Stable, Nightly, diagnostics, and local runtime details.",
  ),
  entry(
    "Appearance",
    "/settings/appearance",
    "Mode",
    "Light, dark, or system controls the base surface. Interface profiles layer on top.",
  ),
  entry(
    "Appearance",
    "/settings/appearance",
    "Interface profile",
    "Changes the app shell, spacing, composer surface, pane chrome, and colour system. V3, Codex-like, Claude-like, Cursor-like, and Windsurf-like profiles.",
  ),
  entry(
    "Appearance",
    "/settings/appearance",
    "Accent override",
    "Overrides the profile primary colour. Resetting removes the override and restores the selected profile.",
  ),
  entry(
    "Configuration",
    "/settings/configuration",
    "Work mode",
    "For coding, for everyday work, technical responses, plain-language replies, and system prompt prefix.",
  ),
  entry(
    "Configuration",
    "/settings/configuration",
    "Codex runtime",
    "Default approval, sandbox, planning, reasoning effort, tool behavior, network access, plan mode, and web search for Codex-backed runs.",
  ),
  entry(
    "Configuration",
    "/settings/configuration",
    "Permissions",
    "Default permissions, Auto-review, Full access, remembered workspaces, allowed-once, and per-run confirmation.",
  ),
  entry(
    "Configuration",
    "/settings/configuration",
    "Agent environment",
    "Where the agent runs. Windows native, WSL, macOS, Linux, and other spawnable environments.",
  ),
  entry(
    "Configuration",
    "/settings/configuration",
    "Integrated terminal shell",
    "Only shells found on PATH are listed. Restart open terminals to pick up shell changes.",
  ),
  entry(
    "Configuration",
    "/settings/configuration",
    "Follow-up behaviour",
    "Queue or steer follow-ups when you press Enter while the agent is still running.",
  ),
  entry(
    "Configuration",
    "/settings/configuration",
    "Code review",
    "Inline or detached review mode for /review from the chat composer.",
  ),
  entry(
    "Configuration",
    "/settings/configuration",
    "Auto fallback",
    "Continue after usage limits, usage-limit only trigger, fallback provider, and fallback model.",
  ),
  entry(
    "Configuration",
    "/settings/configuration",
    "Composer",
    "Guard long prompt sends. Enter sends short prompts and Ctrl+Enter sends multiline or long prompts.",
  ),
  entry(
    "Personalization",
    "/settings/personalization",
    "Saved prompts",
    "Create, edit, delete, and manage reusable prompt snippets for chat and coding work.",
  ),
  entry(
    "Personalization",
    "/settings/personalization",
    "Prompt library",
    "Custom prompts, prompt text, prompt titles, and reusable instructions.",
  ),
  entry(
    "Providers",
    "/settings/providers",
    "Providers",
    "Enable providers, refresh provider status, configure provider settings, model discovery, and command details.",
  ),
  entry(
    "Providers",
    "/settings/providers",
    "Codex",
    "Codex provider settings, model list, binary path, CODEX_HOME, and runtime status.",
  ),
  entry(
    "Providers",
    "/settings/providers",
    "Claude",
    "Claude provider settings, model list, CLI command, and runtime status.",
  ),
  entry(
    "Providers",
    "/settings/providers",
    "Cursor",
    "Cursor provider settings, model list, CLI command, and runtime status.",
  ),
  entry(
    "Providers",
    "/settings/providers",
    "OpenCode",
    "OpenCode provider settings, model list, CLI command, and runtime status.",
  ),
  entry(
    "MCP servers",
    "/settings/mcp",
    "MCP servers",
    "Model Context Protocol servers, add server, edit command, environment variables, and delete MCP server.",
    ["model context protocol"],
  ),
  entry(
    "Git",
    "/settings/git",
    "GitHub sign-in",
    "Connect a GitHub account so V3 can browse repositories and validate the stored token before any cloud handoff.",
    ["oauth", "repository", "repositories"],
  ),
  entry(
    "Git",
    "/settings/git",
    "GitHub OAuth Client ID",
    "Legacy desktop Device Flow public client ID override, built-in client ID, V3CODE_GITHUB_PUBLIC_CLIENT_ID, and development self-registered app settings.",
  ),
  entry(
    "Environments",
    "/settings/environments",
    "Manage local backend",
    "Network access, owner tools, authorized clients, local backend access, server node URL override, and V3 connections.",
  ),
  entry(
    "Environments",
    "/settings/environments",
    "Remote environments",
    "Cloud and remote environment records, saved environments, server URLs, and environment connection status.",
  ),
  entry(
    "Environments",
    "/settings/environments",
    "Chat import",
    "Import existing transcripts from Codex CLI, Claude Code, or Anthropic Console. Auto-detect skills and MCP servers.",
  ),
  entry(
    "Worktrees",
    "/settings/worktrees",
    "Worktrees",
    "Manage active repository worktrees, branch state, and worktree cleanup guidance.",
  ),
  entry(
    "Browser use",
    "/settings/browser",
    "Browser use",
    "Browser automation settings, local browser control, screenshots, and external browsing preferences.",
  ),
  entry(
    "Devices",
    "/settings/devices",
    "Devices",
    "Signed-in devices, local device identity, platform, pairing, connection state, and device sessions.",
  ),
  entry(
    "Usage",
    "/settings/usage",
    "Usage",
    "Chats, active threads, context tokens, processed tokens, archived threads, latest turns, active runtime, and limit reports.",
  ),
  entry(
    "Archive",
    "/settings/archived",
    "Archived threads",
    "Browse archived projects, archived chats, and restore or review archived thread history.",
  ),
];

export function getSettingsSearchTerms(query: string): ReadonlyArray<string> {
  return query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);
}

export function searchSettings(
  query: string,
  limit = DEFAULT_SETTINGS_SEARCH_LIMIT,
): ReadonlyArray<SettingsSearchResult> {
  const terms = getSettingsSearchTerms(query);
  if (terms.length === 0) return [];

  const results: SettingsSearchResult[] = [];
  for (const searchEntry of SETTINGS_SEARCH_ENTRIES) {
    const title = searchEntry.title.toLocaleLowerCase();
    const section = searchEntry.sectionLabel.toLocaleLowerCase();
    const description = searchEntry.description.toLocaleLowerCase();
    const aliases = (searchEntry.terms ?? []).join(" ").toLocaleLowerCase();
    const haystack = `${title} ${section} ${description} ${aliases}`;
    const matchesAllTerms = terms.every((term) => haystack.includes(term));
    if (!matchesAllTerms) continue;

    const score = terms.reduce((nextScore, term) => {
      if (title.includes(term)) return nextScore + 8;
      if (section.includes(term)) return nextScore + 5;
      if (aliases.includes(term)) return nextScore + 4;
      if (description.includes(term)) return nextScore + 2;
      return nextScore + 1;
    }, 0);

    results.push(
      searchEntry.terms
        ? {
            id: searchEntry.id,
            path: searchEntry.path,
            sectionLabel: searchEntry.sectionLabel,
            title: searchEntry.title,
            description: searchEntry.description,
            terms: searchEntry.terms,
            score,
          }
        : {
            id: searchEntry.id,
            path: searchEntry.path,
            sectionLabel: searchEntry.sectionLabel,
            title: searchEntry.title,
            description: searchEntry.description,
            score,
          },
    );
  }

  return results
    .toSorted((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}
