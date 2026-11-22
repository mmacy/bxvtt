import { z } from 'zod';
import { LIMITS, SaveId, Timestamp, UserId, displayString } from './common';

/** A saved game of the table. `autosave` marks a save the server made by itself. */
export const SaveEntry = z.object({
  id: SaveId,
  session_id: z.string(),
  label: z.string().nullable(),
  autosave: z.boolean(),
  mode: z.string(),
  clock: z.object({ rounds: z.number().int(), turns: z.number().int(), days: z.number().int() }),
  adventure_name: z.string(),
  created_by: UserId.nullable(),
  created_at: Timestamp,
});
/** A saved game of the table. */
export type SaveEntry = z.infer<typeof SaveEntry>;

/** Response of `GET /api/tables/{table_id}/saves`: every save of the table's games, newest first. */
export const SaveList = z.object({ items: z.array(SaveEntry) });
/** Response of `GET /api/tables/{table_id}/saves`. */
export type SaveList = z.infer<typeof SaveList>;

/** Body of `POST /api/tables/{table_id}/saves`. Any member may save. */
export const CreateSaveRequest = z.strictObject({
  label: displayString(LIMITS.saveLabel).optional(),
});
/** Body of `POST /api/tables/{table_id}/saves`. */
export type CreateSaveRequest = z.infer<typeof CreateSaveRequest>;

/** Body of `PATCH /api/tables/{table_id}/saves/{save_id}`. `null` removes the label. The save's creator or a referee may send it. */
export const RenameSaveRequest = z.strictObject({
  label: displayString(LIMITS.saveLabel).nullable(),
});
/** Body of `PATCH /api/tables/{table_id}/saves/{save_id}`. */
export type RenameSaveRequest = z.infer<typeof RenameSaveRequest>;
