/**
 * Reads and writes JSON in `localStorage` without throwing. A browser can refuse storage (private windows,
 * blocked site data), and the app keeps working with in-memory state when it does.
 */

/** Every key the app stores, so two modules never collide. */
export const STORAGE_KEYS = {
  identity: 'bxvtt.identity',
  preferences: 'bxvtt.preferences',
} as const;

/**
 * Reads a JSON value from `localStorage`.
 *
 * @param key - The storage key.
 * @returns The parsed value, or `null` when the key is missing, unreadable, or not JSON.
 */
export function readStored(key: string): unknown {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw === null || raw === undefined ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/**
 * Writes a JSON value to `localStorage`, or removes the key when the value is `null`.
 *
 * @param key - The storage key.
 * @param value - The value to store.
 */
export function writeStored(key: string, value: unknown): void {
  try {
    if (value === null) globalThis.localStorage?.removeItem(key);
    else globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is full or blocked. The value lives in memory for this page.
  }
}
