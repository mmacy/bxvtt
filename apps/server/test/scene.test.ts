import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RefereeState, Scene } from '@bxvtt/shared/protocol';
import { findRepoRoot } from '../src/config';
import type { TestConnection, TestServer, TestUser } from './helpers';
import { connect, createCharacter, createTable, createUser, findRefereeData, startServer } from './helpers';

/** Text from the drowned bell that a player must never receive: cache descriptions and contents, trap dice. */
const HIDDEN = [
  'pale moonstone',
  'Moonstone',
  'priors_iron_key',
  'Gilt psalter covers',
  'Under a fallen desk',
  'A satchel of oiled leather',
  'spell_scroll_1',
  '"damage_dice"',
  '"secret"',
  'stoppered flasks',
];

/**
 * Checks that a scene reveals only what the dungeon overlay marks as known to the party.
 *
 * @param scene - The scene a player received.
 * @param referee - The referee state at the same revision.
 */
function expectSceneWithinKnowledge(scene: Scene, referee: RefereeState): void {
  const state = referee.dungeon_state;
  const known = new Set([
    ...(state.found_traps ?? []),
    ...(state.sprung_traps ?? []),
    ...(state.removed_traps ?? []),
  ]);
  for (const level of scene.levels) {
    const ref = (id: string) => `${level.dungeon_id}:${level.level_number}:${id}`;
    for (const trap of level.traps) expect(known).toContain(ref(trap.feature_id ?? trap.area_id ?? ''));
    for (const cache of level.caches) {
      if (cache.source === 'authored') expect(state.emptied_caches ?? []).not.toContain(ref(cache.id));
      if (cache.trap !== null) expect(known).toContain(ref(cache.id));
    }
    for (const feature of level.features) {
      if (feature.kind === 'construction_trick') expect(state.found_tricks ?? []).toContain(ref(feature.id));
    }
    const walked = new Set(
      (state.explored?.[`${level.dungeon_id}:${level.level_number}`] ?? []).map((c) => `${c[0]},${c[1]}`),
    );
    for (const area of level.areas) {
      const cells = new Set(area.cells.map((cell) => `${cell[0]},${cell[1]}`));
      expect([...cells].some((cell) => walked.has(cell)) || area.cells.length === 0).toBe(true);
    }
  }
}

describe('the scene', () => {
  let server: TestServer;
  let referee: TestUser;
  let alice: TestUser;
  let tableId: string;
  let aliceWs: TestConnection;

  const place = async (x: number, y: number) => {
    const result = await referee.client.sendCommand(tableId, {
      command_type: 'place_party',
      location: { kind: 'dungeon', dungeon_id: 'priory', level_number: 1, position: [x, y], facing: 'north' },
    });
    expect(result.accepted).toBe(true);
    return result.game;
  };

  beforeAll(async () => {
    const root = findRepoRoot();
    const bell = await readFile(`${root}/adventures/the-drowned-bell.json`, 'utf8');
    server = await startServer({}, { 'the-drowned-bell.json': bell });
    referee = await createUser(server, 'Ref');
    alice = await createUser(server, 'Alice');
    tableId = (await createTable(referee, [alice])).id;
    const fighter = await createCharacter(alice, 'Brenna', 'fighter', 51);
    const thief = await createCharacter(alice, 'Wren', 'thief', 52);
    await alice.client.addToRoster(tableId, fighter.id);
    await alice.client.addToRoster(tableId, thief.id);
    aliceWs = await connect(server, alice, tableId);
    await referee.client.startGame(tableId, { adventure_id: 'sample:the-drowned-bell', seed: 5 });
  });

  afterAll(async () => {
    aliceWs.close();
    await server.close();
  });

  it('is empty in town and describes the first area once the party walks in', async () => {
    const town = await alice.client.getGame(tableId);
    expect(town.scene).toEqual({
      levels: [],
      here: null,
      names: expect.any(Object),
      can_travel_to_town: false,
      targets: [],
      dungeon_names: {},
    });
    const entered = await alice.client.sendCommand(tableId, {
      command_type: 'enter_dungeon',
      dungeon_id: 'priory',
    });
    const here = entered.game.scene.here;
    expect(here?.area).toMatchObject({ id: 'gatehouse_stair', name: 'Gatehouse stair' });
    expect(here?.area?.description).toMatch(/^A flight of worn steps/);
    expect(here?.features).toEqual([
      expect.objectContaining({
        id: 'fallen_statue',
        kind: 'custom',
        description: expect.stringMatching(/Saint Corvane/),
      }),
    ]);
    expect(entered.game.scene.levels[0]?.areas.map((area) => area.id)).toEqual(['gatehouse_stair']);
  });

  it('shows a cache by the ID take_treasure needs, without its contents, and drops it once taken', async () => {
    const game = await place(17, 12);
    const cache = game.scene.here?.caches.find((candidate) => candidate.id === 'chapel_altar');
    expect(cache).toEqual({
      id: 'chapel_altar',
      source: 'authored',
      area_id: 'chapel',
      position: null,
      reachable: true,
      trap: null,
    });
    const taken = await alice.client.sendCommand(tableId, {
      command_type: 'take_treasure',
      feature_id: 'chapel_altar',
    });
    expect(taken.accepted).toBe(true);
    expect(taken.game.scene.here?.caches.map((candidate) => candidate.id)).not.toContain('chapel_altar');
    // The party's new things have names, and the potion keeps its masked name.
    const names = Object.values(taken.game.scene.names);
    expect(names).toContain('a potion');
    expect(names.some((name) => /holy water/i.test(name))).toBe(true);
    expect(names).not.toContain('Potion of healing');
  });

  it('draws an undiscovered secret door as a wall', async () => {
    const game = await place(16, 12);
    const level = game.view.explored.find(
      (entry) => entry.dungeon_id === 'priory' && entry.level_number === 1,
    );
    expect(level?.edges['16,12:west']?.kind).toBe('wall');
  });

  it('lists a trapped cache without its trap until the party finds it', async () => {
    const game = await place(26, 17);
    if (game.mode !== 'exploring') {
      // The referee settles the keyed group for good, so it doesn't reappear on the next step.
      const ended = await referee.client.sendCommand(tableId, {
        command_type: 'end_encounter',
        outcome: 'departed',
        resolve_area: true,
      });
      expect(ended.accepted).toBe(true);
    }
    const current = await alice.client.getGame(tableId);
    const chest = current.scene.here?.caches.find((candidate) => candidate.id === 'iron_chest');
    expect(chest).toMatchObject({ area_id: 'wardens_cell', trap: null });
    const inspected = await alice.client.sendCommand(tableId, {
      command_type: 'inspect_treasure',
      character_id: 'character-0002',
      feature_id: 'iron_chest',
    });
    const state = await referee.client.getRefereeState(tableId);
    expectSceneWithinKnowledge(inspected.game.scene, state);
    const found = (state.dungeon_state.found_traps ?? []).includes('priory:1:iron_chest');
    const after = inspected.game.scene.here?.caches.find((candidate) => candidate.id === 'iron_chest');
    expect(after?.trap === null).toBe(!found);
  });

  it('shows a room trap only after a search finds it, and stairs once their cell is known', async () => {
    await place(10, 3);
    const searched = await alice.client.sendCommand(tableId, {
      command_type: 'search',
      character_id: 'character-0002',
      kind: 'room_traps',
    });
    const state = await referee.client.getRefereeState(tableId);
    expectSceneWithinKnowledge(searched.game.scene, state);
    const stairs = await place(3, 3);
    expect(stairs.scene.here?.transitions).toEqual([
      { kind: 'stairs_down', position: [3, 3], side: null, leads: 'down' },
    ]);
    const level = stairs.scene.levels.find((entry) => entry.level_number === 1);
    expect(level?.transitions).toContainEqual(
      expect.objectContaining({ position: [3, 3], kind: 'stairs_down' }),
    );
    expectSceneWithinKnowledge(stairs.scene, await referee.client.getRefereeState(tableId));
  });

  it('never sends a player an unfound trap, the contents of an untaken cache, or a secret door', async () => {
    await alice.client.getGame(tableId);
    const texts = [...alice.received, ...aliceWs.messages.map((message) => JSON.stringify(message))];
    expect(findRefereeData(texts, HIDDEN)).toEqual([]);
  });

  it('shows a level entrance only on a cell the party has mapped', async () => {
    const games = aliceWs.messages.flatMap((message) =>
      message.type === 'game' && message.game !== null ? [message.game] : [],
    );
    expect(games.length).toBeGreaterThan(3);
    for (const game of games) {
      for (const level of game.scene.levels) {
        if (level.entrance == null) continue;
        const known = game.view.explored.find(
          (candidate) =>
            candidate.dungeon_id === level.dungeon_id && candidate.level_number === level.level_number,
        );
        expect(known?.cells.map((cell) => `${cell[0]},${cell[1]}`)).toContain(
          `${level.entrance[0]},${level.entrance[1]}`,
        );
      }
      if (game.scene.can_travel_to_town === true) expect(game.scene.here?.at_entrance).toBe(true);
    }
  });
});

describe('a generated cache', () => {
  it('appears after the encounter with its cache reference, reachable on its cell', async () => {
    const server = await startServer();
    try {
      const referee = await createUser(server, 'Ref');
      const alice = await createUser(server, 'Alice');
      const table = await createTable(referee, [alice]);
      const fighter = await createCharacter(alice, 'Brenna', 'fighter', 11);
      await alice.client.addToRoster(table.id, fighter.id);
      await referee.client.startGame(table.id, { adventure_id: 'builtin-barrow', seed: 7 });
      await alice.client.sendCommand(table.id, { command_type: 'enter_dungeon', dungeon_id: 'barrow' });
      await alice.client.sendCommand(table.id, { command_type: 'move_party', direction: 'east' });
      const met = await alice.client.sendCommand(table.id, { command_type: 'move_party', direction: 'east' });
      expect(met.game.mode).toBe('encounter');
      // While the goblins stand guard, the scene shows no cache.
      expect(met.game.scene.here?.caches).toEqual([]);
      const ended = await referee.client.sendCommand(table.id, {
        command_type: 'end_encounter',
        outcome: 'departed',
        resolve_area: true,
      });
      expect(ended.accepted).toBe(true);
      const after = await alice.client.getGame(table.id);
      const cache = after.scene.here?.caches[0];
      expect(cache).toMatchObject({
        source: 'generated',
        area_id: 'guard_room',
        position: [2, 0],
        reachable: true,
      });
      expect(cache?.id).toMatch(/^cache-\d+$/);
      const taken = await alice.client.sendCommand(table.id, {
        command_type: 'take_treasure',
        feature_id: cache?.id,
      });
      expect(taken.accepted).toBe(true);
      expect(taken.game.scene.here?.caches).toEqual([]);
      // The area is resolved, so stepping out and back in meets no goblins.
      await alice.client.sendCommand(table.id, { command_type: 'move_party', direction: 'west' });
      const back = await alice.client.sendCommand(table.id, {
        command_type: 'move_party',
        direction: 'east',
      });
      expect(back.game.mode).toBe('exploring');
    } finally {
      await server.close();
    }
  });
});
