import type { PlayerView } from '@bxvtt/shared/protocol';
import { describe, expect, it } from 'vitest';
import { cachesToTake, partyHere, rolledTreasureNumbers, treasureRowText } from './here';
import { enteredArea, exploredLevel, mapFeature, pileView, playerView } from './testing/views';

/**
 * A hall of three cells with a side cell, and the party at `position`. The view lists in `features_here` what
 * bxapi says the party can reach from there.
 */
function viewAt(
  position: [number, number],
  featuresHere: string[],
  fields: Partial<PlayerView> = {},
): PlayerView {
  const level = exploredLevel({
    dungeon_id: 'priory',
    level_number: 1,
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ],
    areas: [
      enteredArea({
        id: 'hall',
        name: 'Hall',
        cells: [
          [0, 0],
          [1, 0],
          [2, 0],
        ],
        trap_state: 'found',
      }),
    ],
    features: [
      mapFeature({ id: 'feature:altar', description: 'An altar.', area_id: 'hall', emptied: true }),
      mapFeature({ id: 'feature:chest', description: 'A chest.', cell: [2, 0], area_id: 'hall' }),
      mapFeature({ id: 'feature:hoard', kind: 'generated_cache', cell: [3, 0] }),
      mapFeature({ id: 'feature:statue', kind: 'custom', description: 'A statue.', area_id: 'hall' }),
    ],
    transitions: [{ kind: 'stairs_down', position: [3, 0], side: null }],
    entrance: [0, 0],
  });
  return playerView({
    location: { kind: 'dungeon', dungeon_id: 'priory', level_number: 1, position, facing: 'east' },
    explored: [level],
    features_here: featuresHere,
    piles: { 'cell:priory:1:3,0': pileView({ coins_gp_value: 5 }) },
    ...fields,
  });
}

describe('partyHere', () => {
  it('lists the area’s features, and reaches the caches that features_here lists', () => {
    const here = partyHere(viewAt([0, 0], ['feature:altar']));
    expect(here?.area?.id).toBe('hall');
    expect(here?.caches.map((cache) => [cache.id, cache.inReach])).toEqual([
      ['feature:altar', true],
      ['feature:chest', false],
    ]);
    expect(here?.features.map((feature) => feature.id)).toEqual(['feature:statue']);
    const atChest = partyHere(viewAt([2, 0], ['feature:altar', 'feature:chest']));
    expect(atChest?.caches.find((cache) => cache.id === 'feature:chest')?.inReach).toBe(true);
  });

  it('marks emptied caches from the view, and leaves them and the caches out of reach out of what to take', () => {
    const here = partyHere(viewAt([2, 0], ['feature:altar', 'feature:chest']));
    expect(here?.caches.find((cache) => cache.id === 'feature:altar')?.emptied).toBe(true);
    expect(cachesToTake(here).map((cache) => cache.id)).toEqual(['feature:chest']);
    expect(cachesToTake(partyHere(viewAt([0, 0], ['feature:altar'])))).toEqual([]);
  });

  it('reaches nothing outside the exploring mode, when features_here is empty', () => {
    const here = partyHere(viewAt([2, 0], [], { mode: 'encounter' }));
    expect(here?.exploring).toBe(false);
    expect(here?.caches.every((cache) => !cache.inReach)).toBe(true);
  });

  it('states the room trap of the party’s area and the entrance', () => {
    const here = partyHere(viewAt([0, 0], []));
    expect(here?.roomTrap).toBe('found');
    expect(here?.atEntrance).toBe(true);
    expect(here?.pile).toBeNull();
  });

  it('outside an area, lists only what is on the cell: the rolled cache, the stairs, and the pile', () => {
    const here = partyHere(viewAt([3, 0], ['feature:hoard']));
    expect(here?.area).toBeNull();
    expect(here?.roomTrap).toBeNull();
    expect(here?.caches.map((cache) => [cache.id, cache.inReach])).toEqual([['feature:hoard', true]]);
    expect(here?.features).toEqual([]);
    expect(here?.transitions.map((transition) => transition.kind)).toEqual(['stairs_down']);
    expect(here?.pile?.coins_gp_value).toBe(5);
    expect(here?.atEntrance).toBe(false);
  });

  it('is null in town', () => {
    expect(partyHere(viewAt([0, 0], [], { location: { kind: 'town' } }))).toBeNull();
  });
});

describe('treasureRowText', () => {
  const chest = { id: 'a', description: 'An iron-bound chest.' };
  const first = { id: 'b', description: '' };
  const second = { id: 'c', description: '  ' };

  it('reads a treasure’s description, and names the one rolled treasure without a number', () => {
    expect(treasureRowText(chest, [chest, first])).toBe('An iron-bound chest.');
    expect(treasureRowText(first, [chest, first])).toBe('Treasure lies here.');
  });

  it('numbers the rolled treasures among themselves when two or more lie here', () => {
    const list = [first, chest, second];
    expect(treasureRowText(first, list)).toBe('Treasure 1 lies here.');
    expect(treasureRowText(second, list)).toBe('Treasure 2 lies here.');
    expect([...rolledTreasureNumbers(list)]).toEqual([
      ['b', 1],
      ['c', 2],
    ]);
  });
});
