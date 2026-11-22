import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Annotation, LevelAnnotations, LevelRef, Role } from '@bxvtt/shared/protocol';
import {
  AnnotationsQuery,
  ClearAnnotationsRequest,
  CreateAnnotationRequest,
  LIMITS,
} from '@bxvtt/shared/protocol';
import type { Context } from './context';
import { json, num, str } from './db';
import { ApiError, notFound, parseBody, parseQuery } from './errors';
import { newId, now } from './ids';
import { rateLimited } from './auth';

/** The path parameters of a table route. */
const TableParams = z.object({ tableId: z.string() });
/** The path parameters of an annotation route. */
const AnnotationParams = z.object({ tableId: z.string(), annotationId: z.string() });

/**
 * Reads the annotations on one level that a role may see.
 *
 * @param ctx - The server's services.
 * @param tableId - The table ID.
 * @param level - The level.
 * @param role - The reader's role. A player doesn't see `referees` pins, and sees nothing on a level that isn't on
 *   the party's map, because marks there are the referee's plans.
 */
export function levelAnnotations(
  ctx: Context,
  tableId: string,
  level: LevelRef,
  role: Role,
): LevelAnnotations {
  if (role !== 'referee' && !ctx.game.levelKnown(tableId, level)) {
    return { dungeon_id: level.dungeon_id, level_number: level.level_number, items: [] };
  }
  const rows = ctx.db.all(
    `SELECT data_json FROM annotations WHERE table_id = ? AND dungeon_id = ? AND level_number = ?
     AND (visibility = 'everyone' OR ? = 'referee') ORDER BY seq`,
    tableId,
    level.dungeon_id,
    level.level_number,
    role,
  );
  return {
    dungeon_id: level.dungeon_id,
    level_number: level.level_number,
    items: rows.map((row) => json<Annotation>(row, 'data_json')),
  };
}

/**
 * Sends the annotations of one level to every connection of the table, filtered for each role.
 *
 * @param ctx - The server's services.
 * @param tableId - The table ID.
 * @param level - The level that changed.
 */
async function broadcastLevel(ctx: Context, tableId: string, level: LevelRef): Promise<void> {
  // The players' copy depends on the party's map, which the server reads from the game.
  await ctx.game.current(tableId).catch(() => null);
  const byRole = new Map<Role, LevelAnnotations>();
  ctx.hub.send(tableId, ({ role }) => {
    let annotations = byRole.get(role);
    if (annotations === undefined) {
      annotations = levelAnnotations(ctx, tableId, level, role);
      byRole.set(role, annotations);
    }
    return { type: 'annotations', annotations };
  });
}

/**
 * Registers the annotation routes under `/api/tables/{table_id}/annotations`: freehand strokes and pins on a
 * dungeon level. Any member may draw and pin. The author or a referee may erase one, and a referee may clear a
 * level.
 *
 * @param app - The Fastify instance.
 * @param ctx - The server's services.
 */
export function registerAnnotationRoutes(app: FastifyInstance, ctx: Context): void {
  app.get('/api/tables/:tableId/annotations', async (request) => {
    const { tableId } = TableParams.parse(request.params);
    const role = ctx.tables.requireMember(tableId, ctx.auth.user(request));
    const level = parseQuery(AnnotationsQuery, request);
    if (role !== 'referee') await ctx.game.current(tableId);
    return levelAnnotations(ctx, tableId, level, role);
  });

  app.post('/api/tables/:tableId/annotations', async (request, reply) => {
    const { tableId } = TableParams.parse(request.params);
    const user = ctx.auth.user(request);
    const role = ctx.tables.requireMember(tableId, user);
    const body = parseBody(CreateAnnotationRequest, request);
    const level = { dungeon_id: body.dungeon_id, level_number: body.level_number };
    if (body.kind === 'pin' && body.visibility === 'referees' && role !== 'referee') {
      throw new ApiError('referee_required', 'Only a referee can place a pin that only referees see.');
    }
    const retry = ctx.limits.userPosts.take(user.id);
    if (retry > 0) throw rateLimited('You are marking the map too fast. Wait a moment.', retry);
    if (role !== 'referee') {
      await ctx.game.current(tableId);
      if (!ctx.game.levelKnown(tableId, level)) {
        throw new ApiError('forbidden', "The party hasn't mapped that level, so you can't mark it.");
      }
    }
    const total = num(
      ctx.db.get('SELECT count(*) AS n FROM annotations WHERE table_id = ?', tableId) ?? { n: 0 },
      'n',
    );
    if (total >= ctx.config.quotas.annotationsPerTable) {
      throw new ApiError(
        'content_too_large',
        'This table has as many annotations as it can hold. Erase some first.',
      );
    }
    const count = num(
      ctx.db.get(
        'SELECT count(*) AS n FROM annotations WHERE table_id = ? AND dungeon_id = ? AND level_number = ?',
        tableId,
        level.dungeon_id,
        level.level_number,
      ) ?? { n: 0 },
      'n',
    );
    if (count >= LIMITS.annotationsPerLevel) {
      throw new ApiError(
        'content_too_large',
        'This level has as many annotations as it can hold. Erase some first.',
      );
    }
    const base = {
      id: newId('ann'),
      dungeon_id: level.dungeon_id,
      level_number: level.level_number,
      author_id: user.id,
      created_at: now(),
    };
    let annotation: Annotation;
    if (body.kind === 'stroke') {
      annotation = {
        ...base,
        kind: 'stroke',
        points: body.points,
        color: body.color ?? user.color,
        width: body.width,
      };
    } else {
      const visibility = body.visibility ?? 'everyone';
      annotation = {
        ...base,
        kind: 'pin',
        x: body.x,
        y: body.y,
        text: body.text,
        color: body.color ?? user.color,
        visibility,
      };
    }
    const seq = num(ctx.db.get('SELECT coalesce(max(seq), 0) + 1 AS s FROM annotations') ?? { s: 1 }, 's');
    ctx.db.run(
      `INSERT INTO annotations (id, table_id, dungeon_id, level_number, kind, author_id, visibility, data_json,
       created_at, seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      annotation.id,
      tableId,
      level.dungeon_id,
      level.level_number,
      annotation.kind,
      user.id,
      annotation.kind === 'pin' ? annotation.visibility : 'everyone',
      JSON.stringify(annotation),
      annotation.created_at,
      seq,
    );
    await broadcastLevel(ctx, tableId, level);
    return reply.status(201).send(annotation);
  });

  app.delete('/api/tables/:tableId/annotations/:annotationId', async (request, reply) => {
    const { tableId, annotationId } = AnnotationParams.parse(request.params);
    const user = ctx.auth.user(request);
    const role = ctx.tables.requireMember(tableId, user);
    const row = ctx.db.get('SELECT * FROM annotations WHERE id = ? AND table_id = ?', annotationId, tableId);
    if (row === undefined || (role !== 'referee' && str(row, 'visibility') !== 'everyone')) {
      notFound('annotation', annotationId);
    }
    if (role !== 'referee' && str(row, 'author_id') !== user.id) {
      throw new ApiError('forbidden', 'You can erase only your own marks. A referee can erase any.');
    }
    ctx.db.run('DELETE FROM annotations WHERE id = ?', annotationId);
    await broadcastLevel(ctx, tableId, {
      dungeon_id: str(row, 'dungeon_id'),
      level_number: num(row, 'level_number'),
    });
    return reply.status(204).send();
  });

  app.post('/api/tables/:tableId/annotations/clear', async (request, reply) => {
    const { tableId } = TableParams.parse(request.params);
    ctx.tables.requireReferee(tableId, ctx.auth.user(request));
    const level = parseBody(ClearAnnotationsRequest, request);
    ctx.db.run(
      'DELETE FROM annotations WHERE table_id = ? AND dungeon_id = ? AND level_number = ?',
      tableId,
      level.dungeon_id,
      level.level_number,
    );
    await broadcastLevel(ctx, tableId, level);
    return reply.status(204).send();
  });
}
