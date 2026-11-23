import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { EventPage } from '@bxvtt/shared/protocol';
import { CommandRequest, EventsQuery, StartGameRequest, UpdateSeatRequest } from '@bxvtt/shared/protocol';
import { callBxapi } from '../bxapi';
import type { Context } from '../context';
import { ApiError, notFound, parseBody, parseQuery } from '../errors';
import { readSeats } from './seats';

/** The path parameters of a table route. */
const TableParams = z.object({ tableId: z.string() });
/** The path parameters of a seat route. */
const SeatParams = z.object({ tableId: z.string(), memberId: z.string() });

/**
 * Registers the game routes under `/api/tables/{table_id}/game`: start, read, and end a game, send commands, read
 * events, the referee state and adventure, and seats.
 *
 * @param app - The Fastify instance.
 * @param ctx - The server's services.
 */
export function registerGameRoutes(app: FastifyInstance, ctx: Context): void {
  const { game, tables } = ctx;

  app.post('/api/tables/:tableId/game', async (request, reply) => {
    const { tableId } = TableParams.parse(request.params);
    const user = ctx.auth.user(request);
    tables.requireReferee(tableId, user);
    const body = parseBody(StartGameRequest, request);
    return reply.status(201).send(await game.start(tableId, user, body));
  });

  app.get('/api/tables/:tableId/game', async (request) => {
    const { tableId } = TableParams.parse(request.params);
    const role = tables.requireMember(tableId, ctx.auth.user(request));
    const state = await game.stateFor(tableId, role);
    if (state === null) throw new ApiError('no_game', 'No game is in progress at this table.');
    return state;
  });

  app.delete('/api/tables/:tableId/game', async (request, reply) => {
    const { tableId } = TableParams.parse(request.params);
    const user = ctx.auth.user(request);
    tables.requireReferee(tableId, user);
    await game.end(tableId, user);
    return reply.status(204).send();
  });

  app.post('/api/tables/:tableId/game/commands', async (request) => {
    const { tableId } = TableParams.parse(request.params);
    const user = ctx.auth.user(request);
    const role = tables.requireMember(tableId, user);
    const body = parseBody(CommandRequest, request);
    return game.command(tableId, user, role, body, request.id);
  });

  app.get('/api/tables/:tableId/game/events', async (request) => {
    const { tableId } = TableParams.parse(request.params);
    const role = tables.requireMember(tableId, ctx.auth.user(request));
    const query = parseQuery(EventsQuery, request);
    if (query.visibility === 'referee' && role !== 'referee') {
      throw new ApiError('referee_required', 'Only a referee can view referee events.');
    }
    const live = await game.require(tableId);
    return callBxapi(() =>
      ctx.bxapi.get<EventPage>(`/v1/sessions/${encodeURIComponent(live.sessionId)}/events`, {
        after: query.after,
        limit: query.limit,
        visibility: query.visibility ?? 'player',
      }),
    );
  });

  app.get('/api/tables/:tableId/game/referee', async (request) => {
    const { tableId } = TableParams.parse(request.params);
    tables.requireReferee(tableId, ctx.auth.user(request));
    return game.locked(tableId, async () => game.refereeFor(await game.require(tableId)));
  });

  app.get('/api/tables/:tableId/game/adventure', async (request, reply) => {
    const { tableId } = TableParams.parse(request.params);
    tables.requireReferee(tableId, ctx.auth.user(request));
    const document = await game.adventureDocument(tableId);
    reply.header('ETag', document.etag).header('Cache-Control', 'private, no-cache');
    const match = request.headers['if-none-match'];
    if (
      typeof match === 'string' &&
      match.split(',').some((tag) => tag.trim().replace(/^W\//, '') === document.etag)
    ) {
      return reply.status(304).send();
    }
    return reply.type('application/json').send(document.body);
  });

  app.put('/api/tables/:tableId/game/seats/:memberId', async (request) => {
    const { tableId, memberId } = SeatParams.parse(request.params);
    const user = ctx.auth.user(request);
    tables.requireReferee(tableId, user);
    const body = parseBody(UpdateSeatRequest, request);
    if (body.user_id !== null && tables.roleOf(tableId, body.user_id) === null) {
      throw new ApiError('validation_error', 'You can assign a seat only to a member of this table.', {
        errors: [{ path: ['user_id'], message: 'User is not a member of this table.' }],
      });
    }
    return game.locked(tableId, async () => {
      const live = await game.require(tableId);
      const changed = ctx.db.run(
        'UPDATE seats SET user_id = ? WHERE table_id = ? AND session_id = ? AND member_id = ?',
        body.user_id,
        tableId,
        live.sessionId,
        memberId,
      );
      if (changed === 0) notFound('seat', memberId);
      ctx.feed.system(tableId, user.id, 'seat_changed', { member_id: memberId, user_id: body.user_id });
      await game.pushStateLocked(tableId);
      return { items: readSeats(ctx.db, tableId, live.sessionId) };
    });
  });
}
