import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Adventure } from '@bxvtt/shared/bxapi';
import type { GameState, PlayerView, RefereeState } from '@bxvtt/shared/protocol';
import { findRepoRoot } from '../src/config';
import { emptiedFeatureHandles } from '../src/game/scene';
import type { TestConnection, TestServer, TestUser } from './helpers';
import {
  connect,
  createCharacter,
  createTable,
  createUser,
  findRefereeData,
  startServer,
  viewHere,
} from './helpers';

/**
 * Text from the drowned bell that a player must never receive: the contents of caches the party hasn't taken,
 * and trap mechanics. A cache's authored description reaches players through the player view, so it isn't here.
 */
const HIDDEN = [
  'Moonstone',
  'priors_iron_key',
  'Gilt psalter covers',
  'Bloodstone',
  "Abbot's gold ring",
  "Prior's chain of office",
  'Silver chalice',
  'spell_scroll_1',
  '"damage_dice"',
  '"secret"',
];

/**
 * Checks that the scene's room traps are traps the party knows about, in areas the player view lists as entered.
 *
 * @param game - The game state a player received.
 * @param referee - The referee state at the same revision.
 */
function expectRoomTrapsWithinKnowledge(game: GameState, referee: RefereeState): void {
  const state = referee.dungeon_state;
  for (const trap of game.scene.room_traps) {
    const ref = `${trap.dungeon_id}:${trap.level_number}:${trap.area_id}`;
    const known =
      trap.state === 'removed'
        ? state.removed_traps
        : trap.state === 'sprung'
          ? state.sprung_traps
          : state.found_traps;
    expect(known ?? []).toContain(ref);
    const level = game.view.explored.find(
      (entry) => entry.dungeon_id === trap.dungeon_id && entry.level_number === trap.level_number,
    );
    expect(level?.areas.map((area) => area.id)).toContain(trap.area_id);
  }
}

describe('the scene', () => {
  let server: TestServer;
  let referee: TestUser;
  let alice: TestUser;
  let tableId: string;
  let aliceWs: TestConnection;

  const place = async (x: number, y: number, level = 1) => {
    const result = await referee.client.sendCommand(tableId, {
      command_type: 'place_party',
      location: {
        kind: 'dungeon',
        dungeon_id: 'priory',
        level_number: level,
        position: [x, y],
        facing: 'north',
      },
    });
    expect(result.accepted).toBe(true);
    if (result.game.mode !== 'exploring') {
      // The referee settles a keyed group for good, so it doesn't reappear on the next step.
      const ended = await referee.client.sendCommand(tableId, {
        command_type: 'end_encounter',
        outcome: 'departed',
        resolve_area: true,
      });
      expect(ended.accepted).toBe(true);
    }
    return alice.client.getGame(tableId);
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

  it('has only names in town', async () => {
    const town = await alice.client.getGame(tableId);
    expect(town.scene).toEqual({ names: expect.any(Object), room_traps: [], emptied_features: [] });
  });

  it('lists a cache by its handle, and lists the handle as emptied once a player takes it', async () => {
    await alice.client.sendCommand(tableId, { command_type: 'enter_dungeon', dungeon_id: 'priory' });
    const game = await place(17, 12);
    const altar = viewHere(game)?.features.find(
      (feature) => feature.kind === 'treasure_cache' && feature.area_id === 'chapel',
    );
    expect(altar?.id).toMatch(/^feature:/);
    expect(game.scene.emptied_features).toEqual([]);
    const taken = await alice.client.sendCommand(tableId, {
      command_type: 'take_treasure',
      feature_id: altar?.id,
    });
    expect(taken.accepted).toBe(true);
    expect(taken.game.scene.emptied_features).toEqual([altar?.id]);
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

  it("shows a trapped cache's trap state only once the party finds the trap", async () => {
    await place(26, 17);
    const current = await alice.client.getGame(tableId);
    const chest = viewHere(current)?.features.find(
      (feature) => feature.kind === 'treasure_cache' && feature.area_id === 'wardens_cell',
    );
    expect(chest?.trap_state ?? null).toBeNull();
    const inspected = await alice.client.sendCommand(tableId, {
      command_type: 'inspect_treasure',
      character_id: 'character-0002',
      feature_id: chest?.id,
    });
    const state = await referee.client.getRefereeState(tableId);
    const found = (state.dungeon_state.found_traps ?? []).includes('priory:1:iron_chest');
    const after = viewHere(inspected.game)?.features.find((feature) => feature.id === chest?.id);
    expect(after?.trap_state ?? null).toBe(found ? 'found' : null);
  });

  it('lists a room trap only once the party knows about it, in an area it entered', async () => {
    const placed = await place(10, 3);
    expectRoomTrapsWithinKnowledge(placed, await referee.client.getRefereeState(tableId));
    const searched = await alice.client.sendCommand(tableId, {
      command_type: 'search',
      character_id: 'character-0002',
      kind: 'room_traps',
    });
    const state = await referee.client.getRefereeState(tableId);
    expectRoomTrapsWithinKnowledge(searched.game, state);
    const known = [
      ...(state.dungeon_state.found_traps ?? []),
      ...(state.dungeon_state.sprung_traps ?? []),
      ...(state.dungeon_state.removed_traps ?? []),
    ].includes('priory:1:scriptorium');
    expect(searched.game.scene.room_traps.some((trap) => trap.area_id === 'scriptorium')).toBe(known);
  });

  it('tells two caches of one room apart, and lists only the one the party emptied', async () => {
    const game = await place(27, 6, 2);
    const caches = (viewHere(game)?.features ?? []).filter(
      (feature) => feature.kind === 'treasure_cache' && feature.area_id === 'relic_vault',
    );
    expect(caches).toHaveLength(2);
    const chest = caches.find((feature) => /oak chest/.test(feature.description));
    const casket = caches.find((feature) => feature !== chest);
    const taken = await alice.client.sendCommand(tableId, {
      command_type: 'take_treasure',
      feature_id: chest?.id,
    });
    expect(taken.accepted).toBe(true);
    expect(taken.game.scene.emptied_features).toContain(chest?.id);
    expect(taken.game.scene.emptied_features).not.toContain(casket?.id);
  });

  it('never sends a player an unfound trap, the contents of an untaken cache, or a secret door', async () => {
    await alice.client.getGame(tableId);
    const texts = [...alice.received, ...aliceWs.messages.map((message) => JSON.stringify(message))];
    expect(findRefereeData(texts, HIDDEN)).toEqual([]);
  });
});

describe('emptied cache handles', () => {
  /** A level with two authored caches that look the same to the party. */
  const adventure = {
    dungeons: [
      {
        id: 'd',
        levels: [
          {
            number: 1,
            features: [],
            areas: [
              {
                id: 'vault',
                features: [
                  { id: 'left', kind: 'treasure_cache', description: 'A chest.', cell: null },
                  { id: 'right', kind: 'treasure_cache', description: 'A chest.', cell: null },
                ],
              },
            ],
          },
        ],
      },
    ],
  } as unknown as Adventure;

  const view = (emptied: string[]) =>
    ({
      emptied_caches: emptied,
      explored: [
        {
          dungeon_id: 'd',
          level_number: 1,
          features: [
            {
              id: 'feature:a',
              kind: 'treasure_cache',
              description: 'A chest.',
              cell: null,
              area_id: 'vault',
            },
            {
              id: 'feature:b',
              kind: 'treasure_cache',
              description: 'A chest.',
              cell: null,
              area_id: 'vault',
            },
          ],
        },
      ],
    }) as unknown as PlayerView;

  it('lists neither of two identical caches until both are emptied', () => {
    expect(emptiedFeatureHandles(view(['d:1:left']), adventure)).toEqual([]);
    expect(emptiedFeatureHandles(view(['d:1:left', 'd:1:right']), adventure)).toEqual([
      'feature:a',
      'feature:b',
    ]);
  });
});

describe('a generated cache', () => {
  it('appears after the encounter by its handle, and a player takes it by that handle', async () => {
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
      // While the goblins stand guard, the view shows no cache.
      expect(viewHere(met.game)?.features.filter((f) => f.kind === 'generated_cache')).toEqual([]);
      const ended = await referee.client.sendCommand(table.id, {
        command_type: 'end_encounter',
        outcome: 'departed',
        resolve_area: true,
      });
      expect(ended.accepted).toBe(true);
      const after = await alice.client.getGame(table.id);
      const cache = viewHere(after)?.features.find((f) => f.kind === 'generated_cache');
      expect(cache).toMatchObject({ cell: [2, 0] });
      expect(cache?.id).toMatch(/^feature:/);
      const taken = await alice.client.sendCommand(table.id, {
        command_type: 'take_treasure',
        feature_id: cache?.id,
      });
      expect(taken.accepted).toBe(true);
      expect(viewHere(taken.game)?.features.filter((f) => f.kind === 'generated_cache')).toEqual([]);
    } finally {
      await server.close();
    }
  });
});
