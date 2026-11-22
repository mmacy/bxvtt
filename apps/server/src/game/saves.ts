import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SaveInfo, SessionInfo } from '@bxvtt/shared/bxapi';
import type { GameState, PlayerView, SaveEntry, User } from '@bxvtt/shared/protocol';
import { CreateSaveRequest, LIMITS, RenameSaveRequest } from '@bxvtt/shared/protocol';
import { BxapiProblem, callBxapi } from '../bxapi';
import type { Context } from '../context';
import type { Row } from '../db';
import { json, num, str, strOrNull } from '../db';
import { ApiError, notFound, parseBody } from '../errors';
import { copySeats } from './seats';
import type { GameService, LiveGame } from './service';

/** The path parameters of a save route. */
const SaveParams = z.object({ tableId: z.string(), saveId: z.string() });
/** The path parameters of a table route. */
const TableParams = z.object({ tableId: z.string() });

/** Converts a `saves` row. */
function toEntry(row: Row): SaveEntry {
  return {
    id: str(row, 'id'),
    session_id: str(row, 'session_id'),
    label: strOrNull(row, 'label'),
    autosave: num(row, 'autosave') === 1,
    mode: str(row, 'mode'),
    clock: json<SaveEntry['clock']>(row, 'clock_json'),
    adventure_name: str(row, 'adventure_name'),
    created_by: strOrNull(row, 'created_by'),
    created_at: str(row, 'created_at'),
  };
}

/**
 * Decides whether a change of the player view is a moment worth an autosave, and labels it: entering a dungeon,
 * reaching another level, an encounter or battle opening (the last moment before a battle), and returning to
 * town.
 *
 * @param before - The view before the command.
 * @param after - The view after it.
 * @param dungeonNames - Dungeon names by ID.
 * @returns The autosave's label, or `null` for no autosave.
 */
export function autosaveLabel(
  before: PlayerView,
  after: PlayerView,
  dungeonNames: Record<string, string>,
): string | null {
  const from = before.location;
  const to = after.location;
  const dungeon = (id: string | null | undefined) => (id == null ? 'the dungeon' : (dungeonNames[id] ?? id));
  let label: string | null = null;
  if (from.kind === 'town' && to.kind === 'dungeon') {
    label = `Entered ${dungeon(to.dungeon_id)}`;
  } else if (from.kind === 'dungeon' && to.kind === 'town') {
    label = `Returned to ${after.town_name}`;
  } else if (
    from.kind === 'dungeon' &&
    to.kind === 'dungeon' &&
    (from.dungeon_id !== to.dungeon_id || from.level_number !== to.level_number)
  ) {
    label = `${dungeon(to.dungeon_id)}, level ${to.level_number ?? '?'}`;
  } else if (
    (before.mode === 'exploring' || before.mode === 'town') &&
    (after.mode === 'encounter' || after.mode === 'battle')
  ) {
    const where =
      to.kind === 'dungeon' ? ` in ${dungeon(to.dungeon_id)}, level ${to.level_number ?? '?'}` : '';
    label = `Before the battle${where}`;
  }
  return label === null ? null : `Autosave: ${label}`.slice(0, LIMITS.saveLabel);
}

/**
 * The table's saves. Any member can save. A referee restores a save, which creates a new bxapi session and moves
 * the table to it. Autosaves keep only the newest {@link LIMITS.autosaves}.
 */
export class SaveService {
  /**
   * @param ctx - The server's services.
   * @param game - The game service.
   */
  constructor(
    private readonly ctx: Context,
    private readonly game: GameService,
  ) {}

  /**
   * Lists a table's saves, newest first.
   *
   * @param tableId - The table ID.
   */
  list(tableId: string): SaveEntry[] {
    return this.ctx.db.all('SELECT * FROM saves WHERE table_id = ? ORDER BY seq DESC', tableId).map(toEntry);
  }

  /**
   * Saves the table's game. The caller holds the table's lock.
   *
   * @param live - The game.
   * @param userId - Who saved, or `null` for an autosave.
   * @param label - The label.
   * @param autosave - Whether the server saved by itself.
   */
  async createLocked(
    live: LiveGame,
    userId: string | null,
    label: string | null,
    autosave: boolean,
  ): Promise<SaveEntry> {
    if (!autosave) {
      const count = num(
        this.ctx.db.get(
          'SELECT count(*) AS n FROM saves WHERE table_id = ? AND autosave = 0',
          live.tableId,
        ) ?? {
          n: 0,
        },
        'n',
      );
      if (count >= this.ctx.config.quotas.savesPerTable) {
        throw new ApiError(
          'forbidden',
          `The table has ${count} saves, the most this server keeps. Delete an old save first.`,
        );
      }
    }
    const info = await callBxapi(() =>
      this.ctx.bxapi.post<SaveInfo>(
        `/v1/sessions/${encodeURIComponent(live.sessionId)}/saves`,
        label === null ? {} : { label },
      ),
    );
    const seq = num(this.ctx.db.get('SELECT coalesce(max(seq), 0) + 1 AS s FROM saves') ?? { s: 1 }, 's');
    this.ctx.db.run(
      `INSERT INTO saves (id, table_id, session_id, label, autosave, mode, clock_json, adventure_name, created_by,
       created_at, seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      info.id,
      live.tableId,
      live.sessionId,
      info.label,
      autosave ? 1 : 0,
      info.mode,
      JSON.stringify(info.clock),
      info.adventure_name,
      userId,
      info.created_at,
      seq,
    );
    this.ctx.feed.system(live.tableId, userId, 'save_created', {
      save_id: info.id,
      label: info.label,
      autosave,
    });
    if (autosave) await this.pruneAutosaves(live.tableId);
    const row = this.ctx.db.get('SELECT * FROM saves WHERE id = ?', info.id);
    if (row === undefined) throw new Error('The save just written is missing.');
    return toEntry(row);
  }

  /**
   * Saves automatically when the table's `autosave` setting is on and a command reached a meaningful moment. A
   * failed autosave is logged and doesn't fail the command. The caller holds the table's lock.
   *
   * @param live - The game after the command.
   * @param before - The player view before the command.
   */
  async autosaveAfterLocked(live: LiveGame, before: PlayerView): Promise<void> {
    if (!this.ctx.tables.settings(live.tableId).autosave) return;
    const game = this.ctx.tables.game(live.tableId);
    const label = autosaveLabel(before, live.view, game?.record.dungeon_names ?? {});
    if (label === null) return;
    try {
      await this.createLocked(live, null, label, true);
    } catch (error) {
      this.ctx.log.warn({ err: error, table: live.tableId }, 'autosave failed');
    }
  }

  private async pruneAutosaves(tableId: string): Promise<void> {
    const old = this.ctx.db.all(
      'SELECT id FROM saves WHERE table_id = ? AND autosave = 1 ORDER BY seq DESC LIMIT -1 OFFSET ?',
      tableId,
      LIMITS.autosaves,
    );
    for (const row of old) {
      const id = str(row, 'id');
      try {
        await this.ctx.bxapi.request('DELETE', `/v1/saves/${encodeURIComponent(id)}`);
      } catch (error) {
        if (!(error instanceof BxapiProblem && error.code === 'not_found')) {
          this.ctx.log.warn({ err: error, save: id }, 'could not delete an old autosave');
          continue;
        }
      }
      this.ctx.db.run('DELETE FROM saves WHERE id = ?', id);
    }
  }

  /**
   * Reads one of a table's saves.
   *
   * @param tableId - The table ID.
   * @param saveId - The save ID.
   * @throws ApiError `not_found` for a save of another table.
   */
  row(tableId: string, saveId: string): Row {
    const row = this.ctx.db.get('SELECT * FROM saves WHERE id = ? AND table_id = ?', saveId, tableId);
    if (row === undefined) notFound('save', saveId);
    return row;
  }

  /**
   * Checks that a user may change a save: its creator or a referee.
   *
   * @param tableId - The table ID.
   * @param saveId - The save ID.
   * @param user - The user.
   */
  checkOwner(tableId: string, saveId: string, user: User): Row {
    const role = this.ctx.tables.requireMember(tableId, user);
    const row = this.row(tableId, saveId);
    if (role !== 'referee' && strOrNull(row, 'created_by') !== user.id) {
      throw new ApiError('forbidden', 'Only the member who made a save or a referee can change it.');
    }
    return row;
  }

  /**
   * Restores a save into a new bxapi session and moves the table to it. Seats carry over by member ID.
   *
   * @param tableId - The table ID.
   * @param user - The referee.
   * @param saveId - The save ID.
   */
  async restore(tableId: string, user: User, saveId: string): Promise<GameState> {
    return this.game.locked(tableId, async () => {
      const save = this.row(tableId, saveId);
      const previous = this.ctx.tables.game(tableId);
      const session = await callBxapi(() =>
        this.ctx.bxapi.post<SessionInfo>(`/v1/saves/${encodeURIComponent(saveId)}/restore`, {}),
      );
      let view: PlayerView;
      try {
        view = await callBxapi(() =>
          this.ctx.bxapi.get<PlayerView>(`/v1/sessions/${encodeURIComponent(session.id)}/view`),
        );
      } catch (error) {
        await this.game.discardSession(session.id);
        throw error;
      }
      copySeats(this.ctx.db, tableId, str(save, 'session_id'), session.id, view);
      const lastRecord = previous?.record ??
        this.lastRecordFor(tableId) ?? {
          adventure_id: null,
          adventure_name: session.adventure_name,
          dungeon_names: {},
        };
      const live = await this.game.moveToRestoredLocked(tableId, session, saveId, {
        adventure_id: lastRecord.adventure_id,
        adventure_name: session.adventure_name,
        dungeon_names: lastRecord.dungeon_names,
      });
      this.ctx.feed.system(tableId, user.id, 'save_restored', {
        save_id: saveId,
        label: strOrNull(save, 'label'),
        session_id: session.id,
      });
      this.ctx.log.info({ table: tableId, save: saveId, session: session.id }, 'save restored');
      return this.game.project(live, 'referee');
    });
  }

  /** The adventure facts the table last recorded, from any session, for a restore from the lobby. */
  private lastRecordFor(
    tableId: string,
  ): { adventure_id: string | null; adventure_name: string; dungeon_names: Record<string, string> } | null {
    const row = this.ctx.db.get(
      'SELECT game_json FROM tables WHERE id = ? AND game_json IS NOT NULL',
      tableId,
    );
    return row === undefined ? null : json(row, 'game_json');
  }
}

/**
 * Registers the save routes under `/api/tables/{table_id}/saves`.
 *
 * @param app - The Fastify instance.
 * @param ctx - The server's services.
 */
export function registerSaveRoutes(app: FastifyInstance, ctx: Context): void {
  const saves = ctx.game.saves;

  app.get('/api/tables/:tableId/saves', async (request) => {
    const { tableId } = TableParams.parse(request.params);
    ctx.tables.requireMember(tableId, ctx.auth.user(request));
    return { items: saves.list(tableId) };
  });

  app.post('/api/tables/:tableId/saves', async (request, reply) => {
    const { tableId } = TableParams.parse(request.params);
    const user = ctx.auth.user(request);
    ctx.tables.requireMember(tableId, user);
    const body = parseBody(CreateSaveRequest, request);
    const entry = await ctx.game.locked(tableId, async () =>
      saves.createLocked(await ctx.game.require(tableId), user.id, body.label ?? null, false),
    );
    return reply.status(201).send(entry);
  });

  app.patch('/api/tables/:tableId/saves/:saveId', async (request) => {
    const { tableId, saveId } = SaveParams.parse(request.params);
    const user = ctx.auth.user(request);
    saves.checkOwner(tableId, saveId, user);
    const body = parseBody(RenameSaveRequest, request);
    await callBxapi(() =>
      ctx.bxapi.request<SaveInfo>('PATCH', `/v1/saves/${encodeURIComponent(saveId)}`, {
        body: { label: body.label },
      }),
    );
    ctx.db.run('UPDATE saves SET label = ? WHERE id = ?', body.label, saveId);
    return toEntry(saves.row(tableId, saveId));
  });

  app.delete('/api/tables/:tableId/saves/:saveId', async (request, reply) => {
    const { tableId, saveId } = SaveParams.parse(request.params);
    const user = ctx.auth.user(request);
    saves.checkOwner(tableId, saveId, user);
    try {
      await ctx.bxapi.request('DELETE', `/v1/saves/${encodeURIComponent(saveId)}`);
    } catch (error) {
      if (!(error instanceof BxapiProblem && error.code === 'not_found'))
        await callBxapi(() => Promise.reject(error));
    }
    ctx.db.run('DELETE FROM saves WHERE id = ?', saveId);
    return reply.status(204).send();
  });

  app.post('/api/tables/:tableId/saves/:saveId/restore', async (request, reply) => {
    const { tableId, saveId } = SaveParams.parse(request.params);
    const user = ctx.auth.user(request);
    ctx.tables.requireReferee(tableId, user);
    return reply.status(201).send(await saves.restore(tableId, user, saveId));
  });

  app.get('/api/tables/:tableId/saves/:saveId/document', async (request, reply) => {
    const { tableId, saveId } = SaveParams.parse(request.params);
    ctx.tables.requireReferee(tableId, ctx.auth.user(request));
    saves.row(tableId, saveId);
    const document = await callBxapi(() => ctx.bxapi.get(`/v1/saves/${encodeURIComponent(saveId)}/document`));
    return reply
      .header('Content-Disposition', `attachment; filename="${saveId}.json"`)
      .header('Cache-Control', 'private, no-store')
      .send(document);
  });
}
