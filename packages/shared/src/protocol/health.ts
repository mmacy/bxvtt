import { z } from 'zod';

/**
 * Response of `GET /api/health`, which needs no token. `status` is `ok` when bxapi answers, and `degraded`
 * otherwise. `bxapi.meta` holds the facts from bxapi's `GET /v1/meta` (versions, auth mode, role, and storage),
 * or `null` when bxapi is unreachable.
 */
export const Health = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  uptime_seconds: z.number(),
  bxapi: z.object({
    reachable: z.boolean(),
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
