import type { ExploredLevelView } from '@bxvtt/shared/bxapi';
import type { PlayerView, Scene } from '@bxvtt/shared/protocol';
import { describe, expect, it } from 'vitest';
import { cachesToTake, partyHere } from './here';

/** A hall of three cells with a side room, and the party at `position`. */
function viewAt(position: [number, number]): PlayerView {
  const level: ExploredLevelView = {
    dungeon_id: 'priory',
    level_number: 1,
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ],
    edges: {},
    areas: [
      {
        id: 'hall',
        name: 'Hall',
        description: 'A long hall.',
        cells: [
          [0, 0],
          [1, 0],
          [2, 0],
        ],
      },
    ],
    features: [
      { id: 'feature:altar', kind: 'treasure_cache', description: 'An altar.', cell: null, area_id: 'hall' },
      { id: 'feature:chest', kind: 'treasure_cache', description: 'A chest.', cell: [2, 0], area_id: 'hall' },
      { id: 'feature:hoard', kind: 'generated_cache', description: '', cell: [3, 0], area_id: null },
      { id: 'feature:statue', kind: 'custom', description: 'A statue.', cell: null, area_id: 'hall' },
    ],
    transitions: [{ kind: 'stairs_down', position: [3, 0], side: null }],
    entrance: [0, 0],
  };
  return {
    location: { kind: 'dungeon', dungeon_id: 'priory', level_number: 1, position, facing: 'east' },
    explored: [level],
    piles: { 'cell:priory:1:3,0': { items: [], coins_gp_value: 5 } },
  } as unknown as PlayerView;
}

const scene: Scene = {
  names: {},
  room_traps: [{ dungeon_id: 'priory', level_number: 1, area_id: 'hall', state: 'found' }],
  emptied_features: ['feature:altar'],
};

describe('partyHere', () => {
  it('lists the area’s features, and reaches an area-wide one from any cell but a placed one only from its cell', () => {
    const here = partyHere(viewAt([0, 0]), scene);
    expect(here?.area?.id).toBe('hall');
    expect(here?.caches.map((cache) => [cache.id, cache.reachable])).toEqual([
      ['feature:altar', true],
      ['feature:chest', false],
    ]);
    expect(here?.features.map((feature) => feature.id)).toEqual(['feature:statue']);
    expect(
      partyHere(viewAt([2, 0]), scene)?.caches.find((cache) => cache.id === 'feature:chest')?.reachable,
    ).toBe(true);
  });

  it('marks the caches the scene lists as emptied, and leaves them out of what to take', () => {
    const here = partyHere(viewAt([0, 0]), scene);
    expect(here?.caches.find((cache) => cache.id === 'feature:altar')?.emptied).toBe(true);
    expect(cachesToTake(here).map((cache) => cache.id)).toEqual(['feature:chest']);
  });

  it('states the room trap of the party’s area and the entrance', () => {
    const here = partyHere(viewAt([0, 0]), scene);
    expect(here?.roomTrap?.state).toBe('found');
    expect(here?.atEntrance).toBe(true);
    expect(here?.pile).toBe(false);
  });

  it('outside an area, lists only what is on the cell: the rolled cache, the stairs, and the pile', () => {
    const here = partyHere(viewAt([3, 0]), scene);
    expect(here?.area).toBeNull();
    expect(here?.roomTrap).toBeNull();
    expect(here?.caches.map((cache) => [cache.id, cache.reachable])).toEqual([['feature:hoard', true]]);
    expect(here?.features).toEqual([]);
    expect(here?.transitions.map((transition) => transition.kind)).toEqual(['stairs_down']);
    expect(here?.pile).toBe(true);
    expect(here?.atEntrance).toBe(false);
  });

  it('is null in town', () => {
    const view = { ...viewAt([0, 0]), location: { kind: 'town' } } as unknown as PlayerView;
    expect(partyHere(view, scene)).toBeNull();
  });
});
