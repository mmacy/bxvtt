import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Notes, NotesKind as NotesKindType } from '@bxvtt/shared/protocol';
import { NotesKind, UpdateNotesRequest } from '@bxvtt/shared/protocol';
import type { Context } from './context';
import { num, str, strOrNull } from './db';
import { ApiError, notFound, parseBody } from './errors';
import { now } from './ids';

/** The path parameters of a notes route. */
const NotesParams = z.object({ tableId: z.string(), kind: z.string() });

/**
 * Reads a table's notes document. A document nobody has written is empty at version 0.
 *
 * @param ctx - The server's services.
 * @param tableId - The table ID.
 * @param kind - `party` or `referee`.
 */
export function readNotes(ctx: Context, tableId: string, kind: NotesKindType): Notes {
  const row = ctx.db.get('SELECT * FROM notes WHERE table_id = ? AND kind = ?', tableId, kind);
  if (row === undefined) return { kind, text: '', version: 0, updated_by: null, updated_at: null };
  return {
    kind,
    text: str(row, 'text'),
    version: num(row, 'version'),
    updated_by: strOrNull(row, 'updated_by'),
    updated_at: strOrNull(row, 'updated_at'),
  };
}

/**
 * Registers the notes routes: `GET` and `PUT /api/tables/{table_id}/notes/{kind}`. Every member can read and edit
 * the party notes. Only referees can read and edit the referee notes.
 *
 * @param app - The Fastify instance.
 * @param ctx - The server's services.
 */
export function registerNotesRoutes(app: FastifyInstance, ctx: Context): void {
  const resolve = (params: unknown, request: Parameters<Context['auth']['user']>[0]) => {
    const { tableId, kind: rawKind } = NotesParams.parse(params);
    const parsedKind = NotesKind.safeParse(rawKind);
    if (!parsedKind.success) notFound('notes', rawKind);
    const user = ctx.auth.user(request);
    const role = ctx.tables.requireMember(tableId, user);
    if (parsedKind.data === 'referee' && role !== 'referee') {
      throw new ApiError('referee_required', 'Only referees can read the referee notes.');
    }
    return { tableId, kind: parsedKind.data, user };
  };

  app.get('/api/tables/:tableId/notes/:kind', async (request) => {
    const { tableId, kind } = resolve(request.params, request);
    return readNotes(ctx, tableId, kind);
  });

  app.put('/api/tables/:tableId/notes/:kind', async (request) => {
    const { tableId, kind, user } = resolve(request.params, request);
    const body = parseBody(UpdateNotesRequest, request);
    const updated = ctx.db.transaction(() => {
      const current = readNotes(ctx, tableId, kind);
      if (current.version !== body.version) {
        throw new ApiError(
          'stale_version',
          'Someone saved these notes after you started editing. Merge and save again.',
          {
            notes: current,
          },
        );
      }
      ctx.db.run(
        `INSERT INTO notes (table_id, kind, text, version, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (table_id, kind) DO UPDATE SET text = excluded.text, version = excluded.version,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
        tableId,
        kind,
        body.text,
        current.version + 1,
        user.id,
        now(),
      );
      return readNotes(ctx, tableId, kind);
    });
    ctx.hub.send(tableId, ({ role }) =>
      kind === 'referee' && role !== 'referee' ? null : { type: 'notes', notes: updated },
    );
    return updated;
  });
}
