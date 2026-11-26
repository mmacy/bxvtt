import { createHash, randomUUID } from 'node:crypto';
import type { CommandOutcome, RefereeView, SessionCommands, SessionInfo } from '@bxvtt/shared/bxapi';
import type {
  Command,
  CommandRequest,
  CommandResult,
  EntryNames,
  GameEvent,
  GameState,
  LegalCommand,
  PlayerView,
  RefereeState,
  Rejection,
  Role,
  StartGameRequest,
  User,
} from '@bxvtt/shared/protocol';
import { REFEREE_VIEW_OMITTED_FIELDS } from '@bxvtt/shared/protocol';
import { BxapiProblem, BxapiUnreachable, callBxapi, toApiError } from '../bxapi';
import type { Context } from '../context';
import { str } from '../db';
import { ApiError } from '../errors';
import { checkHealth } from '../health';
import { now } from '../ids';
import type { GameRecord } from '../tables';
import { KeyedMutex, sleep } from '../util';
import { BattleService } from './battle';
import type { CommandInfo } from './classify';
import { CommandClassifier } from './classify';
import { SaveService } from './saves';
import { readSeats, reconcileSeats, seatsFromRoster, writeSeats } from './seats';
import type { LabelBook } from './labels';
import { dungeonNames, entryNames, itemNames, learnLabels, newLabelBook } from './labels';

/** What the server holds in memory about a table's game, at one revision. */
export interface LiveGame {
  tableId: string;
  sessionId: string;
  revision: number;
  mode: string;
  ended: boolean;
  view: PlayerView;
  /** The legal commands for a referee, which include the play commands. */
  legal: SessionCommands['commands'];
  /** The dynamic referee state at `refereeRevision`, or `null` before the server read it. */
  referee: RefereeState | null;
  refereeRevision: number;
  /** What the players of the session have called each member, group, and monster, for feed entries. */
  labels: LabelBook;
}

/** Who sent an accepted command, for the feed. */
export interface CommandMeta {
  userId: string | null;
  commandType: string;
  class: CommandInfo['class'];
  /** The party member who acted, when the command names one. */
  actorId?: string | null;
}

/** The most attempts the server makes at one command when bxapi is busy or the connection drops. */
const MAX_ATTEMPTS = 4;

/**
 * Strips the static and growing parts from a referee view.
 *
 * @param view - bxapi's referee view.
 * @returns The dynamic referee state.
 */
export function refereeState(view: RefereeView): RefereeState {
  const copy: Partial<RefereeView> = { ...view };
  for (const field of REFEREE_VIEW_OMITTED_FIELDS) delete copy[field];
  return copy as RefereeState;
}

/**
 * Splits a command outcome's events and messages into the player projection.
 *
 * @param events - Every event, in order.
 * @param messages - One message per event, in the same order.
 */
export function playerEvents(
  events: GameEvent[],
  messages: string[],
): { events: GameEvent[]; messages: string[] } {
  const keep: GameEvent[] = [];
  const lines: string[] = [];
  events.forEach((event, index) => {
    if (event.visibility === 'player') {
      keep.push(event);
      lines.push(messages[index] ?? '');
    }
  });
  return { events: keep, messages: lines };
}

/** The commands that name a treasure cache in `feature_id`. */
const TREASURE_COMMANDS: ReadonlySet<string> = new Set([
  'take_treasure',
  'inspect_treasure',
  'remove_treasure_trap',
]);

/**
 * Refuses a player's treasure command whose `feature_id` is neither `pile` nor a `feature:` handle from the player
 * view. osrlib resolves a handle only against the features where the party stands, and refuses a hidden or emptied
 * cache by handle or by raw ID. A player has no use for a raw ID, so the server answers it with osrlib's own
 * rejection for an unknown feature and doesn't send it to bxapi.
 *
 * @param command - The command.
 * @returns The rejection, or `null` to send the command to bxapi.
 */
function rawFeatureId(command: Command): Rejection | null {
  if (!TREASURE_COMMANDS.has(command.command_type)) return null;
  const featureId = command.feature_id;
  if (typeof featureId !== 'string' || featureId === 'pile' || featureId.startsWith('feature:')) return null;
  return { code: 'exploration.feature.unknown', params: { feature: featureId } };
}

/**
 * Runs the table's games: the bxapi session behind each table, the command pipeline, the projections each role
 * receives, seats, and the battle and save services.
 */
export class GameService {
  private readonly live = new Map<string, LiveGame>();
  private readonly mutex = new KeyedMutex();
  private readonly adventureCache = new Map<string, { etag: string; body: string }>();
  /** The command classifier. */
  readonly classifier: CommandClassifier;
  /** The battle declarations. */
  readonly battle: BattleService;
  /** The saves. */
  readonly saves: SaveService;

  /**
   * @param ctx - The server's services.
   */
  constructor(private readonly ctx: Context) {
    this.classifier = new CommandClassifier(ctx.rules);
    this.battle = new BattleService(ctx, this);
    this.saves = new SaveService(ctx, this);
  }

  /**
   * Runs work on a table while no other game work on the table runs.
   *
   * @param tableId - The table ID.
   * @param fn - The work.
   */
  locked<T>(tableId: string, fn: () => Promise<T>): Promise<T> {
    return this.mutex.run(tableId, fn);
  }

  /**
   * Returns the table's game, reading it from bxapi when the server hasn't yet.
   *
   * @param tableId - The table ID.
   * @returns The game, or `null` in the lobby.
   */
  async current(tableId: string): Promise<LiveGame | null> {
    const game = this.ctx.tables.game(tableId);
    if (game === null) {
      this.live.delete(tableId);
      return null;
    }
    await this.requireEngine();
    const cached = this.live.get(tableId);
    if (cached !== undefined && cached.sessionId === game.sessionId) return cached;
    return this.load(tableId, game.sessionId);
  }

  /**
   * Refuses game work while bxapi's engine is older than `MIN_ENGINE_VERSION`, as the server refuses it while
   * bxapi is unreachable: with `bxapi_unavailable`, so no command, declaration, or game state goes through. The
   * server reads the version at startup and whenever it checks its health. Until a check succeeds, this asks
   * bxapi once, so a command doesn't cost a call of its own after that.
   *
   * @throws ApiError `bxapi_unavailable` when the engine is too old.
   */
  async requireEngine(): Promise<void> {
    if (!this.ctx.engine.checked) await checkHealth(this.ctx);
    if (this.ctx.engine.tooOld) {
      throw new ApiError(
        'bxapi_unavailable',
        "The game service is out of date, so games can't run. Ask the server host to update it.",
      );
    }
  }

  /**
   * Returns the table's game.
   *
   * @param tableId - The table ID.
   * @throws ApiError `no_game` in the lobby.
   */
  async require(tableId: string): Promise<LiveGame> {
    const live = await this.current(tableId);
    if (live === null) throw new ApiError('no_game', 'No game is in progress at this table.');
    return live;
  }

  /**
   * Reads a session from bxapi into memory.
   *
   * @param tableId - The table ID.
   * @param sessionId - The session ID.
   */
  async load(tableId: string, sessionId: string): Promise<LiveGame> {
    const path = `/v1/sessions/${encodeURIComponent(sessionId)}`;
    const [info, view, commands, refereeView] = await callBxapi(() =>
      Promise.all([
        this.ctx.bxapi.get<SessionInfo>(path),
        this.ctx.bxapi.get<PlayerView>(`${path}/view`),
        this.ctx.bxapi.get<SessionCommands>(`${path}/commands`),
        this.ctx.bxapi.get<RefereeView>(`${path}/referee-view`),
      ]),
    );
    const previous = this.live.get(tableId);
    const labels = previous?.sessionId === sessionId ? previous.labels : newLabelBook();
    const live: LiveGame = {
      tableId,
      sessionId,
      revision: Math.max(info.revision, commands.revision),
      mode: view.mode,
      ended: info.ended,
      view,
      legal: commands.commands,
      referee: null,
      refereeRevision: -1,
      labels,
    };
    if (info.revision === commands.revision) {
      live.referee = refereeState(refereeView);
      live.refereeRevision = live.revision;
    }
    learnLabels(live.labels, live.view);
    this.live.set(tableId, live);
    reconcileSeats(this.ctx.db, tableId, sessionId, view);
    return live;
  }

  /**
   * Reads the dynamic referee state at the game's revision, from bxapi when the cached copy is older.
   *
   * @param live - The game.
   */
  async refereeFor(live: LiveGame): Promise<RefereeState> {
    if (live.referee !== null && live.refereeRevision === live.revision) return live.referee;
    const revision = live.revision;
    const view = await callBxapi(() =>
      this.ctx.bxapi.get<RefereeView>(`/v1/sessions/${encodeURIComponent(live.sessionId)}/referee-view`),
    );
    if (live.revision === revision) {
      live.referee = refereeState(view);
      live.refereeRevision = revision;
    }
    return refereeState(view);
  }

  /**
   * Builds the game state for one role.
   *
   * @param live - The game.
   * @param role - The reader's role. A referee's copy includes the dynamic referee state.
   */
  async project(live: LiveGame, role: Role): Promise<GameState> {
    const catalog = await this.classifier.all();
    const commands: LegalCommand[] = [];
    for (const choice of live.legal) {
      if (role !== 'referee' && choice.kind !== 'play') continue;
      const info = catalog.get(choice.command_type);
      commands.push({
        command_type: choice.command_type,
        kind: choice.kind,
        class: info?.class ?? (choice.kind === 'referee' ? 'referee' : 'party'),
        member_field: info?.memberField ?? null,
      });
    }
    const game = this.ctx.tables.game(live.tableId);
    return {
      table_id: live.tableId,
      session_id: live.sessionId,
      adventure_id: game?.record.adventure_id ?? null,
      adventure_name: game?.record.adventure_name ?? live.view.adventure_name,
      mode: live.mode,
      ended: live.ended,
      revision: live.revision,
      view: live.view,
      commands,
      seats: readSeats(this.ctx.db, live.tableId, live.sessionId),
      caller_user_id: this.ctx.tables.settings(live.tableId).caller_user_id,
      referee: role === 'referee' ? await this.refereeFor(live) : null,
    };
  }

  /**
   * Builds the game state for one reader, or `null` in the lobby.
   *
   * @param tableId - The table ID.
   * @param role - The reader's role.
   */
  async stateFor(tableId: string, role: Role): Promise<GameState | null> {
    const live = await this.current(tableId);
    return live === null ? null : this.project(live, role);
  }

  /**
   * Sends the game state to every connection of the table, each with its role's projection. The caller holds the
   * table's lock, so the messages go out in the order of the changes.
   *
   * @param tableId - The table ID.
   */
  async pushStateLocked(tableId: string): Promise<void> {
    const live = await this.current(tableId);
    if (live === null) {
      this.ctx.hub.broadcast(tableId, { type: 'game', game: null });
      return;
    }
    const player = await this.project({ ...live, referee: null, refereeRevision: -1 }, 'player');
    let referee: GameState | null = null;
    if (this.ctx.hub.hasReferee(tableId)) {
      try {
        referee = await this.project(live, 'referee');
      } catch (error) {
        this.ctx.log.warn({ err: error, table: tableId }, 'could not read the referee view');
      }
    }
    this.ctx.hub.send(tableId, ({ role }) => {
      if (role === 'referee') return referee === null ? null : { type: 'game', game: referee };
      return { type: 'game', game: player };
    });
  }

  /**
   * Sends the game state to every connection of the table, after the work already queued for the table.
   *
   * @param tableId - The table ID.
   */
  broadcastState(tableId: string): void {
    void this.locked(tableId, async () => {
      await this.pushStateLocked(tableId);
      await this.battle.pushLocked(tableId);
    }).catch((error: unknown) =>
      this.ctx.log.warn({ err: error, table: tableId }, 'could not send the game state'),
    );
  }

  /**
   * Makes a user's connections reconnect, so they receive a snapshot for their new role.
   *
   * @param tableId - The table ID.
   * @param userId - The user ID.
   */
  resyncUser(tableId: string, userId: string): void {
    this.ctx.hub.reconnectUser(tableId, userId);
  }

  /**
   * Starts a game from the roster.
   *
   * @param tableId - The table ID.
   * @param user - The referee.
   * @param request - The adventure and options.
   */
  async start(tableId: string, user: User, request: StartGameRequest): Promise<GameState> {
    return this.locked(tableId, async () => {
      this.ctx.tables.requireLobby(tableId);
      await this.requireEngine();
      const roster = this.ctx.tables.roster(tableId);
      if (roster.length === 0)
        throw new ApiError('roster_empty', 'Add at least one character to the party roster before starting.');
      let adventure = await this.ctx.adventures.resolve(tableId, request.adventure_id);
      const body = (bxapiId: string) => ({
        adventure_id: bxapiId,
        character_ids: roster.map((entry) => entry.character_id),
        ...(request.name === undefined ? {} : { name: request.name }),
        ...(request.ruleset === undefined ? {} : { ruleset: request.ruleset }),
        ...(request.seed === undefined ? {} : { seed: request.seed }),
      });
      let session: SessionInfo;
      try {
        session = await this.ctx.bxapi.post<SessionInfo>('/v1/sessions', body(adventure.bxapiId));
      } catch (error) {
        const lostSample =
          request.adventure_id.startsWith('sample:') &&
          error instanceof BxapiProblem &&
          error.code === 'not_found' &&
          error.body.resource === 'adventure';
        if (!lostSample) throw toApiError(error, { passNotFound: true });
        adventure = await this.ctx.adventures.resolve(tableId, request.adventure_id, true);
        session = await callBxapi(
          () => this.ctx.bxapi.post<SessionInfo>('/v1/sessions', body(adventure.bxapiId)),
          {
            passNotFound: true,
          },
        );
      }
      let view: PlayerView;
      try {
        view = await callBxapi(() =>
          this.ctx.bxapi.get<PlayerView>(`/v1/sessions/${encodeURIComponent(session.id)}/view`),
        );
      } catch (error) {
        // The table never recorded the session, so nothing else would delete it.
        await this.discardSession(session.id);
        throw error;
      }
      const { seats, matchedByOrder } = seatsFromRoster(roster, view);
      if (!matchedByOrder) {
        this.ctx.log.warn(
          { table: tableId, session: session.id },
          'party order differs from the roster; seats matched by name',
        );
      }
      writeSeats(this.ctx.db, tableId, session.id, seats);
      const record: GameRecord = {
        adventure_id: request.adventure_id,
        adventure_name: session.adventure_name,
        started_at: now(),
        mode: session.mode,
        ended: session.ended,
        dungeon_names: Object.fromEntries(
          adventure.info.dungeons.map((dungeon) => [dungeon.id, dungeon.name]),
        ),
      };
      this.ctx.db.transaction(() => {
        this.ctx.tables.setGame(tableId, { sessionId: session.id, record });
        this.ctx.db.run(
          'INSERT INTO table_sessions (table_id, session_id, restored_from, created_at) VALUES (?, ?, NULL, ?)',
          tableId,
          session.id,
          now(),
        );
        const settings = this.ctx.tables.settings(tableId);
        const firstOwner = seats.find((seat) => seat.user_id !== null)?.user_id ?? null;
        if (settings.caller_user_id === null && firstOwner !== null) {
          this.ctx.db.run('UPDATE tables SET caller_user_id = ? WHERE id = ?', firstOwner, tableId);
        }
      });
      const live = await this.load(tableId, session.id);
      this.ctx.log.info({ table: tableId, session: session.id }, 'game started');
      this.ctx.feed.system(tableId, user.id, 'game_started', {
        session_id: session.id,
        adventure_name: session.adventure_name,
      });
      this.ctx.hub.broadcast(tableId, {
        type: 'notice',
        code: 'game_started',
        detail: `${session.adventure_name} has begun.`,
      });
      this.ctx.tables.broadcastTable(tableId);
      await this.pushStateLocked(tableId);
      await this.battle.pushLocked(tableId);
      return this.project(live, 'referee');
    });
  }

  /**
   * Ends the game and returns the table to its lobby. The saves stay in bxapi, so a referee can restore one later.
   * The session goes, because nothing can play it again and bxapi stores a full copy of it.
   *
   * @param tableId - The table ID.
   * @param user - The referee.
   */
  async end(tableId: string, user: User): Promise<void> {
    await this.locked(tableId, async () => {
      const game = this.ctx.tables.game(tableId);
      if (game === null) throw new ApiError('no_game', 'No game is in progress at this table.');
      this.ctx.tables.setGame(tableId, null);
      this.live.delete(tableId);
      this.ctx.db.run('DELETE FROM declarations WHERE table_id = ?', tableId);
      // Nothing plays the ended session any more. Its saves stay, so a referee can still restore them.
      await this.ctx.janitor.retireSessionsLocked(tableId);
      this.ctx.feed.system(tableId, user.id, 'game_ended', { session_id: game.sessionId });
      this.ctx.hub.broadcast(tableId, {
        type: 'notice',
        code: 'game_ended',
        detail: 'The game has ended, and the table is back in the lobby.',
      });
      this.ctx.tables.broadcastTable(tableId);
      await this.pushStateLocked(tableId);
      this.ctx.hub.broadcast(tableId, { type: 'declarations', declarations: null });
    });
  }

  /**
   * Moves the table to a session that a save restored, and tells everyone.
   *
   * @param tableId - The table ID.
   * @param session - The new session.
   * @param restoredFrom - The save ID.
   * @param record - The adventure facts to record for the new session.
   */
  async moveToRestoredLocked(
    tableId: string,
    session: SessionInfo,
    restoredFrom: string,
    record: Omit<GameRecord, 'mode' | 'ended' | 'started_at'>,
  ): Promise<LiveGame> {
    this.ctx.db.transaction(() => {
      this.ctx.tables.setGame(tableId, {
        sessionId: session.id,
        record: { ...record, mode: session.mode, ended: session.ended, started_at: now() },
      });
      this.ctx.db.run(
        'INSERT INTO table_sessions (table_id, session_id, restored_from, created_at) VALUES (?, ?, ?, ?)',
        tableId,
        session.id,
        restoredFrom,
        now(),
      );
      this.ctx.db.run('DELETE FROM declarations WHERE table_id = ?', tableId);
    });
    const live = await this.load(tableId, session.id);
    // The session the restore replaced is unreachable now. Its saves are documents of their own, so they stay.
    await this.ctx.janitor.retireSessionsLocked(tableId);
    this.ctx.hub.broadcast(tableId, {
      type: 'notice',
      code: 'game_restored',
      detail: 'The referee restored a saved game.',
    });
    this.ctx.tables.broadcastTable(tableId);
    await this.pushStateLocked(tableId);
    await this.battle.pushLocked(tableId);
    return live;
  }

  /**
   * Sends a member's command through the permission check and the pipeline.
   *
   * @param tableId - The table ID.
   * @param user - The sender.
   * @param role - The sender's role.
   * @param request - The command and the expected revision.
   * @param requestId - The request ID, for bxapi's log.
   */
  async command(
    tableId: string,
    user: User,
    role: Role,
    request: CommandRequest,
    requestId: string,
  ): Promise<CommandResult> {
    const command = request.command;
    const info = await callBxapi(() => this.classifier.classify(command.command_type));
    if (info === null) {
      throw new ApiError('unknown_command', 'Unknown action.', {
        command_type: command.command_type,
      });
    }
    if (info.class === 'battle') {
      throw new ApiError(
        'use_declarations',
        'Submit declarations for each party member to resolve a battle round.',
      );
    }
    if (role !== 'referee' && 'source' in command) {
      throw new ApiError('referee_required', "Only a referee can set a command's source.");
    }
    return this.locked(tableId, async () => {
      const live = await this.require(tableId);
      if (request.expected_revision !== undefined && request.expected_revision !== live.revision) {
        this.notifyConflict(tableId, user.id);
        throw new ApiError(
          'revision_conflict',
          'The table updated before your action went through. Check the current state and try again.',
          {
            revision: live.revision,
          },
        );
      }
      this.checkPermission(live, user, role, info, command);
      const unseen = role === 'referee' ? null : rawFeatureId(command);
      if (unseen !== null) {
        return {
          accepted: false,
          rejections: [unseen],
          events: [],
          messages: [],
          mode: live.mode,
          ended: live.ended,
          revision: live.revision,
          game: await this.project(live, role),
        };
      }
      const outcome = await this.executeLocked(live, command, requestId, user.id);
      if (outcome.accepted) {
        const actor = command[info.memberField ?? 'character_id'];
        await this.afterAcceptedLocked(live, outcome, {
          userId: user.id,
          commandType: command.command_type,
          class: info.class,
          actorId: typeof actor === 'string' ? actor : null,
        });
      } else if (outcome.view !== undefined) {
        live.view = outcome.view;
      }
      const projected =
        role === 'referee'
          ? { events: outcome.events, messages: outcome.messages }
          : playerEvents(outcome.events, outcome.messages);
      return {
        accepted: outcome.accepted,
        // osrlib refuses a target that the player view doesn't list as it refuses an ID that doesn't exist, and
        // a rejection names only what the command named, so a player's copy is bxapi's.
        rejections: outcome.rejections,
        events: projected.events,
        messages: projected.messages,
        mode: outcome.mode,
        ended: outcome.ended,
        revision: outcome.revision,
        game: await this.project(live, role),
      };
    });
  }

  /**
   * Checks that a user may send a command.
   *
   * @param live - The game.
   * @param user - The sender.
   * @param role - The sender's role.
   * @param info - The command's class.
   * @param command - The command.
   * @throws ApiError when the user may not send it.
   */
  checkPermission(live: LiveGame, user: User, role: Role, info: CommandInfo, command: Command): void {
    if (role === 'referee') return;
    if (info.class === 'referee') {
      throw new ApiError('referee_command', 'Only a referee can use that action.', {
        command_type: command.command_type,
      });
    }
    const seats = readSeats(this.ctx.db, live.tableId, live.sessionId);
    if (info.class === 'member' && info.memberField !== null) {
      const memberId = command[info.memberField];
      if (typeof memberId !== 'string') {
        throw new ApiError('validation_error', 'Choose which party member performs this action.', {
          errors: [{ path: ['command', info.memberField], message: 'Required.' }],
        });
      }
      const seat = seats.find((candidate) => candidate.member_id === memberId);
      if (seat === undefined || seat.user_id !== user.id) {
        const name = seat?.name ?? memberId;
        throw new ApiError(
          'forbidden',
          `Only the player in ${name}'s seat or a referee can act for ${name}.`,
        );
      }
      return;
    }
    this.checkPartyControl(live, user, role);
  }

  /**
   * Checks that a user may act for the whole party: a referee, the caller, or any seated member when the table's
   * `party_control` is `anyone`.
   *
   * @param live - The game.
   * @param user - The user.
   * @param role - The user's role.
   */
  checkPartyControl(live: LiveGame, user: User, role: Role): void {
    if (role === 'referee') return;
    const settings = this.ctx.tables.settings(live.tableId);
    if (settings.caller_user_id === user.id) return;
    if (settings.party_control === 'anyone') {
      const seated = readSeats(this.ctx.db, live.tableId, live.sessionId).some(
        (seat) => seat.user_id === user.id,
      );
      if (seated) return;
      throw new ApiError(
        'forbidden',
        'Only a seated player, the caller, or a referee can act for the party.',
      );
    }
    throw new ApiError('forbidden', 'Only the caller or a referee can act for the party.');
  }

  /**
   * Sends a command to bxapi, retrying what is safe to retry. The caller holds the table's lock.
   *
   * The request carries `expected_revision`, so a stale command never applies, and an `Idempotency-Key`, so a
   * retry after a dropped connection gets the first response instead of running twice. A busy session is retried
   * while its revision is unchanged. A revision conflict reloads the game, sends everyone the new state, and
   * fails with `revision_conflict`.
   *
   * @param live - The game.
   * @param command - The command.
   * @param requestId - The request ID, for bxapi's log.
   * @param userId - The sender, who hears about a conflict.
   */
  async executeLocked(
    live: LiveGame,
    command: Command,
    requestId: string,
    userId: string | null,
  ): Promise<CommandOutcome> {
    const rawBody = JSON.stringify(command);
    let key = randomUUID();
    const expected = live.revision;
    const path = `/v1/sessions/${encodeURIComponent(live.sessionId)}/commands`;
    for (let attempt = 1; ; attempt += 1) {
      const last = attempt >= MAX_ATTEMPTS;
      try {
        return await this.ctx.bxapi.request<CommandOutcome>('POST', path, {
          rawBody,
          query: { include: 'view', visibility: 'referee', expected_revision: expected },
          idempotencyKey: key,
          requestId,
        });
      } catch (error) {
        if (error instanceof BxapiUnreachable) {
          if (!error.maybeApplied || last) throw toApiError(error);
          await sleep(200 * attempt);
          continue;
        }
        if (!(error instanceof BxapiProblem)) throw error;
        switch (error.code) {
          case 'revision_conflict':
            await this.conflictLocked(live, userId);
            throw new ApiError(
              'revision_conflict',
              'The table updated before your action went through. Check the current state and try again.',
              {
                revision: live.revision,
              },
            );
          case 'session_busy': {
            const info = await callBxapi(() =>
              this.ctx.bxapi.get<SessionInfo>(`/v1/sessions/${encodeURIComponent(live.sessionId)}`),
            );
            if (info.revision !== expected) {
              await this.conflictLocked(live, userId);
              throw new ApiError(
                'revision_conflict',
                'The table updated before your action went through. Check the current state and try again.',
                {
                  revision: live.revision,
                },
              );
            }
            if (last)
              throw new ApiError(
                'session_busy',
                'This table is busy processing another action. Try again in a moment.',
              );
            await sleep(250 * attempt);
            continue;
          }
          case 'idempotency_key_in_progress':
          case 'rate_limited':
          case 'database_busy':
          case 'request_timeout':
            if (last)
              throw new ApiError(
                'session_busy',
                'This table is busy processing another action. Try again in a moment.',
              );
            await sleep(Math.min(2000, (error.retryAfter ?? 0.25 * attempt) * 1000));
            continue;
          case 'idempotency_key_interrupted': {
            const before = live.revision;
            await this.conflictLocked(live, userId);
            if (live.revision !== before || last) {
              throw new ApiError(
                'session_busy',
                'That action was interrupted before it finished. The table has refreshed with the latest state.',
                {
                  revision: live.revision,
                },
              );
            }
            key = randomUUID();
            continue;
          }
          default:
            throw toApiError(error);
        }
      }
    }
  }

  /**
   * Reloads the game after it changed behind the server's back, and sends everyone the new state.
   *
   * @param live - The game, which this updates in place.
   * @param userId - The user whose command lost the race.
   */
  private async conflictLocked(live: LiveGame, userId: string | null): Promise<void> {
    const fresh = await this.load(live.tableId, live.sessionId);
    Object.assign(live, fresh);
    this.live.set(live.tableId, live);
    await this.pushStateLocked(live.tableId);
    await this.battle.pushLocked(live.tableId);
    if (userId !== null) this.notifyConflict(live.tableId, userId);
  }

  private notifyConflict(tableId: string, userId: string): void {
    this.ctx.hub.send(
      tableId,
      () => ({
        type: 'notice',
        code: 'table_changed',
        detail: "Someone acted first, so your action wasn't applied.",
      }),
      userId,
    );
  }

  /**
   * Applies an accepted command: updates the cached game, the seats, the table summary, the feed, the battle
   * declarations, and the autosaves, and sends everyone the new state. The caller holds the table's lock.
   *
   * @param live - The game, which this updates in place.
   * @param outcome - bxapi's outcome, with the player view.
   * @param meta - Who sent the command and its class.
   */
  async afterAcceptedLocked(live: LiveGame, outcome: CommandOutcome, meta: CommandMeta): Promise<void> {
    const previous = live.view;
    live.revision = outcome.revision;
    live.mode = outcome.mode;
    live.ended = outcome.ended;
    if (outcome.view !== undefined) live.view = outcome.view;
    live.referee = null;
    learnLabels(live.labels, live.view);
    const forPlayers = playerEvents(outcome.events, outcome.messages);
    try {
      const commands = await this.ctx.bxapi.get<SessionCommands>(
        `/v1/sessions/${encodeURIComponent(live.sessionId)}/commands`,
      );
      if (commands.revision === live.revision) live.legal = commands.commands;
    } catch (error) {
      this.ctx.log.warn({ err: error, table: live.tableId }, 'could not read the legal commands');
    }
    reconcileSeats(this.ctx.db, live.tableId, live.sessionId, live.view);
    const game = this.ctx.tables.game(live.tableId);
    if (game !== null && (game.record.mode !== live.mode || game.record.ended !== live.ended)) {
      this.ctx.tables.setGame(live.tableId, {
        sessionId: game.sessionId,
        record: { ...game.record, mode: live.mode, ended: live.ended },
      });
      this.ctx.tables.broadcastTable(live.tableId);
    }
    const hidden = meta.class === 'referee' && forPlayers.events.length === 0;
    const xpGained: Record<string, number> = {};
    for (const member of live.view.party) {
      const before = previous.party.find((candidate) => candidate.id === member.id);
      if (before !== undefined && member.xp !== before.xp) xpGained[member.id] = member.xp - before.xp;
    }
    this.ctx.feed.append(live.tableId, {
      userId: meta.userId,
      visibility: hidden ? 'referees' : 'everyone',
      body: {
        kind: 'game',
        command_type: meta.class === 'referee' ? null : meta.commandType,
        revision: live.revision,
        session_id: live.sessionId,
        events: forPlayers.events,
        messages: forPlayers.messages,
        clock_rounds: live.view.clock_rounds,
        names: entryNames(
          forPlayers.events,
          live.labels,
          itemNames([previous, live.view], forPlayers.events),
          {
            view: live.view,
            dungeons: dungeonNames(live.view),
            actorId: meta.class === 'referee' ? null : meta.actorId,
          },
        ),
        actor_id: meta.class === 'referee' ? null : (meta.actorId ?? null),
        xp_gained: xpGained,
      },
      referee: {
        kind: 'game',
        command_type: meta.commandType,
        revision: live.revision,
        session_id: live.sessionId,
        events: outcome.events,
        messages: outcome.messages,
        clock_rounds: live.view.clock_rounds,
        names: entryNames(outcome.events, live.labels, itemNames([previous, live.view], outcome.events), {
          view: live.view,
          dungeons: dungeonNames(live.view),
          actorId: meta.actorId,
        }),
        actor_id: meta.actorId ?? null,
        xp_gained: xpGained,
      },
    });
    this.battle.afterAcceptedLocked(live);
    await this.saves.autosaveAfterLocked(live, previous);
    await this.pushStateLocked(live.tableId);
    await this.battle.pushLocked(live.tableId);
  }

  /**
   * Serves the full adventure of the table's game to a referee, with an `ETag`. The adventure doesn't change
   * during a session, so the server reads it from bxapi once per session.
   *
   * @param tableId - The table ID.
   */
  async adventureDocument(tableId: string): Promise<{ etag: string; body: string }> {
    const live = await this.require(tableId);
    const cached = this.adventureCache.get(live.sessionId);
    if (cached !== undefined) return cached;
    const view = await callBxapi(() =>
      this.ctx.bxapi.get<RefereeView>(`/v1/sessions/${encodeURIComponent(live.sessionId)}/referee-view`),
    );
    const body = JSON.stringify(view.adventure);
    const entry = { etag: `"${createHash('sha256').update(body).digest('hex').slice(0, 32)}"`, body };
    this.adventureCache.set(live.sessionId, entry);
    if (this.adventureCache.size > 100) {
      const oldest = this.adventureCache.keys().next().value;
      if (oldest !== undefined) this.adventureCache.delete(oldest);
    }
    return entry;
  }

  /**
   * Deletes a table: its bxapi saves, sessions, and uploaded adventures, then its rows, and tells its members.
   * It holds the table's lock throughout, so no command, start, or restore queued behind it can create a bxapi
   * session for a table that no longer exists. A failed bxapi deletion is logged, because the table goes either
   * way.
   *
   * @param tableId - The table ID.
   */
  async deleteTable(tableId: string): Promise<void> {
    await this.locked(tableId, async () => {
      this.live.delete(tableId);
      // A deletion that fails is remembered and tried again later (see BxapiJanitor).
      for (const row of this.ctx.db.all('SELECT id FROM saves WHERE table_id = ?', tableId)) {
        await this.ctx.janitor.remove('save', str(row, 'id'));
      }
      for (const row of this.ctx.db.all(
        'SELECT session_id FROM table_sessions WHERE table_id = ?',
        tableId,
      )) {
        await this.ctx.janitor.remove('session', str(row, 'session_id'));
      }
      await this.ctx.adventures.removeAll(tableId);
      this.ctx.db.run('DELETE FROM tables WHERE id = ?', tableId);
      this.ctx.hub.removeUser(tableId, null, 'table_deleted');
    });
  }

  /**
   * Deletes a bxapi session that the server created but never recorded, after a start or restore failed
   * partway. A failure is logged.
   *
   * @param sessionId - The session ID.
   */
  async discardSession(sessionId: string): Promise<void> {
    await this.ctx.janitor.remove('session', sessionId);
  }

  /**
   * The game clock at one revision of a session, when the server knows it: the clock of the game it holds in
   * memory, at that game's current revision.
   *
   * @param tableId - The table ID.
   * @param sessionId - The session ID.
   * @param revision - The revision.
   * @returns The clock in rounds, or `null`.
   */
  clockAt(tableId: string, sessionId: string, revision: number): number | null {
    const live = this.live.get(tableId);
    if (live === undefined || live.sessionId !== sessionId || live.revision !== revision) return null;
    return live.view.clock_rounds;
  }

  /**
   * The names for the IDs in the events of an older feed entry, from what the server knows of the entry's session
   * now, or `undefined` when the server doesn't hold that session in memory.
   *
   * @param tableId - The table ID.
   * @param sessionId - The entry's session.
   * @param events - The events of the reader's copy.
   */
  namesFor(tableId: string, sessionId: string, events: GameEvent[]): EntryNames | undefined {
    const live = this.live.get(tableId);
    if (live === undefined || live.sessionId !== sessionId) return undefined;
    return entryNames(events, live.labels, itemNames([live.view], events), {
      dungeons: dungeonNames(live.view),
    });
  }

  /**
   * Whether the party's map includes a level, from the game the server holds in memory. A player sees map
   * annotations and pings only on such a level, because anything on another level is the referee's plan.
   *
   * @param tableId - The table ID.
   * @param level - The level.
   * @returns `false` in the lobby or before the server has read the game.
   */
  levelKnown(tableId: string, level: { dungeon_id: string; level_number: number }): boolean {
    const live = this.live.get(tableId);
    if (live === undefined || this.ctx.tables.game(tableId)?.sessionId !== live.sessionId) return false;
    return live.view.explored.some(
      (known) => known.dungeon_id === level.dungeon_id && known.level_number === level.level_number,
    );
  }
}
