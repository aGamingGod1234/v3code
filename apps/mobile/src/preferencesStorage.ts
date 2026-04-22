// V3 Phase 9 — Capacitor Preferences-backed implementation of the
// `localStorage`-shaped storage the web bundle uses for device-id
// persistence, Google token handoff, sign-in state, etc.
//
// Rationale: Android WebView `localStorage` is per-origin *and* gets
// wiped by the system when it decides the WebView process is
// backgrounded for too long (Android 14+ aggressive memory reclaim).
// Capacitor Preferences is a thin wrapper over
// `SharedPreferences` / NSUserDefaults — survives process restarts,
// survives app updates, survives Android 14+ eviction.
//
// The web bundle reads storage through a tiny abstraction at
// `apps/web/src/clientPersistenceStorage.ts`; this module exposes the
// same `Storage` surface so we can swap it in from `apps/mobile/src/main.ts`
// before the bundle's first read.
//
// Synchronous `getItem` semantics are preserved by keeping an in-memory
// cache hydrated at boot. All writes fire-and-forget into the Plugin
// and update the cache synchronously so subsequent `getItem` calls see
// their own writes.

import type { PreferencesPlugin } from "@capacitor/preferences";

interface PluginLike {
  readonly get: (options: { key: string }) => Promise<{ value: string | null }>;
  readonly set: (options: { key: string; value: string }) => Promise<void>;
  readonly remove: (options: { key: string }) => Promise<void>;
  readonly keys?: () => Promise<{ keys: string[] }>;
  readonly clear?: () => Promise<void>;
}

export interface PreferencesStorage extends Storage {
  /** Resolves once every key has been hydrated from the native plugin. */
  readonly ready: Promise<void>;
}

export const createPreferencesStorage = (
  plugin: PluginLike | PreferencesPlugin,
): PreferencesStorage => {
  const cache = new Map<string, string>();
  const typed: PluginLike = plugin as PluginLike;

  const hydrate = async (): Promise<void> => {
    if (typeof typed.keys !== "function") return;
    const { keys } = await typed.keys();
    await Promise.all(
      keys.map(async (key) => {
        const { value } = await typed.get({ key });
        if (value !== null) cache.set(key, value);
      }),
    );
  };

  const ready = hydrate().catch(() => undefined);

  const storage: PreferencesStorage = {
    get length() {
      return cache.size;
    },
    ready,
    key(index: number): string | null {
      const keys = Array.from(cache.keys());
      return keys[index] ?? null;
    },
    getItem(key: string): string | null {
      return cache.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      cache.set(key, value);
      void typed.set({ key, value }).catch(() => undefined);
    },
    removeItem(key: string): void {
      cache.delete(key);
      void typed.remove({ key }).catch(() => undefined);
    },
    clear(): void {
      cache.clear();
      if (typeof typed.clear === "function") {
        void typed.clear().catch(() => undefined);
      }
    },
  };

  return storage;
};
