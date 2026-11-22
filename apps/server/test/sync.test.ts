import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BxvttClient, isProblem, TableConnection } from '@bxvtt/shared/client';
import type { BxvttProblemError } from '@bxvtt/shared/client';
import type { CommandOutcome } from '@bxvtt/shared/bxapi';
import type { FeedEntry, GameState, ServerMessage } from '@bxvtt/shared/protocol';
import type { TestServer, TestUser } from './helpers';
import {
  BXAPI_URL,
  connect,
  createCharacter,
  createTable,
  createUser,
  received,
  startServer,
  waitFor,
} from './helpers';

/**
 * Starts a game of builtin-barrow with one character for each player, in that order.
 *
 * @param referee - The referee.
 * @param players - The players.
 */
async function startGame(
  referee: TestUser,
  players: TestUser[],
): Promise<{ tableId: string; game: GameState }> {
  const table = await createTable(referee, players);
  let seed = 21;
  for (const player of players) {
    const character = await createCharacter(player, `${player.name}'s fighter`, 'fighter', seed++);
    await player.client.addToRoster(table.id, character.id);
  }
  const game = await referee.client.startGame(table.id, { adventure_id: 'builtin-barrow', seed: 3 });
  return { tableId: table.id, game };
}

describe('reconnect, resync, and revision conflicts', () => {
  let server: TestServer;
  let referee: TestUser;
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    server = await startServer();
    referee = await createUser(server, 'Ref');
    alice = await createUser(server, 'Alice');
    bob = await createUser(server, 'Bob');
  });

  afterAll(async () => {
    await server.close();
  });

  it('catches up the feed and the game after a dropped connection', async () => {
    const { tableId, game } = await startGame(referee, [alice, bob]);
    const connection = new TableConnection({
      url: server.wsUrl,
      token: bob.token,
      tableId,
      reconnectInitialMs: 600,
      reconnectMaxMs: 600,
    });
    const messages: ServerMessage[] = [];
    connection.onAny((message) => messages.push(message));
    const first = connection.next('snapshot');
    connection.connect();
    await first;
    const statuses: string[] = [];
    connection.onStatus((status) => statuses.push(status));

    connection.dropForTest();
    await waitFor(() => statuses.includes('reconnecting'));
    // While Bob is away, the table chats and the caller acts.
    for (const text of ['one', 'two', 'three']) await alice.client.postFeed(tableId, { text });
    const moved = await alice.client.sendCommand(
      tableId,
      { command_type: 'enter_dungeon', dungeon_id: 'barrow' },
      game.revision,
    );
    expect(moved.accepted).toBe(true);

    const second = await connection.next('snapshot', () => true, 5000);
    expect(second.feed.entries.map((entry) => (entry.kind === 'chat' ? entry.text : null))).toEqual(
      expect.arrayContaining(['one', 'two', 'three']),
    );
    expect(second.game?.revision).toBe(moved.revision);
    expect(second.game?.mode).toBe('exploring');
    expect(connection.getStatus()).toBe('open');

    // Every feed entry reached Bob once, whether in a snapshot or a feed message.
    const seqs: number[] = [];
    for (const message of messages) {
      if (message.type === 'snapshot')
        seqs.push(...message.feed.entries.map((entry: FeedEntry) => entry.seq));
      if (message.type === 'feed') seqs.push(message.entry.seq);
    }
    const counts = new Map<number, number>();
    for (const seq of seqs) counts.set(seq, (counts.get(seq) ?? 0) + 1);
    const later = second.feed.entries.map((entry) => entry.seq);
    for (const seq of later) expect(counts.get(seq)).toBe(1);
    connection.close();
  });

  it('gives a promoted member a referee snapshot at once', async () => {
    const table = await createTable(referee, [alice]);
    const ws = await connect(server, alice, table.id);
    const snapshot = ws.connection.next('snapshot', (message) => message.role === 'referee');
    await referee.client.setMemberRole(table.id, alice.id, 'referee');
    const promoted = await snapshot;
    expect(promoted.notes.referee).not.toBeNull();
    ws.close();
  });

  it('refuses a stale command and tells the sender the table changed', async () => {
    const { tableId, game } = await startGame(referee, [alice, bob]);
    await referee.client.updateTable(tableId, { settings: { party_control: 'anyone' } });
    const bobWs = await connect(server, bob, tableId);
    const order = game.view.party.map((member) => member.id);
    // Both players act on the same revision at the same moment. The server runs one, then refuses the other.
    const results = await Promise.allSettled([
      alice.client.sendCommand(
        tableId,
        { command_type: 'reorder_party', order: [...order].reverse() },
        game.revision,
      ),
      bob.client.sendCommand(tableId, { command_type: 'reorder_party', order }, game.revision),
    ]);
    const accepted = results.filter((result) => result.status === 'fulfilled');
    const refused = results.filter((result) => result.status === 'rejected');
    expect(accepted).toHaveLength(1);
    expect(refused).toHaveLength(1);
    const problem = (refused[0] as PromiseRejectedResult).reason as BxvttProblemError;
    expect(isProblem(problem, 'revision_conflict')).toBe(true);
    expect(problem.problem.revision).toBe(game.revision + 1);
    if (results[1]?.status === 'rejected') {
      await received(bobWs, 'notice', (message) => message.code === 'table_changed');
    }
    await received(bobWs, 'game', (message) => message.game?.revision === game.revision + 1);
    bobWs.close();
  });

  it('recovers when the session changed outside bxvtt', async () => {
    const { tableId, game } = await startGame(referee, [alice]);
    const aliceWs = await connect(server, alice, tableId);
    // Another bxapi client moves the session on, so bxvtt's cached revision is stale.
    const outside = await fetch(`${BXAPI_URL}/v1/sessions/${game.session_id}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command_type: 'enter_dungeon', dungeon_id: 'barrow' }),
    });
    const outcome = (await outside.json()) as CommandOutcome;
    expect(outcome.accepted).toBe(true);
    // bxapi refuses the command bxvtt sends with the old revision, and bxvtt reloads and pushes the new state.
    const conflict = await alice.client
      .sendCommand(tableId, { command_type: 'enter_dungeon', dungeon_id: 'barrow' })
      .catch((error: BxvttProblemError) => error);
    expect(isProblem(conflict, 'revision_conflict')).toBe(true);
    await received(
      aliceWs,
      'game',
      (message) => message.game?.revision === outcome.revision && message.game.mode === 'exploring',
    );
    await received(aliceWs, 'notice', (message) => message.code === 'table_changed');
    const retried = await alice.client.sendCommand(tableId, {
      command_type: 'move_party',
      direction: 'east',
    });
    expect(retried.accepted).toBe(true);
    expect(retried.revision).toBe(outcome.revision + 1);
    aliceWs.close();
  });
});

describe('persistence', () => {
  it('keeps every table, feed entry, note, and seat across a restart', async () => {
    const dataDir = await mkdtemp(join(tmpdir(), 'bxvtt-restart-'));
    try {
      const first = await startServer({ dataDir });
      const referee = await createUser(first, 'Ref');
      const alice = await createUser(first, 'Alice');
      const { tableId, game } = await startGame(referee, [alice]);
      await alice.client.postFeed(tableId, { text: 'before the restart' });
      await alice.client.updateNotes(tableId, 'party', 'Remember the rope.', 0);
      await alice.client.createAnnotation(tableId, {
        dungeon_id: 'barrow',
        level_number: 1,
        kind: 'pin',
        x: 1,
        y: 0,
        text: 'here',
      });
      await first.close();

      const second = await startServer({ dataDir });
      try {
        const client = new BxvttClient({ baseUrl: second.url, token: alice.token });
        const table = await client.getTable(tableId);
        expect(table.phase).toBe('playing');
        const state = await client.getGame(tableId);
        expect(state.revision).toBe(game.revision);
        expect(state.seats).toEqual(game.seats);
        const feed = await client.getFeed(tableId);
        expect(
          feed.entries.some((entry) => entry.kind === 'chat' && entry.text === 'before the restart'),
        ).toBe(true);
        expect((await client.getNotes(tableId, 'party')).text).toBe('Remember the rope.');
        const pins = await client.getAnnotations(tableId, { dungeon_id: 'barrow', level_number: 1 });
        expect(pins.items).toHaveLength(1);
      } finally {
        await second.close();
      }
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
