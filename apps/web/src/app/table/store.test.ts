import type { FeedEntry, GameState, ServerMessage } from '@bxvtt/shared/protocol';
import { emptyContext, itemName } from '@bxvtt/shared/text';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '../testing/fixtures';
import {
  buildBaseTextContext,
  createTableStore,
  dataFromSnapshot,
  initialTableData,
  newerGame,
  pruneAnnotations,
  reduceServerMessage,
  type TableData,
} from './store';

function chat(seq: number, text = `message ${seq}`): FeedEntry {
  return {
    kind: 'chat',
    seq,
    text,
    created_at: '2026-11-22T05:00:00Z',
    user_id: null,
    visibility: 'everyone',
    to: [],
  };
}

function apply(state: TableData, message: ServerMessage): TableData {
  return { ...state, ...reduceServerMessage(state, message, 1_000) };
}

function withRevision(game: GameState, revision: number, sessionId = game.session_id): GameState {
  return { ...game, revision, session_id: sessionId };
}

describe('reduceServerMessage', () => {
  it('fills every part of the state from a first snapshot', () => {
    const snapshot = fixtureSnapshot('exploring', 'player');
    const state = apply(initialTableData(snapshot.table.id), snapshot);
    expect(state.ready).toBe(true);
    expect(state.role).toBe('player');
    expect(state.table?.name).toBe('Thursday at the Drowned Bell');
    expect(state.game?.mode).toBe('exploring');
    expect(state.feed.map((e) => e.seq)).toEqual(snapshot.feed.entries.map((e) => e.seq));
    expect(state.feedHasOlder).toBe(snapshot.feed.has_more);
    expect(state.notes.referee).toBeNull();
    expect(state.baseTextContext.members['character-0001']?.name).toBe('Brenna');
  });

  it('merges a reconnect snapshot into the feed it already has', () => {
    const snapshot = fixtureSnapshot('lobby', 'player');
    let state: TableData = {
      ...initialTableData(snapshot.table.id),
      feed: [chat(1), chat(2)],
      feedHasOlder: true,
    };
    state = apply(state, { ...snapshot, feed: { entries: [chat(2), chat(3)], has_more: false } });
    expect(state.feed.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(state.feedHasOlder).toBe(true);
  });

  it('replaces presence, the table, declarations, and notes wholesale', () => {
    const snapshot = fixtureSnapshot('battle', 'player');
    let state = dataFromSnapshot(snapshot);
    state = apply(state, { type: 'presence', presence: { online: [] } });
    expect(state.online).toEqual([]);

    const renamed = { ...snapshot.table, name: 'Friday at the Drowned Bell' };
    state = apply(state, { type: 'table', table: renamed });
    expect(state.table?.name).toBe('Friday at the Drowned Bell');

    state = apply(state, { type: 'declarations', declarations: null });
    expect(state.declarations).toBeNull();

    const party = { ...snapshot.notes.party, text: 'Bring rope.', version: 2 };
    state = apply(state, { type: 'notes', notes: party });
    expect(state.notes.party?.text).toBe('Bring rope.');
  });

  it("follows the user's role from a table message", () => {
    const snapshot = fixtureSnapshot('lobby', 'player');
    const state = dataFromSnapshot(snapshot);
    const members = snapshot.table.members.map((m) =>
      m.user_id === snapshot.user.id ? { ...m, role: 'referee' as const } : m,
    );
    expect(apply(state, { type: 'table', table: { ...snapshot.table, members } }).role).toBe('referee');
  });

  it('keeps a newer game when an older revision arrives, and takes a new session', () => {
    const snapshot = fixtureSnapshot('exploring', 'player');
    const state = dataFromSnapshot(snapshot);
    const game = snapshot.game as GameState;
    const older = withRevision(game, game.revision - 1);
    expect(apply(state, { type: 'game', game: older }).game).toBe(state.game);
    const restored = withRevision(game, 1, 'ses_restored');
    expect(apply(state, { type: 'game', game: restored }).game?.session_id).toBe('ses_restored');
    expect(apply(state, { type: 'game', game: null }).game).toBeNull();
  });

  it('appends feed entries and drops one it already has', () => {
    let state: TableData = { ...initialTableData('tbl_x'), feed: [chat(1)] };
    state = apply(state, { type: 'feed', entry: chat(2) });
    state = apply(state, { type: 'feed', entry: chat(2, 'repeat') });
    expect(state.feed.map((e) => e.seq)).toEqual([1, 2]);
  });

  it('stores annotations by level and pings once each', () => {
    let state = initialTableData('tbl_x');
    state = apply(state, {
      type: 'annotations',
      annotations: { dungeon_id: 'priory', level_number: 1, items: [] },
    });
    expect(Object.keys(state.annotations)).toEqual(['priory:1']);
    const ping: ServerMessage = {
      type: 'ping',
      dungeon_id: 'priory',
      level_number: 1,
      x: 3,
      y: 4,
      user_id: 'usr_aaaaaaaaaaaaaaaaaaaaaa',
      at: '2026-11-22T05:00:00Z',
    };
    state = apply(apply(state, ping), ping);
    expect(state.pings).toHaveLength(1);
  });

  it('records notices, errors, removal, and the server clock', () => {
    let state = initialTableData('tbl_x');
    state = apply(state, { type: 'notice', code: 'table_changed', detail: 'The game moved on.' });
    expect(state.notices.at(-1)?.code).toBe('table_changed');
    state = apply(state, {
      type: 'error',
      code: 'rate_limited',
      detail: 'Ask for a new snapshot less often.',
    });
    expect(state.connectionError?.code).toBe('rate_limited');
    state = apply(state, { type: 'heartbeat', server_time: '1970-01-01T00:00:03Z' });
    expect(state.serverTimeOffsetMs).toBe(2_000);
    state = apply(state, { type: 'removed', reason: 'kicked' });
    expect(state.removed).toBe('kicked');
  });
});

describe('newerGame', () => {
  it('replaces a game at the same revision, for seat changes', () => {
    const game = fixtureSnapshot('town', 'player').game as GameState;
    const reseated = { ...game, seats: [] };
    expect(newerGame(game, reseated)).toBe(reseated);
  });
});

describe('pruneAnnotations', () => {
  it('drops the cache of a level the party has just mapped', () => {
    const town = fixtureSnapshot('town', 'player').game as GameState;
    const exploring = fixtureSnapshot('exploring', 'player').game as GameState;
    const cached = { 'priory:1': { dungeon_id: 'priory', level_number: 1, items: [] } };
    expect(pruneAnnotations(cached, town, exploring)).toEqual({});
    expect(pruneAnnotations(cached, exploring, exploring)).toBe(cached);
  });
});

describe('createTableStore', () => {
  it('applies a game from an HTTP response only when it is newer', () => {
    const snapshot = fixtureSnapshot('exploring', 'player');
    const store = createTableStore(snapshot.table.id, { initial: dataFromSnapshot(snapshot) });
    const game = snapshot.game as GameState;
    store.getState().receiveGame(withRevision(game, game.revision - 1));
    expect(store.getState().game?.revision).toBe(game.revision);
    store.getState().receiveGame(withRevision(game, game.revision + 1));
    expect(store.getState().game?.revision).toBe(game.revision + 1);
  });
});

describe('buildBaseTextContext', () => {
  it("keeps the text layer's nouns when the scene names an item by its catalog lot", () => {
    const game = fixtureSnapshot('exploring', 'player').game;
    if (!game) throw new Error('The fixture has no game.');
    const ctx = buildBaseTextContext(emptyContext(), {
      ...game,
      scene: { ...game.scene, names: { ...game.scene.names, torch: 'Torches (6)' } },
    });
    expect(itemName('torch', ctx)).toBe('a torch');
  });
});

describe('rejoin requests', () => {
  it('reads them from a referee snapshot and replaces them from each message', () => {
    const snapshot = fixtureSnapshot('lobby', 'referee');
    const request = {
      id: 'rjq_1',
      table_id: snapshot.table.id,
      user_id: 'usr_bbbbbbbbbbbbbbbbbbbbbb',
      name: 'Sam',
      color: '#cc79a7' as const,
      role: 'player' as const,
      created_at: '2026-11-22T05:00:00Z',
      expires_at: '2026-11-22T05:05:00Z',
    };
    let state = apply(initialTableData(snapshot.table.id), { ...snapshot, rejoin_requests: [request] });
    expect(state.rejoinRequests).toEqual([request]);
    state = apply(state, { type: 'rejoin_requests', requests: [] });
    expect(state.rejoinRequests).toEqual([]);
  });
});
