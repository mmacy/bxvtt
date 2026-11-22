import { playerColorIds, type PlayerColorId } from '../tokens';

/** FNV-1a 32-bit hash of a string. Stable across sessions and browsers. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Picks a player color for a name, so the same name always gets the same color. */
export function colorIdForName(name: string): PlayerColorId {
  const key = name.trim().toLowerCase();
  const index = hashString(key) % playerColorIds.length;
  return playerColorIds[index] ?? 'slate';
}

/**
 * Initials for a name, at most two characters.
 *
 * "Wren Ashdown" becomes "WA", "Goblin 3" becomes "G3", "Wren" becomes "W", and
 * "Brother Aldous of Hale" becomes "BH".
 */
export function initialsForName(name: string): string {
  const words = name
    .trim()
    .split(/[\s\-_]+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word));
  const first = words[0];
  if (!first) return '?';
  const firstChar = Array.from(first.replace(/[^\p{L}\p{N}]/gu, ''))[0] ?? '?';
  if (words.length === 1) return firstChar.toUpperCase();
  const last = words[words.length - 1] ?? '';
  const lastChar = Array.from(last.replace(/[^\p{L}\p{N}]/gu, ''))[0] ?? '';
  return (firstChar + lastChar).toUpperCase();
}
