import { z } from 'zod';

/** Whether a string has a control character: U+0000 to U+001F, or U+007F to U+009F. */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/** Sizes the server enforces. The client uses the same numbers to stop a user before the server refuses. */
export const LIMITS = {
  /** Longest display name of a user, in characters. */
  userName: 40,
  /** Longest table name, in characters. */
  tableName: 80,
  /** Longest chat message, whisper, or dice command, in characters. */
  feedText: 2000,
  /** Most recipients of one whisper. */
  whisperRecipients: 20,
  /** Longest notes document, in characters. */
  notesText: 50_000,
  /** Longest pin note, in characters. */
  pinText: 280,
  /** Most points in one freehand stroke. */
  strokePoints: 1000,
  /** Most annotations on one dungeon level. */
  annotationsPerLevel: 2000,
  /** Largest map coordinate, in cells, in either direction. */
  mapCoordinate: 10_000,
  /** Longest save label, in characters. */
  saveLabel: 100,
  /** Largest JSON request body, in bytes, except for adventure documents. */
  jsonBodyBytes: 65_536,
  /** Largest adventure document, in bytes. */
  adventureBodyBytes: 8_388_608,
  /** Largest WebSocket message a client may send, in bytes. */
  wsMessageBytes: 16_384,
  /** Most feed entries in one page. */
  feedPage: 200,
  /** Most autosaves the server keeps for one table. */
  autosaves: 10,
} as const;

/**
 * A single-line display string: trimmed, at least one character, at most `max`, with no control character.
 *
 * @param max - The most characters the string may have after trimming.
 */
export function displayString(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !hasControlCharacter(value), { message: 'must not contain a control character' });
}

/** A user ID: `usr_` and 22 URL-safe characters. */
export const UserId = z.string().regex(/^usr_[A-Za-z0-9_-]{22}$/);
/** A user ID. */
export type UserId = z.infer<typeof UserId>;

/** A table ID: `tbl_` and 22 URL-safe characters. */
export const TableId = z.string().regex(/^tbl_[A-Za-z0-9_-]{22}$/);
/** A table ID. */
export type TableId = z.infer<typeof TableId>;

/** A bxapi stored character ID, such as `chr_PUtflt1xPCTJIwhqMcAIrA`. */
export const CharacterId = z.string().regex(/^chr_[A-Za-z0-9_-]{22}$/);
/** A bxapi stored character ID. */
export type CharacterId = z.infer<typeof CharacterId>;

/** A party member ID inside a session, such as `character-0001`. */
export const MemberId = z.string().min(1).max(64);
/** A party member ID inside a session. */
export type MemberId = z.infer<typeof MemberId>;

/** A bxapi save ID, such as `sav_E6NKZNiBl4c2jL_rkyY8Bg`. */
export const SaveId = z.string().regex(/^sav_[A-Za-z0-9_-]{22}$/);
/** A bxapi save ID. */
export type SaveId = z.infer<typeof SaveId>;

/** A UTC timestamp in RFC 3339 format with whole seconds, like `2026-11-20T22:01:05Z`. */
export const Timestamp = z.string();
/** A UTC timestamp. */
export type Timestamp = z.infer<typeof Timestamp>;

/** A member's role at a table. A referee runs the game. A player plays the characters in their seats. */
export const Role = z.enum(['referee', 'player']);
/** A member's role at a table. */
export type Role = z.infer<typeof Role>;

/**
 * The colors a user can have. The server assigns one when it creates a user, and a user can pick another one
 * from this list. The palette combines the Okabe-Ito and Paul Tol palettes, which stay distinct for readers
 * with a color vision deficiency.
 */
export const USER_COLORS = [
  '#e69f00',
  '#56b4e9',
  '#009e73',
  '#f0e442',
  '#0072b2',
  '#d55e00',
  '#cc79a7',
  '#882255',
  '#44aa99',
  '#999933',
  '#aa4499',
  '#6699cc',
] as const;

/** One of the colors in {@link USER_COLORS}. */
export const UserColor = z.enum(USER_COLORS);
/** One of the user colors. */
export type UserColor = z.infer<typeof UserColor>;

/** A dungeon level that map data belongs to: a dungeon ID from the adventure and a level number. */
export const LevelRef = z.strictObject({
  dungeon_id: z.string().min(1).max(100),
  level_number: z.coerce.number().int().min(1).max(1000),
});
/** A dungeon level reference. */
export type LevelRef = z.infer<typeof LevelRef>;

/** A map coordinate in cells. Fractions place a mark inside a cell. */
export const MapCoordinate = z.number().finite().min(-LIMITS.mapCoordinate).max(LIMITS.mapCoordinate);
