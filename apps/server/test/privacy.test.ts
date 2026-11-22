import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GameState } from '@bxvtt/shared/protocol';
import type { TestConnection, TestServer, TestUser } from './helpers';
import {
  connect,
  createCharacter,
  createTable,
  createUser,
  findRefereeData,
  received,
  startServer,
} from './helpers';

describe('what a player receives', () => {
  let server: TestServer;
  let referee: TestUser;
  let alice: TestUser;
  let tableId: string;
  let aliceWs: TestConnection;
  let refereeWs: TestConnection;
  let game: GameState;

  beforeAll(async () => {
    server = await startServer();
    referee = await createUser(server, 'Ref');
    alice = await createUser(server, 'Alice');
    tableId = (await createTable(referee, [alice])).id;
    const brenna = await createCharacter(alice, 'Brenna', 'fighter', 31);
    await alice.client.addToRoster(tableId, brenna.id);
    aliceWs = await connect(server, alice, tableId);
    refereeWs = await connect(server, referee, tableId);
    game = await referee.client.startGame(tableId, { adventure_id: 'builtin-barrow', seed: 7 });
  });

  afterAll(async () => {
    aliceWs.close();
    refereeWs.close();
    await server.close();
  });

  it('hides a referee command with no player events, and its type when it has some', async () => {
    const note = await referee.client.sendCommand(tableId, {
      command_type: 'record_note',
      text: 'The king stirs.',
    });
    expect(note.accepted).toBe(true);
    const refereeEntry = await received(
      refereeWs,
      'feed',
      (message) => message.entry.kind === 'game' && message.entry.revision === note.revision,
    );
    expect(refereeEntry.entry).toMatchObject({ visibility: 'referees', command_type: 'record_note' });
    const coins = await referee.client.sendCommand(tableId, {
      command_type: 'grant_coins',
      character_id: 'character-0001',
      coins: { gp: 5 },
    });
    expect(coins.accepted).toBe(true);
    const playerEntry = await received(
      aliceWs,
      'feed',
      (message) => message.entry.kind === 'game' && message.entry.revision === coins.revision,
    );
    if (playerEntry.entry.kind !== 'game') throw new Error('expected a game entry');
    expect(playerEntry.entry.command_type).toBeNull();
    const feed = await alice.client.getFeed(tableId, { limit: 200 });
    expect(feed.entries.some((entry) => entry.kind === 'game' && entry.revision === note.revision)).toBe(
      false,
    );
    game = coins.game;
  });

  it('splits the events of one command by visibility', async () => {
    let state = (
      await alice.client.sendCommand(tableId, { command_type: 'enter_dungeon', dungeon_id: 'barrow' })
    ).game;
    for (let i = 0; i < 2; i += 1) {
      state = (
        await alice.client.sendCommand(
          tableId,
          { command_type: 'move_party', direction: 'east' },
          state.revision,
        )
      ).game;
    }
    const revision = state.revision;
    const refereeEntry = await received(
      refereeWs,
      'feed',
      (message) => message.entry.kind === 'game' && message.entry.revision === revision,
    );
    const playerEntry = await received(
      aliceWs,
      'feed',
      (message) => message.entry.kind === 'game' && message.entry.revision === revision,
    );
    if (refereeEntry.entry.kind !== 'game' || playerEntry.entry.kind !== 'game')
      throw new Error('expected game entries');
    expect(refereeEntry.entry.events.some((event) => event.visibility === 'referee')).toBe(true);
    expect(playerEntry.entry.events.every((event) => event.visibility === 'player')).toBe(true);
    expect(playerEntry.entry.messages).toHaveLength(playerEntry.entry.events.length);
    const page = await alice.client.getFeed(tableId, { after: playerEntry.entry.seq - 1, limit: 1 });
    expect(page.entries[0]).toEqual(playerEntry.entry);
    game = state;
  });

  it('never sends a player referee data in any message or response', async () => {
    await alice.client.getGame(tableId);
    await alice.client.listEvents(tableId);
    const texts = [...alice.received, ...aliceWs.messages.map((message) => JSON.stringify(message))];
    expect(texts.length).toBeGreaterThan(10);
    expect(findRefereeData(texts, ['The king stirs.'])).toEqual([]);
    const refereeTexts = refereeWs.messages.map((message) => JSON.stringify(message));
    expect(findRefereeData(refereeTexts).length).toBeGreaterThan(0);
    void game;
  });
});

describe('autosaves', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('saves at meaningful moments and keeps the newest ten', async () => {
    const referee = await createUser(server, 'Ref');
    const table = await referee.client.createTable({ name: 'Autosaves' });
    const character = await createCharacter(referee, 'Solo', 'fighter', 41);
    await referee.client.addToRoster(table.id, character.id);
    await referee.client.startGame(table.id, { adventure_id: 'builtin-barrow', seed: 7 });
    for (let trip = 0; trip < 6; trip += 1) {
      let state = (
        await referee.client.sendCommand(table.id, { command_type: 'enter_dungeon', dungeon_id: 'barrow' })
      ).game;
      expect(state.mode).toBe('exploring');
      state = (await referee.client.sendCommand(table.id, { command_type: 'travel_to_town' })).game;
      expect(state.mode).toBe('town');
    }
    const saves = (await referee.client.listSaves(table.id)).items;
    const autosaves = saves.filter((save) => save.autosave);
    expect(autosaves).toHaveLength(10);
    expect(autosaves[0]?.label).toBe('Autosave: Returned to Threshold');
    expect(autosaves[1]?.label).toBe('Autosave: Entered the Barrow');
    // Turning the setting off stops the autosaves.
    await referee.client.updateTable(table.id, { settings: { autosave: false } });
    await referee.client.sendCommand(table.id, { command_type: 'enter_dungeon', dungeon_id: 'barrow' });
    expect((await referee.client.listSaves(table.id)).items[0]?.id).toBe(autosaves[0]?.id);
  });
});
