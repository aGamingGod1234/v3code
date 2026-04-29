// Full app interface profiles. Light/dark/system still toggles the `dark`
// class on <html>; the profile toggles `data-theme` and `data-interface-profile`.

export const THEME_NAMES = ["v3", "codex", "claude", "cursor", "windsurf"] as const;

export type ThemeName = (typeof THEME_NAMES)[number];
export type InterfaceProfile = ThemeName;

export const DEFAULT_THEME_NAME: ThemeName = "v3";
export const DEFAULT_INTERFACE_PROFILE = DEFAULT_THEME_NAME;

export const THEME_LABEL: Record<ThemeName, string> = {
  v3: "V3",
  codex: "Codex-like",
  claude: "Claude-like",
  cursor: "Cursor-like",
  windsurf: "Windsurf-like",
};

export const LEGACY_THEME_NAME_MAP: Record<string, ThemeName> = {
  v3code: "v3",
  "codex-inspired": "codex",
  "claude-inspired": "claude",
  "cursor-inspired": "cursor",
  "windsurf-inspired": "windsurf",
};

export const isThemeName = (value: unknown): value is ThemeName =>
  typeof value === "string" && (THEME_NAMES as ReadonlyArray<string>).includes(value);
