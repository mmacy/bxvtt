import { BxapiProblem } from './bxapi';
import type { Context } from './context';
import { str } from './db';
import { now } from './ids';

/** A kind of bxapi resource the server may have to delete later. */
export type BxapiResourceKind = 'session' | 'save' | 'adventure' | 'character';

/** The bxapi path of each kind of resource. */
const PATHS: Record<BxapiResourceKind, string> = {
  session: '/v1/sessions/',
  save: '/v1/saves/',
  adventure: '/v1/adventures/',
  character: '/v1/characters/',
};

/**
 * Deletes what bxvtt no longer needs in bxapi, so bxapi's per-client storage doesn't fill with it:
 *
 * - Sessions that no table plays any more: the session a restore replaced, and the session of a game a referee
 *   ended. A bxapi save is a document of its own, and deleting its session leaves it, so every save still
 *   restores.
 * - Resources whose deletion failed while bxapi was down, such as the saves, sessions, and uploads of a deleted
 *   table. The server remembers each one and tries again.
 *
 * It never deletes what a table, a save, or a user can still reach: a table's current session, a save in the
 * table's list, an uploaded adventure of a table that still exists, or a character its owner keeps.
 */
export class BxapiJanitor {
  /**
   * @param ctx - The server's services.
   */
  constructor(private readonly ctx: Context) {}

  /**
   * Deletes a resource in bxapi, or remembers it to try again later. A resource bxapi no longer has counts as
   * deleted.
   *
   * @param kind - The kind of resource.
   * @param id - Its ID.
   * @returns Whether it's gone.
   */
  async remove(kind: BxapiResourceKind, id: string): Promise<boolean> {
    try {
      await this.ctx.bxapi.request('DELETE', `${PATHS[kind]}${encodeURIComponent(id)}`);
      return true;
    } catch (error) {
      if (error instanceof BxapiProblem && error.code === 'not_found') return true;
      this.ctx.log.warn({ err: error, kind, id }, 'could not delete a bxapi resource; will try again');
      this.ctx.db.run(
        'INSERT OR IGNORE INTO bxapi_garbage (kind, id, added_at) VALUES (?, ?, ?)',
        kind,
        id,
        now(),
      );
      return false;
    }
  }

  /**
   * Deletes the sessions of a table that its game no longer plays. The caller holds the table's lock.
   *
   * @param tableId - The table ID.
   */
  async retireSessionsLocked(tableId: string): Promise<void> {
    const current = this.ctx.tables.game(tableId)?.sessionId ?? null;
    for (const row of this.ctx.db.all('SELECT session_id FROM table_sessions WHERE table_id = ?', tableId)) {
      const sessionId = str(row, 'session_id');
      if (sessionId === current) continue;
      if (await this.remove('session', sessionId)) {
        this.ctx.db.run(
          'DELETE FROM table_sessions WHERE table_id = ? AND session_id = ?',
          tableId,
          sessionId,
        );
        this.ctx.db.run('DELETE FROM bxapi_garbage WHERE kind = ? AND id = ?', 'session', sessionId);
      }
    }
  }

  /**
   * Cleans up everything it can: the sessions every table no longer plays, and the deletions that failed before.
   * The server runs it at startup and every hour.
   *
   * @returns How many resources it deleted.
   */
  async sweep(): Promise<number> {
    let deleted = 0;
    const stale = this.ctx.db.all(
      `SELECT DISTINCT ts.table_id FROM table_sessions ts JOIN tables t ON t.id = ts.table_id
       WHERE t.session_id IS NULL OR t.session_id <> ts.session_id`,
    );
    for (const row of stale) {
      const tableId = str(row, 'table_id');
      const before = this.countSessions(tableId);
      await this.ctx.game.locked(tableId, () => this.retireSessionsLocked(tableId));
      deleted += before - this.countSessions(tableId);
    }
    for (const row of this.ctx.db.all('SELECT kind, id FROM bxapi_garbage')) {
      const kind = str(row, 'kind') as BxapiResourceKind;
      const id = str(row, 'id');
      if (this.stillReachable(kind, id)) {
        this.ctx.db.run('DELETE FROM bxapi_garbage WHERE kind = ? AND id = ?', kind, id);
        continue;
      }
      this.ctx.db.run('DELETE FROM bxapi_garbage WHERE kind = ? AND id = ?', kind, id);
      if (await this.remove(kind, id)) deleted += 1;
    }
    return deleted;
  }

  private countSessions(tableId: string): number {
    return this.ctx.db.all('SELECT session_id FROM table_sessions WHERE table_id = ?', tableId).length;
  }

  /** Whether something in bxvtt still refers to a resource, so it must stay. */
  private stillReachable(kind: BxapiResourceKind, id: string): boolean {
    switch (kind) {
      case 'session':
        return this.ctx.db.get('SELECT 1 FROM tables WHERE session_id = ?', id) !== undefined;
      case 'save':
        return this.ctx.db.get('SELECT 1 FROM saves WHERE id = ?', id) !== undefined;
      case 'adventure':
        return (
          this.ctx.db.get('SELECT 1 FROM adventures WHERE id = ?', id) !== undefined ||
          this.ctx.db.get('SELECT 1 FROM samples WHERE adventure_id = ?', id) !== undefined
        );
      case 'character':
        return this.ctx.db.get('SELECT 1 FROM characters WHERE id = ?', id) !== undefined;
    }
  }
}
