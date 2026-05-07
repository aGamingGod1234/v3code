// Preview swatches for the Appearance settings panel. The actual CSS
// variable values live in apps/web/src/index.css under
// `:root[data-theme="<name>"]` so the swap happens at the CSSOM level.

import type { ThemeName } from "./themeNames";

export interface ThemeSwatch {
  readonly background: string;
  readonly foreground: string;
  readonly primary: string;
  readonly card: string;
}

export interface ThemeSwatchSet {
  readonly light: ThemeSwatch;
  readonly dark: ThemeSwatch;
}

export const THEME_SWATCHES: Record<ThemeName, ThemeSwatchSet> = {
  v3: {
    light: {
      background: "oklch(1 0 0)",
      foreground: "oklch(0.27 0.02 250)",
      primary: "oklch(0.488 0.217 264)",
      card: "oklch(1 0 0)",
    },
    dark: {
      background: "oklch(0.21 0.005 250)",
      foreground: "oklch(0.94 0.005 250)",
      primary: "oklch(0.588 0.217 264)",
      card: "oklch(0.24 0.005 250)",
    },
  },
  codex: {
    light: {
      background: "oklch(1 0 0)",
      foreground: "oklch(0.27 0.02 250)",
      primary: "oklch(0.31 0.006 250)",
      card: "oklch(0.995 0.002 250)",
    },
    dark: {
      background: "oklch(0.18 0.005 250)",
      foreground: "oklch(0.94 0.005 250)",
      primary: "oklch(0.86 0.006 250)",
      card: "oklch(0.21 0.005 250)",
    },
  },
  claude: {
    light: {
      background: "oklch(0.985 0.005 80)",
      foreground: "oklch(0.27 0.02 60)",
      primary: "oklch(0.65 0.16 35)",
      card: "oklch(1 0 0)",
    },
    dark: {
      background: "oklch(0.21 0.01 60)",
      foreground: "oklch(0.94 0.005 60)",
      primary: "oklch(0.72 0.16 35)",
      card: "oklch(0.24 0.01 60)",
    },
  },
  cursor: {
    light: {
      background: "oklch(1 0 0)",
      foreground: "oklch(0.27 0.02 280)",
      primary: "oklch(0.62 0.22 285)",
      card: "oklch(0.99 0.005 280)",
    },
    dark: {
      background: "oklch(0.16 0.01 280)",
      foreground: "oklch(0.94 0.005 280)",
      primary: "oklch(0.7 0.22 285)",
      card: "oklch(0.2 0.01 280)",
    },
  },
  windsurf: {
    light: {
      background: "oklch(0.99 0.005 200)",
      foreground: "oklch(0.27 0.02 220)",
      primary: "oklch(0.65 0.16 200)",
      card: "oklch(1 0 0)",
    },
    dark: {
      background: "oklch(0.2 0.015 220)",
      foreground: "oklch(0.94 0.005 220)",
      primary: "oklch(0.72 0.16 200)",
      card: "oklch(0.24 0.015 220)",
    },
  },
};
