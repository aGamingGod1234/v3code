// Named theme dimension. Orthogonal to light/dark/system — those still toggle
// the `dark` class on <html>; theme name toggles a `data-theme` attribute.
//
// Themes are CSS-variable swaps only. Layout, spacing, and component structure
// stay identical across themes.

export const THEME_NAMES = [
  "v3code",
  "codex-inspired",
  "claude-inspired",
  "cursor-inspired",
  "windsurf-inspired",
] as const;

export type ThemeName = (typeof THEME_NAMES)[number];

export const DEFAULT_THEME_NAME: ThemeName = "v3code";

export const THEME_LABEL: Record<ThemeName, string> = {
  v3code: "V3 Code",
  "codex-inspired": "Codex-inspired",
  "claude-inspired": "Claude-inspired",
  "cursor-inspired": "Cursor-inspired",
  "windsurf-inspired": "Windsurf-inspired",
};

export const isThemeName = (value: unknown): value is ThemeName =>
  typeof value === "string" && (THEME_NAMES as ReadonlyArray<string>).includes(value);
