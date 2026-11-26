import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DeclarationsState, GameState } from '@bxvtt/shared/protocol';
import { findRepoRoot } from '../src/config';
import type { TestConnection, TestServer, TestUser } from './helpers';
import {
  connect,
  createCharacter,
  createTable,
  createUser,
  findRefereeData,
  findUnshownCreatureIds,
  received,
  startServer,
} from './helpers';

/**
 * The battle round preview at a shared table. Tess the thief, Brenna the fighter, and Mira the magic-user meet the
 * two goblins of The Drowned Bell's guardroom, 30 feet away. All three stand in the party's front rank, so Tess
 * can't hide until Brenna closes in ahead of her.
 */
describe('previewing the declarations of a battle round', () => {
  let server: TestServer;
  let referee: TestUser;
  let alice: TestUser;
  let tableId: string;
  let aliceWs: TestConnection;
  let game: GameState;
  let commandCalls = 0;
  let previewCalls = 0;
  let previewFails = false;

  beforeAll(async () => {
    const bell = await readFile(`${findRepoRoot()}/adventures/the-drowned-bell.json`, 'utf8');
    server = await startServer({}, { 'the-drowned-bell.json': bell });
    const bxapi = server.server.ctx.bxapi;
    const original = bxapi.request.bind(bxapi);
    bxapi.request = (async (method: string, path: string, options?: Parameters<typeof original>[2]) => {
      if (method === 'POST' && path.endsWith('/commands')) commandCalls += 1;
      if (method === 'POST' && path.endsWith('/battle-round/preview')) {
        previewCalls += 1;
        if (previewFails) throw new Error('bxapi is down');
      }
      return original(method, path, options);
    }) as typeof bxapi.request;
    referee = await createUser(server, 'Rhea');
    alice = await createUser(server, 'Alice');
    tableId = (await createTable(referee, [alice])).id;
    const tess = await createCharacter(alice, 'Tess', 'thief', 60);
    const brenna = await createCharacter(alice, 'Brenna', 'fighter', 61);
    const mira = await alice.client.createCharacter({
      name: 'Mira',
      class_id: 'magic_user',
      alignment: 'neutral',
      starting_spell_ids: ['magic_missile'],
      seed: 12,
    });
    for (const character of [tess, brenna, mira]) await alice.client.addToRoster(tableId, character.id);
    aliceWs = await connect(server, alice, tableId);
    await referee.client.startGame(tableId, { adventure_id: 'sample:the-drowned-bell', seed: 7 });
    await referee.client.updateTable(tableId, { settings: { auto_resolve: false } });
    await alice.client.sendCommand(tableId, { command_type: 'rest', kind: 'night' });
    await alice.client.sendCommand(tableId, {
      command_type: 'prepare_spells',
      character_id: 'character-0003',
      selections: [{ spell_id: 'magic_missile' }],
    });
    await alice.client.sendCommand(tableId, { command_type: 'enter_dungeon', dungeon_id: 'priory' });
    await referee.client.sendCommand(tableId, {
      command_type: 'place_party',
      location: {
        kind: 'dungeon',
        dungeon_id: 'priory',
        level_number: 1,
        position: [14, 21],
        facing: 'north',
      },
    });
    const met = await alice.client.sendCommand(tableId, { command_type: 'move_party', direction: 'north' });
    expect(met.game.mode).toBe('encounter');
    game = (await alice.client.sendCommand(tableId, { command_type: 'engage_battle' })).game;
    expect(game.mode).toBe('battle');
    expect(game.view.encounter?.declarers).toEqual(['character-0001', 'character-0002', 'character-0003']);
    expect(game.view.encounter?.can_hide).toEqual([]);
  });

  afterAll(async () => {
    aliceWs.close();
    await server.close();
  });

  const group = () => game.view.encounter?.groups[0]?.id ?? '';
  const codes = (state: DeclarationsState | null) =>
    (state?.refusals ?? []).map((refusal) => [refusal.member_id, refusal.code]);

  it('stores a declaration the session would refuse, and names the member and the reason at once', async () => {
    const before = commandCalls;
    const state = await alice.client.declare(tableId, 'character-0001', { action: 'hide' });
    expect(state.declared).toEqual(['character-0001']);
    expect(state.declarations['character-0001']).toMatchObject({ action: 'hide' });
    expect(codes(state)).toEqual([['character-0001', 'battle.declaration.hide_in_front_rank']]);
    expect(state.projection?.advance_feet).toEqual({
      'character-0001': 0,
      'character-0002': 0,
      'character-0003': 0,
    });
    // The push to everyone at the table carries the same refusal, and the preview ran nothing.
    const pushed = await received(
      aliceWs,
      'declarations',
      (message) => (message.declarations?.refusals.length ?? 0) > 0,
    );
    expect(codes(pushed.declarations)).toEqual(codes(state));
    expect(commandCalls).toBe(before);
    expect((await alice.client.getGame(tableId)).revision).toBe(game.revision);
  });

  it("clears the refusal when another member's declared move makes the declaration work", async () => {
    const state = await alice.client.declare(tableId, 'character-0002', {
      action: 'attack',
      move: 'close',
      target_group_id: group(),
    });
    expect(state.refusals).toEqual([]);
    expect(state.projection?.advance_feet['character-0002']).toBe(25);
    expect(state.projection?.front_rank[group()]).toEqual(['character-0002']);
  });

  it('reads the same state twice with one preview', async () => {
    const before = previewCalls;
    await alice.client.getDeclarations(tableId);
    await alice.client.getDeclarations(tableId);
    expect(previewCalls).toBe(before);
  });

  it("shows a player a preview rejection without a creature the player view doesn't list", async () => {
    const forReferee = await referee.client.declare(tableId, 'character-0003', {
      action: 'cast',
      spell_id: 'magic_missile',
      spell_mode: 'missiles',
      targets: ['monster-0099'],
    });
    expect(forReferee.refusals).toEqual([
      expect.objectContaining({
        member_id: 'character-0003',
        params: expect.objectContaining({ target: 'monster-0099' }),
      }),
    ]);
    const forPlayer = await alice.client.getDeclarations(tableId);
    expect(forPlayer?.refusals).toEqual([
      expect.objectContaining({
        member_id: 'character-0003',
        params: expect.objectContaining({ target: null }),
      }),
    ]);
    expect(forPlayer?.declarations['character-0003']?.targets).toEqual([]);
    expect(JSON.stringify(forPlayer)).not.toContain('monster-0099');
  });

  it('names the refused member from params.character when a round is resolved anyway, with one bxapi call', async () => {
    const before = commandCalls;
    const result = await alice.client.resolveRound(tableId);
    expect(result.accepted).toBe(false);
    expect(result.game.revision).toBe(game.revision);
    expect(commandCalls - before).toBe(1);
    expect(result.declarations.refusals.map((refusal) => refusal.member_id)).toEqual(['character-0003']);
  });

  it('waits to resolve on its own while the preview refuses a declaration, and resolves once it is clean', async () => {
    await referee.client.updateTable(tableId, { settings: { auto_resolve: true } });
    expect((await alice.client.getGame(tableId)).revision).toBe(game.revision);
    const before = commandCalls;
    await alice.client.declare(tableId, 'character-0003', { action: 'hold' });
    expect(commandCalls - before).toBe(1);
    const after = await alice.client.getGame(tableId);
    expect(after.revision).toBeGreaterThan(game.revision);
    game = after;
  });

  it('keeps the declarations state when the preview fails', async () => {
    if (game.mode !== 'battle')
      throw new Error('The battle ended in one round, so this test needs a new seed.');
    await referee.client.updateTable(tableId, { settings: { auto_resolve: false } });
    previewFails = true;
    try {
      const state = await alice.client.declare(tableId, 'character-0001', { action: 'hold' });
      expect(state.declared).toEqual(['character-0001']);
      expect(state.refusals).toEqual([]);
      expect(state.projection).toBeNull();
    } finally {
      previewFails = false;
    }
  });

  it('never sends the player a creature ID before the player view showed it, or any referee data', async () => {
    const refereeState = await referee.client.getRefereeState(tableId);
    const ids = refereeState.monsters.map((monster) => monster.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(findUnshownCreatureIds(alice.received, ids)).toEqual([]);
    expect(
      findUnshownCreatureIds(
        aliceWs.messages.map((message) => JSON.stringify(message)),
        ids,
      ),
    ).toEqual([]);
    const texts = [...alice.received, ...aliceWs.messages.map((message) => JSON.stringify(message))];
    expect(findRefereeData(texts)).toEqual([]);
    expect(texts.some((text) => text.includes('monster-0099'))).toBe(false);
  });
});
