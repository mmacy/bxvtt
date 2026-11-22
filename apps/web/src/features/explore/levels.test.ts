import type { Scene } from '@bxvtt/shared/protocol';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { areaCenterCell, buildPlayerLevel, levelOptions, refereeSource, sceneExtras } from './levels';

function exploring() {
  const snapshot = fixtureSnapshot('exploring', 'player');
  const game = snapshot.game;
  if (game === null) throw new Error('The fixture has no game.');
  return game;
}

describe('sceneExtras', () => {
  it('puts the scene’s stairs, caches, and features on the map, and an area-wide one at the area’s middle', () => {
    const level: Scene['levels'][number] = {
      dungeon_id: 'priory',
      level_number: 1,
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
      transitions: [{ kind: 'stairs_down', position: [2, 0], side: null, leads: 'down' }],
      traps: [],
      caches: [
        { id: 'chest', source: 'authored', area_id: 'hall', position: null, reachable: true, trap: null },
      ],
      features: [{ id: 'statue', kind: 'custom', description: 'A statue.', area_id: null, position: [0, 0] }],
      piles: [],
    };
    const extras = sceneExtras(level);
    expect(extras.transitions).toEqual([{ kind: 'stairs_down', x: 2, y: 0, side: null }]);
    expect(extras.features).toEqual([
      expect.objectContaining({ id: 'chest', kind: 'cache', x: 1, y: 0 }),
      expect.objectContaining({ id: 'statue', kind: 'custom', x: 0, y: 0, description: 'A statue.' }),
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
    expect(map?.features.map((feature) => feature.id)).toContain('fallen_statue');
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
