import type { ExploredLevelView } from '@bxvtt/shared/bxapi';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import {
  areaCenterCell,
  buildPlayerLevel,
  levelOptions,
  refereeSource,
  viewExtras,
  wanderingTableName,
} from './levels';

function exploring() {
  const snapshot = fixtureSnapshot('exploring', 'player');
  const game = snapshot.game;
  if (game === null) throw new Error('The fixture has no game.');
  return game;
}

describe('viewExtras', () => {
  it('puts the view’s stairs and features on the map, an area-wide one at the area’s middle, and marks emptied caches', () => {
    const level: ExploredLevelView = {
      dungeon_id: 'priory',
      level_number: 1,
      cells: [],
      edges: {},
      areas: [
        {
          id: 'hall',
          name: 'Hall',
          description: '',
          cells: [
            [0, 0],
            [1, 0],
            [2, 0],
          ],
        },
      ],
      transitions: [{ kind: 'stairs_down', position: [2, 0], side: null }],
      features: [
        {
          id: 'feature:chest',
          kind: 'treasure_cache',
          description: 'A chest.',
          cell: null,
          area_id: 'hall',
          trap_state: null,
        },
        {
          id: 'feature:statue',
          kind: 'custom',
          description: 'A statue.',
          cell: [0, 0],
          area_id: null,
          trap_state: null,
        },
      ],
    };
    const extras = viewExtras(level, new Set(['feature:chest']));
    expect(extras.transitions).toEqual([{ kind: 'stairs_down', x: 2, y: 0, side: null }]);
    expect(extras.features).toEqual([
      expect.objectContaining({ id: 'feature:chest', kind: 'cache', x: 1, y: 0, emptied: true }),
      expect.objectContaining({ id: 'feature:statue', kind: 'custom', x: 0, y: 0, description: 'A statue.' }),
    ]);
  });
});

describe('areaCenterCell', () => {
  it('picks the cell nearest the middle of the area', () => {
    expect(
      areaCenterCell({
        cells: [
          [0, 0],
          [1, 0],
          [2, 0],
          [1, 1],
        ],
      }),
    ).toEqual([1, 0]);
    expect(areaCenterCell({ cells: [] })).toBeNull();
  });
});

describe('buildPlayerLevel', () => {
  it('builds the party’s level from the player view and the scene', () => {
    const game = exploring();
    const map = buildPlayerLevel(game.view, game.scene, 'priory:1');
    expect(map?.layer).toBe('player');
    expect(map?.party).toEqual({ x: 14, y: 22, facing: 'north' });
    // The fallen statue is a feature of the whole area, so it sits at the area's middle.
    const statue = game.view.explored[0]?.features.find((feature) => feature.kind === 'custom');
    const area = game.view.explored[0]?.areas.find((a) => a.id === statue?.area_id);
    const middle = area ? areaCenterCell(area) : null;
    expect(statue?.cell).toBeNull();
    expect(middle).not.toBeNull();
    expect(map?.features).toContainEqual(
      expect.objectContaining({
        id: statue?.id,
        kind: 'custom',
        x: middle?.[0],
        y: middle?.[1],
        description: expect.stringMatching(/Saint Corvane/),
      }),
    );
  });

  it('marks a door the table learned is locked', () => {
    const game = exploring();
    const view = structuredClone(game.view);
    const level = view.explored[0];
    if (!level) throw new Error('No explored level.');
    level.edges['14,22:north'] = { kind: 'door', door_open: false, door_wedged: false };
    const map = buildPlayerLevel(view, game.scene, 'priory:1', { 'priory:1:14,22:north': { locked: true } });
    const door = map?.edges.find((edge) => edge.key === '14,22:north')?.door;
    expect(door?.locked).toBe(true);
    expect(door?.stuck).toBeNull();
  });

  it('marks the entrance and names the entered areas from the player view', () => {
    const game = exploring();
    const map = buildPlayerLevel(game.view, game.scene, 'priory:1');
    expect(map?.entrance).toEqual([14, 23]);
    expect(map?.areas.map((area) => area.name)).toEqual(['Gatehouse stair']);
  });

  it('shows the trap state the party knows on a cache, without a trigger', () => {
    const game = exploring();
    const view = structuredClone(game.view);
    const level = view.explored[0];
    if (!level) throw new Error('No explored level.');
    level.features.push({
      id: 'feature:chest',
      kind: 'treasure_cache',
      description: '',
      cell: [14, 22],
      area_id: null,
      trap_state: 'found',
    });
    const map = buildPlayerLevel(view, game.scene, 'priory:1');
    expect(map?.features.find((feature) => feature.id === 'feature:chest')?.trap).toEqual({
      state: 'found',
      trigger: null,
      summary: 'Treasure trap',
    });
  });

  it('returns null for a level the party hasn’t mapped', () => {
    const game = exploring();
    expect(buildPlayerLevel(game.view, game.scene, 'priory:3')).toBeNull();
  });
});

describe('levelOptions', () => {
  it('lists the levels on the party’s map for a player, and marks the party’s level', () => {
    const game = exploring();
    expect(levelOptions(game.view, null)).toEqual([
      { key: 'priory:1', dungeonId: 'priory', levelNumber: 1, partyHere: true },
    ]);
  });
});

describe('refereeSource', () => {
  it('needs both the referee state and an adventure document with dungeons', () => {
    const referee = fixtureSnapshot('exploring', 'referee').game?.referee ?? null;
    expect(refereeSource(referee, null)).toBeNull();
    expect(refereeSource(referee, { name: 'No dungeons' })).toBeNull();
    expect(refereeSource(null, { dungeons: [] })).toBeNull();
    expect(refereeSource(referee, { dungeons: [] })?.adventure.dungeons).toEqual([]);
  });
});

describe('wanderingTableName', () => {
  it('names the level’s own wandering monster table from the adventure', () => {
    const document = {
      dungeons: [
        { id: 'priory', levels: [{ number: 1, wandering: { table: { label: 'Priory undercroft' } } }] },
      ],
    };
    expect(wanderingTableName(document, 'priory', 1)).toBe('Priory undercroft');
    expect(wanderingTableName(document, 'priory', 2)).toBeNull();
    expect(wanderingTableName(null, 'priory', 1)).toBeNull();
  });
});
