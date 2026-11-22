import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DeclarationBody, GameState } from '@bxvtt/shared/protocol';
import { findRepoRoot } from '../src/config';
import type { TestConnection, TestServer, TestUser } from './helpers';
import { connect, createCharacter, createTable, createUser, findMonsterIds, startServer } from './helpers';

/**
 * D-302: a refused battle round says whose declaration bxapi refused, even when osrlib's rejection names nobody.
 * The party (Brenna, Mira the magic-user, and Osric) meets the two goblins of The Drowned Bell's guardroom, and
 * every round here is refused, so the battle never moves on.
 */
describe('attributing the refusals of a battle round', () => {
  let server: TestServer;
  let referee: TestUser;
  let alice: TestUser;
  let tableId: string;
  let aliceWs: TestConnection;
  let game: GameState;
  let commandCalls = 0;

  beforeAll(async () => {
    const bell = await readFile(`${findRepoRoot()}/adventures/the-drowned-bell.json`, 'utf8');
    server = await startServer({}, { 'the-drowned-bell.json': bell });
    const bxapi = server.server.ctx.bxapi;
    const original = bxapi.request.bind(bxapi);
    bxapi.request = (async (method: string, path: string, options?: Parameters<typeof original>[2]) => {
      if (method === 'POST' && path.endsWith('/commands')) commandCalls += 1;
      return original(method, path, options);
    }) as typeof bxapi.request;
    referee = await createUser(server, 'Rhea');
    alice = await createUser(server, 'Alice');
    tableId = (await createTable(referee, [alice])).id;
    const brenna = await createCharacter(alice, 'Brenna', 'fighter', 60);
    const mira = await alice.client.createCharacter({
      name: 'Mira',
      class_id: 'magic_user',
      alignment: 'neutral',
      starting_spell_ids: ['magic_missile'],
      seed: 12,
    });
    const osric = await createCharacter(alice, 'Osric', 'fighter', 61);
    for (const character of [brenna, mira, osric]) await alice.client.addToRoster(tableId, character.id);
    aliceWs = await connect(server, alice, tableId);
    await referee.client.startGame(tableId, { adventure_id: 'sample:the-drowned-bell', seed: 7 });
    await referee.client.updateTable(tableId, { settings: { auto_resolve: false } });
    await alice.client.sendCommand(tableId, { command_type: 'rest', kind: 'night' });
    await alice.client.sendCommand(tableId, {
      command_type: 'prepare_spells',
      character_id: 'character-0002',
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
  });

  afterAll(async () => {
    aliceWs.close();
    await server.close();
  });

  const group = () => game.view.encounter?.groups[0]?.id ?? '';
  const handles = () => (game.scene.targets ?? []).map((target) => target.handle);
  const hold: DeclarationBody = { action: 'hold' };
  const attack = (): DeclarationBody => ({ action: 'attack', target_group_id: group() });
  const missiles = (): DeclarationBody => ({
    action: 'cast',
    spell_id: 'magic_missile',
    spell_mode: 'missiles',
    targets: handles(),
  });

  /** Declares for the three members, resolves, and returns the refusals and the bxapi command calls it took. */
  async function refuse(declarations: [DeclarationBody, DeclarationBody, DeclarationBody]) {
    for (const [index, declaration] of declarations.entries()) {
      await alice.client.declare(tableId, `character-000${index + 1}`, declaration);
    }
    const before = commandCalls;
    const result = await alice.client.resolveRound(tableId);
    expect(result.accepted).toBe(false);
    expect(result.game.revision).toBe(game.revision);
    return { refusals: result.declarations.refusals, calls: commandCalls - before };
  }

  it('names the attacker of an attack out of reach, with no probe', async () => {
    const distance = game.view.encounter?.groups[0]?.member_distance_feet?.['character-0001'] ?? 0;
    expect(distance).toBeGreaterThan(5);
    const { refusals, calls } = await refuse([attack(), hold, hold]);
    expect(refusals).toEqual([
      { member_id: 'character-0001', code: 'combat.attack.out_of_reach', params: expect.any(Object) },
    ]);
    expect(calls).toBe(1);
  });

  it('names the caster of a spell with too many targets', async () => {
    expect(handles().length).toBeGreaterThanOrEqual(2);
    const { refusals } = await refuse([hold, missiles(), hold]);
    expect(refusals.map((refusal) => [refusal.member_id, refusal.code])).toEqual([
      ['character-0002', 'magic.cast.target_count'],
    ]);
  });

  it('tells two bad declarations from different members apart with one probe', async () => {
    const { refusals, calls } = await refuse([attack(), missiles(), hold]);
    expect(refusals.map((refusal) => [refusal.member_id, refusal.code])).toEqual([
      ['character-0001', 'combat.attack.out_of_reach'],
      ['character-0002', 'magic.cast.target_count'],
    ]);
    expect(refusals.every((refusal) => refusal.candidates === undefined)).toBe(true);
    // The round, then one probe that swaps Brenna's declaration for one osrlib always refuses.
    expect(calls).toBe(2);
  });

  it('tells apart two members refused for the same reason by the order of the declarations', async () => {
    const { refusals } = await refuse([attack(), hold, attack()]);
    const codes = refusals.map((refusal) => refusal.code);
    expect(codes.every((code) => code === 'combat.attack.out_of_reach')).toBe(true);
    expect(refusals.map((refusal) => refusal.member_id)).toEqual(['character-0001', 'character-0003']);
  });

  it('leaves no trace of the probes: no feed entry, no new revision, and no monster ID for the player', async () => {
    const now = await alice.client.getGame(tableId);
    expect(now.revision).toBe(game.revision);
    expect(now.mode).toBe('battle');
    const feed = await alice.client.getFeed(tableId, { limit: 200 });
    expect(
      feed.entries.some((entry) => entry.kind === 'game' && entry.command_type === 'resolve_battle_round'),
    ).toBe(false);
    expect(
      aliceWs.messages.some((message) => message.type === 'notice' && message.code === 'table_changed'),
    ).toBe(false);
    const referee_ = await referee.client.getRefereeState(tableId);
    const ids = (referee_.encounter?.groups ?? []).flatMap((candidate) => candidate.monster_ids);
    const texts = [...alice.received, ...aliceWs.messages.map((message) => JSON.stringify(message))];
    expect(findMonsterIds(texts, ids)).toEqual([]);
  });
});
