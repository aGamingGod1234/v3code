// MRU list of folders the user has chosen via HomeComposer.
// Backed by localStorage; corruption-safe.

const STORAGE_KEY = "v3code:recentFolders";
const MAX = 10;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

export const readRecentFolders = (): string[] => {
  if (typeof localStorage === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isStringArray(parsed)) return [];
    return parsed.filter((path) => path.length > 0).slice(0, MAX);
  } catch {
    return [];
  }
};

export const writeRecentFolders = (folders: ReadonlyArray<string>): void => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(folders.slice(0, MAX)));
  } catch {
    // Quota or private-mode failure — ignore.
  }
};

export const pushRecentFolder = (folder: string): string[] => {
  if (folder.length === 0) return readRecentFolders();
  const current = readRecentFolders();
  const deduped = [folder, ...current.filter((existing) => existing !== folder)];
  const next = deduped.slice(0, MAX);
  writeRecentFolders(next);
  return next;
};

export const removeRecentFolder = (folder: string): string[] => {
  const next = readRecentFolders().filter((existing) => existing !== folder);
  writeRecentFolders(next);
  return next;
};
