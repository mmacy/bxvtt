import { z } from 'zod';
import type { AdventureInfo } from '../bxapi';
import { Timestamp, UserId } from './common';

export type { AdventureInfo };

/**
 * Where an adventure comes from: `builtin` adventures come with bxapi, `sample` adventures are the documents in
 * the repository's `adventures/` directory, and `uploaded` adventures are documents a referee of the table
 * uploaded.
 */
export const AdventureSource = z.enum(['builtin', 'sample', 'uploaded']);
/** Where an adventure comes from. */
export type AdventureSource = z.infer<typeof AdventureSource>;

/**
 * One adventure a table can play. `id` is what `POST /api/tables/{table_id}/game` takes as `adventure_id`: a
 * bxapi ID for a built-in or uploaded adventure, and `sample:<file name>` for a sample, which the server uploads
 * to bxapi the first time a table plays it. `info` is bxapi's adventure info, which holds only what a player
 * may know before play.
 */
export const AdventureListing = z.object({
  id: z.string(),
  source: AdventureSource,
  info: z.custom<AdventureInfo>(),
  uploaded_by: UserId.nullable(),
  uploaded_at: Timestamp.nullable(),
});
/** One adventure a table can play. */
export type AdventureListing = z.infer<typeof AdventureListing>;

/** Response of `GET /api/tables/{table_id}/adventures`: built-in adventures, then samples, then uploads. */
export const AdventureList = z.object({ items: z.array(AdventureListing) });
/** Response of `GET /api/tables/{table_id}/adventures`. */
export type AdventureList = z.infer<typeof AdventureList>;

/**
 * An adventure document, as osr-forge and osr-editor write it: an envelope with `kind`, `schema_version`,
 * `engine_version`, and `payload`. The server checks only that it's a JSON object, and bxapi validates it.
 */
export const AdventureDocument = z.looseObject({
  kind: z.string(),
});
/** An adventure document. */
export type AdventureDocument = z.infer<typeof AdventureDocument>;

/**
 * Response of `POST /api/tables/{table_id}/adventures/validate`: bxapi's verdict. `valid: false` comes with
 * the `code` and `detail` that an upload would return.
 */
export const AdventureValidation = z.union([
  z.object({ valid: z.literal(true), adventure: z.custom<AdventureInfo>() }),
  z.object({ valid: z.literal(false), code: z.string(), detail: z.string() }),
]);
/** Response of `POST /api/tables/{table_id}/adventures/validate`. */
export type AdventureValidation = z.infer<typeof AdventureValidation>;
