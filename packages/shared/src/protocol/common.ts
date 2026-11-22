import { z } from 'zod';

/**
 * Whether a string has a control character: U+0000 to U+001F, U+007F to U+009F, or a bidirectional embedding,
 * override, or isolate (U+202A to U+202E, U+2066 to U+2069), which can make a name display as another name.
 */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
    if ((code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) return true;
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
 * A single-line display string: trimmed, at least one character, at most `max`, with no control character and no
 * bidirectional override.
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
 * from this list. They are the design system's twelve player colors (`playerColors` in `apps/web/src/ui/tokens.ts`,
 * in the same order: vermilion, saffron, orpiment, weld, malachite, verdigris, cerulean, azurite, ultramarine,
 * tyrian, madder, slate), with vermilion, azurite, ultramarine, tyrian, and madder made a little lighter. Each one
 * reads at 4.5:1 or more as text on the chrome surfaces, from `#16120f` to `#2b2520`, and dark ink (`#16120f`)
 * reads at 4.5:1 or more on it as an avatar background.
 */
export const USER_COLORS = [
  '#e76742',
  '#f29e2e',
  '#e3c444',
  '#a4c639',
  '#3fae6a',
  '#2bb3a3',
  '#3fa7d6',
  '#5c8de5',
  '#8e7ff3',
  '#bc70dd',
  '#e261a0',
  '#8d9cab',
] as const;

/**
 * The palette before the design system's colors, by position. A user who has one of these colors reads as the
 * color at the same position of {@link USER_COLORS}: the server changes stored colors at startup.
 */
export const RETIRED_USER_COLORS = [
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

/**
 * A user's color: one of {@link USER_COLORS}, or, in a record from before the palette changed, one of
 * {@link RETIRED_USER_COLORS}. The server assigns and accepts only colors of `USER_COLORS`, and changes stored
 * retired colors at startup, so a client sees a retired color only in old fixtures.
 */
export const UserColor = z.enum([...USER_COLORS, ...RETIRED_USER_COLORS]);
/** A user's color. */
export type UserColor = z.infer<typeof UserColor>;

/** A color a user may pick now: one of {@link USER_COLORS}. */
export const PickableUserColor = z.enum(USER_COLORS);

/** A dungeon level that map data belongs to: a dungeon ID from the adventure and a level number. */
export const LevelRef = z.strictObject({
  dungeon_id: z.string().min(1).max(100),
  level_number: z.coerce.number().int().min(1).max(1000),
});
/** A dungeon level reference. */
export type LevelRef = z.infer<typeof LevelRef>;

/** A map coordinate in cells. Fractions place a mark inside a cell. */
export const MapCoordinate = z.number().finite().min(-LIMITS.mapCoordinate).max(LIMITS.mapCoordinate);
