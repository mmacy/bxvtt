/**
 * Reads and writes JSON in `localStorage` or `sessionStorage` without throwing. A browser can refuse storage
 * (private windows, blocked site data, a full quota), and the app keeps working with an in-memory copy for the
 * page when it does.
 *
 * A feature keeps its own values under its own prefix with {@link scopedStorage}:
 *
 * ```ts
 * const store = scopedStorage('feed', 'session');
 * store.write(`draft.${tableId}`, { text, to });
 * const draft = store.read(`draft.${tableId}`); // unknown: validate it before use
 * ```
 */

/** Every key the app layer stores, so two modules never collide. Features use {@link scopedStorage}. */
export const STORAGE_KEYS = {
  identity: 'bxvtt.identity',
  preferences: 'bxvtt.preferences',
} as const;

/** Which browser storage a value lives in: `local` survives a restart, `session` lasts as long as the tab. */
export type StorageArea = 'local' | 'session';

/** Values the browser refused to store, so this page still reads back what it wrote. */
const memory = new Map<string, string>();

function storageFor(area: StorageArea): Storage | undefined {
  // Reading `localStorage` itself throws where the browser blocks site data.
  return area === 'local' ? globalThis.localStorage : globalThis.sessionStorage;
}

/**
 * Reads a JSON value from browser storage.
 *
 * @param key - The storage key.
 * @param area - `local` (the default) or `session`.
 * @returns The parsed value, or `null` when the key is missing, unreadable, or not JSON.
 */
export function readStored(key: string, area: StorageArea = 'local'): unknown {
  let raw: string | null | undefined;
  try {
    const storage = storageFor(area);
    raw = storage ? storage.getItem(key) : memory.get(`${area}:${key}`);
  } catch {
    raw = memory.get(`${area}:${key}`);
  }
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/**
 * Writes a JSON value to browser storage, or removes the key when the value is `null`. When the browser refuses,
 * the value lives in memory for this page.
 *
 * @param key - The storage key.
 * @param value - The value to store.
 * @param area - `local` (the default) or `session`.
 */
export function writeStored(key: string, value: unknown, area: StorageArea = 'local'): void {
  const memoryKey = `${area}:${key}`;
  const raw = value === null ? null : JSON.stringify(value);
  if (raw === null) memory.delete(memoryKey);
  else memory.set(memoryKey, raw);
  try {
    const storage = storageFor(area);
    if (raw === null) storage?.removeItem(key);
    else storage?.setItem(key, raw);
  } catch {
    // Storage is full or blocked. The value lives in memory for this page.
  }
}

/** A feature's corner of browser storage. Every key it reads or writes starts with `bxvtt.<scope>.`. */
export interface ScopedStorage {
  /** The full storage key for a name, such as `bxvtt.feed.draft.tbl_1`. */
  key: (name: string) => string;
  /** Reads a JSON value, or `null`. Validate the result: another version of the app may have written it. */
  read: (name: string) => unknown;
  /** Writes a JSON value. `null` removes it. */
  write: (name: string, value: unknown) => void;
  remove: (name: string) => void;
}

/**
 * Storage for one feature, under the prefix `bxvtt.<scope>.`, so features never collide with each other or with
 * the app layer.
 *
 * @param scope - The feature's name, such as `feed` or `journal`.
 * @param area - `local` (the default) or `session`.
 */
export function scopedStorage(scope: string, area: StorageArea = 'local'): ScopedStorage {
  const key = (name: string) => `bxvtt.${scope}.${name}`;
  return {
    key,
    read: (name) => readStored(key(name), area),
    write: (name, value) => writeStored(key(name), value, area),
    remove: (name) => writeStored(key(name), null, area),
  };
}
