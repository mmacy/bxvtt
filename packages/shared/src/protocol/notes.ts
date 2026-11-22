import { z } from 'zod';
import { LIMITS, Timestamp, UserId } from './common';

/**
 * Which notes document: `party` notes, which every member can read and edit, or `referee` notes, which only
 * referees can read and edit.
 */
export const NotesKind = z.enum(['party', 'referee']);
/** Which notes document. */
export type NotesKind = z.infer<typeof NotesKind>;

/**
 * A plain-text notes document. `version` goes up by 1 with each edit. The `notes` WebSocket message carries the
 * same object after each edit.
 */
export const Notes = z.object({
  kind: NotesKind,
  text: z.string(),
  version: z.number().int(),
  updated_by: UserId.nullable(),
  updated_at: Timestamp.nullable(),
});
/** A plain-text notes document. */
export type Notes = z.infer<typeof Notes>;

/**
 * Body of `PUT /api/tables/{table_id}/notes/{kind}`. `version` is the version the edit started from. When
 * someone saved in between, the server refuses with 409 `stale_version` and the current document in `notes`.
 */
export const UpdateNotesRequest = z.strictObject({
  text: z.string().max(LIMITS.notesText),
  version: z.number().int().min(0),
});
/** Body of `PUT /api/tables/{table_id}/notes/{kind}`. */
export type UpdateNotesRequest = z.infer<typeof UpdateNotesRequest>;
