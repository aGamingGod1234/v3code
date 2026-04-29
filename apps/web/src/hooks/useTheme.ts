import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  DEFAULT_THEME_NAME,
  LEGACY_THEME_NAME_MAP,
  isThemeName,
  type ThemeName,
} from "../themes/themeNames";

type Theme = "light" | "dark" | "system";
type ThemeSnapshot = {
  theme: Theme;
  systemDark: boolean;
  themeName: ThemeName;
  accentOverride: string | null;
};

const STORAGE_KEY = "t3code:theme";
const LEGACY_THEME_NAME_STORAGE_KEY = "v3code:themeName";
const THEME_NAME_STORAGE_KEY = "v3code:interfaceProfile";
const ACCENT_STORAGE_KEY = "v3code:accentOverride";
const ACCENT_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const MEDIA_QUERY = "(prefers-color-scheme: dark)";
const DEFAULT_THEME_SNAPSHOT: ThemeSnapshot = {
  theme: "system",
  systemDark: false,
  themeName: DEFAULT_THEME_NAME,
  accentOverride: null,
};
const THEME_COLOR_META_NAME = "theme-color";
const DYNAMIC_THEME_COLOR_SELECTOR = `meta[name="${THEME_COLOR_META_NAME}"][data-dynamic-theme-color="true"]`;

let listeners: Array<() => void> = [];
let lastSnapshot: ThemeSnapshot | null = null;
let lastDesktopTheme: Theme | null = null;

function emitChange() {
  for (const listener of listeners) listener();
}

function hasThemeStorage() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function getSystemDark() {
  return typeof window !== "undefined" && window.matchMedia(MEDIA_QUERY).matches;
}

function getStored(): Theme {
  if (!hasThemeStorage()) return DEFAULT_THEME_SNAPSHOT.theme;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return DEFAULT_THEME_SNAPSHOT.theme;
}

function getStoredThemeName(): ThemeName {
  if (!hasThemeStorage()) return DEFAULT_THEME_NAME;
  const raw = localStorage.getItem(THEME_NAME_STORAGE_KEY);
  if (isThemeName(raw)) return raw;
  const legacyRaw = localStorage.getItem(LEGACY_THEME_NAME_STORAGE_KEY);
  if (legacyRaw && LEGACY_THEME_NAME_MAP[legacyRaw]) {
    const migrated = LEGACY_THEME_NAME_MAP[legacyRaw];
    localStorage.setItem(THEME_NAME_STORAGE_KEY, migrated);
    return migrated;
  }
  return DEFAULT_THEME_NAME;
}

function getStoredAccent(): string | null {
  if (!hasThemeStorage()) return null;
  const raw = localStorage.getItem(ACCENT_STORAGE_KEY);
  if (!raw) return null;
  return ACCENT_REGEX.test(raw) ? raw : null;
}

function ensureThemeColorMetaTag(): HTMLMetaElement {
  let element = document.querySelector<HTMLMetaElement>(DYNAMIC_THEME_COLOR_SELECTOR);
  if (element) {
    return element;
  }

  element = document.createElement("meta");
  element.name = THEME_COLOR_META_NAME;
  element.setAttribute("data-dynamic-theme-color", "true");
  document.head.append(element);
  return element;
}

function normalizeThemeColor(value: string | null | undefined): string | null {
  const normalizedValue = value?.trim().toLowerCase();
  if (
    !normalizedValue ||
    normalizedValue === "transparent" ||
    normalizedValue === "rgba(0, 0, 0, 0)" ||
    normalizedValue === "rgba(0 0 0 / 0)"
  ) {
    return null;
  }

  return value?.trim() ?? null;
}

function resolveBrowserChromeSurface(): HTMLElement {
  return (
    document.querySelector<HTMLElement>("main[data-slot='sidebar-inset']") ??
    document.querySelector<HTMLElement>("[data-slot='sidebar-inner']") ??
    document.body
  );
}

export function syncBrowserChromeTheme() {
  if (typeof document === "undefined" || typeof getComputedStyle === "undefined") return;
  const surfaceColor = normalizeThemeColor(
    getComputedStyle(resolveBrowserChromeSurface()).backgroundColor,
  );
  const fallbackColor = normalizeThemeColor(getComputedStyle(document.body).backgroundColor);
  const backgroundColor = surfaceColor ?? fallbackColor;
  if (!backgroundColor) return;

  document.documentElement.style.backgroundColor = backgroundColor;
  document.body.style.backgroundColor = backgroundColor;
  ensureThemeColorMetaTag().setAttribute("content", backgroundColor);
}

function applyThemeName(name: ThemeName) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (typeof root.setAttribute !== "function") return;
  root.setAttribute("data-theme", name);
  root.setAttribute("data-interface-profile", name);
}

function applyAccentOverride(accent: string | null) {
  if (typeof document === "undefined") return;
  const style = document.documentElement.style;
  if (
    !style ||
    typeof style.setProperty !== "function" ||
    typeof style.removeProperty !== "function"
  ) {
    return;
  }
  if (accent && ACCENT_REGEX.test(accent)) {
    style.setProperty("--primary", accent);
    style.setProperty("--ring", accent);
  } else {
    style.removeProperty("--primary");
    style.removeProperty("--ring");
  }
}

function applyTheme(theme: Theme, suppressTransitions = false) {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (suppressTransitions) {
    document.documentElement.classList.add("no-transitions");
  }
  const isDark = theme === "dark" || (theme === "system" && getSystemDark());
  document.documentElement.classList.toggle("dark", isDark);
  applyThemeName(getStoredThemeName());
  applyAccentOverride(getStoredAccent());
  syncBrowserChromeTheme();
  syncDesktopTheme(theme);
  if (suppressTransitions) {
    // Force a reflow so the no-transitions class takes effect before removal
    // oxlint-disable-next-line no-unused-expressions
    document.documentElement.offsetHeight;
    requestAnimationFrame(() => {
      document.documentElement.classList.remove("no-transitions");
    });
  }
}

function syncDesktopTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  const bridge = window.desktopBridge;
  if (!bridge || lastDesktopTheme === theme) {
    return;
  }

  lastDesktopTheme = theme;
  void bridge.setTheme(theme).catch(() => {
    if (lastDesktopTheme === theme) {
      lastDesktopTheme = null;
    }
  });
}

// Apply immediately on module load to prevent flash
if (typeof document !== "undefined" && hasThemeStorage()) {
  applyTheme(getStored());
}

function getSnapshot(): ThemeSnapshot {
  if (!hasThemeStorage()) return DEFAULT_THEME_SNAPSHOT;
  const theme = getStored();
  const systemDark = theme === "system" ? getSystemDark() : false;
  const themeName = getStoredThemeName();
  const accentOverride = getStoredAccent();

  if (
    lastSnapshot &&
    lastSnapshot.theme === theme &&
    lastSnapshot.systemDark === systemDark &&
    lastSnapshot.themeName === themeName &&
    lastSnapshot.accentOverride === accentOverride
  ) {
    return lastSnapshot;
  }

  lastSnapshot = { theme, systemDark, themeName, accentOverride };
  return lastSnapshot;
}

function getServerSnapshot() {
  return DEFAULT_THEME_SNAPSHOT;
}

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.push(listener);

  // Listen for system preference changes
  const mq = window.matchMedia(MEDIA_QUERY);
  const handleChange = () => {
    if (getStored() === "system") applyTheme("system", true);
    emitChange();
  };
  mq.addEventListener("change", handleChange);

  // Listen for storage changes from other tabs
  const handleStorage = (e: StorageEvent) => {
    if (
      e.key === STORAGE_KEY ||
      e.key === THEME_NAME_STORAGE_KEY ||
      e.key === LEGACY_THEME_NAME_STORAGE_KEY ||
      e.key === ACCENT_STORAGE_KEY
    ) {
      applyTheme(getStored(), true);
      emitChange();
    }
  };
  window.addEventListener("storage", handleStorage);

  return () => {
    listeners = listeners.filter((l) => l !== listener);
    mq.removeEventListener("change", handleChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useTheme() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const theme = snapshot.theme;

  const resolvedTheme: "light" | "dark" =
    theme === "system" ? (snapshot.systemDark ? "dark" : "light") : theme;

  const setTheme = useCallback((next: Theme) => {
    if (!hasThemeStorage()) return;
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next, true);
    emitChange();
  }, []);

  // Keep DOM in sync on mount/change
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return { theme, setTheme, resolvedTheme } as const;
}

export function useThemeName() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setThemeName = useCallback((next: ThemeName) => {
    if (!hasThemeStorage()) return;
    localStorage.setItem(THEME_NAME_STORAGE_KEY, next);
    applyThemeName(next);
    syncBrowserChromeTheme();
    emitChange();
  }, []);
  return { themeName: snapshot.themeName, setThemeName } as const;
}

export function useAccentOverride() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setAccent = useCallback((next: string | null) => {
    if (!hasThemeStorage()) return;
    if (next && !ACCENT_REGEX.test(next)) return;
    if (next) {
      localStorage.setItem(ACCENT_STORAGE_KEY, next);
    } else {
      localStorage.removeItem(ACCENT_STORAGE_KEY);
    }
    applyAccentOverride(next);
    syncBrowserChromeTheme();
    emitChange();
  }, []);
  return { accentOverride: snapshot.accentOverride, setAccent } as const;
}
