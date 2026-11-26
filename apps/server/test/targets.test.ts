import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isProblem } from '@bxvtt/shared/client';
import type { BxvttProblemError } from '@bxvtt/shared/client';
import type { GameState, RefereeState } from '@bxvtt/shared/protocol';
import { creatureNames } from '@bxvtt/shared/text';
import type { TestConnection, TestServer, TestUser } from './helpers';
import {
  connect,
  createCharacter,
  createTable,
  createUser,
  findRefereeData,
  findUnshownCreatureIds,
  received,
  recordBxapi,
  startServer,
} from './helpers';

/** The monster and NPC IDs of the session, from the referee state. */
function creatureIds(referee: RefereeState): string[] {
  return [
    ...referee.monsters.map((monster) => monster.id),
    ...referee.npcs.flatMap((npc) => (npc.id == null ? [] : [npc.id])),
  ];
}

/** Starts a barrow game for a fighter and a magic-user who knows *magic missile*, with a counter of bxapi commands. */
async function barrowTable(): Promise<{
  server: TestServer;
  referee: TestUser;
  alice: TestUser;
  tableId: string;
  aliceWs: TestConnection;
  game: GameState;
  commandCalls: () => number;
}> {
  const server = await startServer();
  const recorder = recordBxapi(server);
  const referee = await createUser(server, 'Rhea');
  const alice = await createUser(server, 'Alice');
  const tableId = (await createTable(referee, [alice])).id;
  const fighter = await createCharacter(alice, 'Brenna', 'fighter', 11);
  const mage = await alice.client.createCharacter({
    name: 'Mira',
    class_id: 'magic_user',
    alignment: 'neutral',
    starting_spell_ids: ['magic_missile'],
    purchases: [{ item_id: 'dagger' }],
    equip_item_ids: ['dagger'],
    seed: 12,
  });
  await alice.client.addToRoster(tableId, fighter.id);
  await alice.client.addToRoster(tableId, mage.id);
  const aliceWs = await connect(server, alice, tableId);
  const game = await referee.client.startGame(tableId, { adventure_id: 'builtin-barrow', seed: 7 });
  return {
    server,
    referee,
    alice,
    tableId,
    aliceWs,
    game,
    commandCalls: () => recorder.posts('/commands').length,
  };
}

/** Rests, prepares *magic missile*, and walks into the barrow's guard room, where two goblins wait. */
async function meetGoblins(alice: TestUser, tableId: string): Promise<GameState> {
  await alice.client.sendCommand(tableId, { command_type: 'rest', kind: 'night' });
  const prepared = await alice.client.sendCommand(tableId, {
    command_type: 'prepare_spells',
    character_id: 'character-0002',
    selections: [{ spell_id: 'magic_missile' }],
  });
  expect(prepared.accepted).toBe(true);
  let state = (
    await alice.client.sendCommand(tableId, { command_type: 'enter_dungeon', dungeon_id: 'barrow' })
  ).game;
  for (const direction of ['east', 'east']) {
    state = (
      await alice.client.sendCommand(tableId, { command_type: 'move_party', direction }, state.revision)
    ).game;
  }
  expect(state.mode).toBe('encounter');
  return state;
}

/**
 * A player's magic-user casts *magic missile* at one goblin by the ID the player view lists, in battle in the
 * barrow's guard room. A player receives a monster's ID only where bxapi's player view or a player event shows
 * it, and the server refuses a player's target that the player view doesn't list.
 */
describe('monster targets for players', () => {
  let server: TestServer;
  let referee: TestUser;
  let alice: TestUser;
  let tableId: string;
  let aliceWs: TestConnection;
  let game: GameState;
  let goblins: string[] = [];

  beforeAll(async () => {
    ({ server, referee, alice, tableId, aliceWs, game } = await barrowTable());
  });

  afterAll(async () => {
    aliceWs.close();
    await server.close();
  });

  it('sends no scene targets, and lists no creatures outside an encounter', () => {
    expect(game.scene).not.toHaveProperty('targets');
    expect(creatureNames(game.view.encounter?.groups)).toEqual([]);
  });

  it('lists each goblin by ID in the player view once the party meets them', async () => {
    const state = await meetGoblins(alice, tableId);
    const group = state.view.encounter?.groups[0];
    expect(group?.members.map((member) => member.status)).toEqual(['alive', 'alive']);
    goblins = group?.members.map((member) => member.id) ?? [];
    expect(goblins.every((id) => /^monster-\d+$/.test(id))).toBe(true);
    // The player view lists the same monsters as the referee view, so the IDs are the ones bxapi uses.
    const refereeState = await referee.client.getRefereeState(tableId);
    expect(refereeState.encounter?.groups[0]?.monster_ids).toEqual(goblins);
    expect(creatureNames(state.view.encounter?.groups).map((creature) => creature.name)).toEqual([
      'Goblin 1',
      'Goblin 2',
    ]);
    game = state;
  });

  it('casts magic missile at one goblin by its ID in battle, and names it in the feed', async () => {
    const engaged = await alice.client.sendCommand(tableId, { command_type: 'engage_battle' }, game.revision);
    expect(engaged.accepted).toBe(true);
    const aimedAt = goblins[1] ?? '';
    await referee.client.updateTable(tableId, { settings: { auto_resolve: false } });
    await alice.client.declare(tableId, 'character-0001', { action: 'hold' });
    const declared = await alice.client.declare(tableId, 'character-0002', {
      action: 'cast',
      spell_id: 'magic_missile',
      spell_mode: 'missiles',
      targets: [aimedAt],
    });
    expect(declared.declarations['character-0002']?.targets).toEqual([aimedAt]);
    const result = await alice.client.resolveRound(tableId);
    expect(result.accepted).toBe(true);
    const entry = await received(
      aliceWs,
      'feed',
      (message) => message.entry.kind === 'game' && message.entry.command_type === 'resolve_battle_round',
    );
    if (entry.entry.kind !== 'game') throw new Error('expected a game entry');
    const cast = entry.entry.events.find((event) => event.event_type === 'spell_cast') as
      { target_ids?: string[] } | undefined;
    expect(cast?.target_ids).toEqual([aimedAt]);
    const hits = entry.entry.events.filter(
      (event) =>
        event.event_type === 'damage_dealt' && (event as { target_id?: string }).target_id === aimedAt,
    );
    expect(hits.length).toBeGreaterThan(0);
    // The feed records the name the table used, so the entry reads the same after the encounter ends.
    expect(entry.entry.names?.monsters[aimedAt]).toMatchObject({ label: 'goblin', name: 'Goblin 2' });
    // A slain goblin stays in the roster, so the other goblin keeps its number.
    expect(creatureNames(result.game.view.encounter?.groups).map((creature) => creature.name)).toEqual([
      'Goblin 1',
      'Goblin 2',
    ]);
    game = result.game;
    expect(game.mode).toBe('battle');
  });

  it("refuses a player's declaration aimed at a creature the player view doesn't list", async () => {
    const declaration = await alice.client
      .declare(tableId, 'character-0002', {
        action: 'cast',
        spell_id: 'magic_missile',
        spell_mode: 'missiles',
        targets: ['monster-0099'],
      })
      .catch((error: BxvttProblemError) => error);
    expect(isProblem(declaration, 'target_unknown')).toBe(true);
    expect((declaration as BxvttProblemError).problem).toMatchObject({
      field: 'declaration.targets',
      id: 'monster-0099',
    });
    const stored = await alice.client.getDeclarations(tableId);
    expect(stored?.declarations['character-0002']).toBeUndefined();
  });

  it("shows a player a referee's declaration without the creatures the player view doesn't list", async () => {
    const listed = goblins[0] ?? '';
    const forReferee = await referee.client.declare(tableId, 'character-0002', {
      action: 'cast',
      spell_id: 'magic_missile',
      spell_mode: 'missiles',
      targets: [listed, 'monster-0099'],
    });
    expect(forReferee.declarations['character-0002']?.targets).toEqual([listed, 'monster-0099']);
    const forPlayer = await alice.client.getDeclarations(tableId);
    expect(forPlayer?.declarations['character-0002']?.targets).toEqual([listed]);
    await referee.client.clearDeclaration(tableId, 'character-0002');
  });

  it('never sends a player a creature ID before the player view or a player event shows it, or any referee data', async () => {
    await alice.client.getGame(tableId);
    await alice.client.getFeed(tableId, { limit: 200 });
    const ids = creatureIds(await referee.client.getRefereeState(tableId));
    expect(ids).toEqual(expect.arrayContaining(goblins));
    const http = alice.received;
    const ws = aliceWs.messages.map((message) => JSON.stringify(message));
    expect(findUnshownCreatureIds(http, ids)).toEqual([]);
    expect(findUnshownCreatureIds(ws, ids)).toEqual([]);
    expect(findRefereeData([...http, ...ws])).toEqual([]);
  });
});

/**
 * After an encounter ends, the player view lists none of its monsters. bxapi still accepts an out-of-battle
 * `cast_spell` at one of them, so the server refuses it for a player.
 */
describe('monster targets after an encounter ends', () => {
  let server: TestServer;
  let referee: TestUser;
  let alice: TestUser;
  let tableId: string;
  let aliceWs: TestConnection;
  let commandCalls: () => number;
  let goblins: string[] = [];

  beforeAll(async () => {
    ({ server, referee, alice, tableId, aliceWs, commandCalls } = await barrowTable());
    const met = await meetGoblins(alice, tableId);
    goblins = met.view.encounter?.groups[0]?.members.map((member) => member.id) ?? [];
    expect(goblins.length).toBeGreaterThan(0);
  });

  afterAll(async () => {
    aliceWs.close();
    await server.close();
  });

  it("refuses a player's cast at a monster the player view no longer lists, and sends nothing to bxapi", async () => {
    const ended = await referee.client.sendCommand(tableId, {
      command_type: 'end_encounter',
      outcome: 'departed',
    });
    expect(ended.accepted).toBe(true);
    expect(ended.game.view.encounter).toBeNull();
    const survivor = goblins[0] ?? '';
    const cast = {
      command_type: 'cast_spell',
      character_id: 'character-0002',
      spell_id: 'magic_missile',
      mode: 'missiles',
      targets: [survivor],
    };
    const before = commandCalls();
    const refused = await alice.client.sendCommand(tableId, cast, ended.revision);
    expect(refused.accepted).toBe(false);
    expect(refused.rejections).toEqual([{ code: 'magic.cast.unknown_target', params: { target: survivor } }]);
    expect(refused.revision).toBe(ended.revision);
    expect(commandCalls()).toBe(before);
    // bxapi itself accepts the same cast from the referee, so the check on the server is what stops a player.
    const accepted = await referee.client.sendCommand(tableId, cast, ended.revision);
    expect(accepted.accepted).toBe(true);
    expect(accepted.events.find((event) => event.event_type === 'spell_cast')).toMatchObject({
      target_ids: [survivor],
    });
  });

  it('sends the player no creature ID before the player view showed it', async () => {
    const ids = creatureIds(await referee.client.getRefereeState(tableId));
    // The rejection echoes the ID that Alice sent, which the view had shown her while the encounter was open.
    expect(findUnshownCreatureIds(alice.received, ids)).toEqual([]);
    expect(
      findUnshownCreatureIds(
        aliceWs.messages.map((message) => JSON.stringify(message)),
        ids,
      ),
    ).toEqual([]);
  });
});
