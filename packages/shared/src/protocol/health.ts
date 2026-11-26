import { z } from 'zod';

/**
 * Response of `GET /api/health`, which needs no token. `status` is `ok` when bxapi answers, and `degraded`
 * otherwise. Anyone gets the status, the version, `host_key_required`, and whether bxapi is reachable.
 * `bxapi.meta` (versions, auth mode, role, and storage) and the cause in `bxapi.error` go only to a request with
 * a user's token. Without one, `meta` is `null` and `error` is a general sentence.
 */
export const Health = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  /**
   * Whether creating a table needs the host key, so the home page can show the key field before a first attempt
   * fails. Optional in the type so that older fixtures still compile. This server always sends it.
   */
  host_key_required: z.boolean().optional(),
  uptime_seconds: z.number(),
  bxapi: z.object({
    reachable: z.boolean(),
    /**
     * Whether bxapi answers but runs an osrlib older than bxvtt needs, so the server serves no game. Anyone gets
     * it, because it reveals no version. `false` while bxapi is unreachable.
     */
    outdated: z.boolean(),
    meta: z
      .object({
        api_version: z.string(),
        engine_version: z.string(),
        schema_version: z.number(),
        auth_enabled: z.boolean(),
        role: z.string(),
        storage: z.object({ used_bytes: z.number(), max_bytes: z.number().nullable() }),
      })
      .nullable(),
    error: z.string().nullable(),
  }),
});
/** Response of `GET /api/health`. */
export type Health = z.infer<typeof Health>;
