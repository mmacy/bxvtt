import { describe, expect, it } from 'vitest';
import { describeTarget, refereeNotesLine } from './describe';
import { fixture, fixtureLevel } from './fixtures/fixtures';
import { fromPlayerView, fromRefereeView, type LevelMap, type MapFeature, type MapTransition } from './model';

const explored = fixture('showcase-explored');
const refereeMap = fromRefereeView(fixtureLevel(explored, 'vault', 1), explored.referee.dungeon_state, {
  dungeonId: 'vault',
});
const playerMap = ((): LevelMap => {
  const map = fromPlayerView(explored.view);
  if (!map) throw new Error('No player map.');
  return map;
})();

function feature(fields: Partial<MapFeature>): MapFeature {
  return {
    id: 'chest',
    kind: 'cache',
    x: 0,
    y: 0,
    areaWide: false,
    areaId: null,
    description: '',
    emptied: false,
    found: null,
    trap: null,
    contents: [],
    refereeNotes: null,
    known: true,
    ...fields,
  };
}

const describeFeature = (f: MapFeature, map: LevelMap) =>
  describeTarget({ kind: 'feature', feature: f }, map);

describe('the feature tooltip', () => {
  it('shows the referee what a cache holds and the start of the referee notes, last before the unseen line', () => {
    const notes = 'The chest is false-bottomed. '.repeat(6).trim();
    const chest = feature({
      description: 'An iron-bound chest.',
      contents: ['40 gp', 'a dagger'],
      refereeNotes: notes,
      known: false,
    });
    expect(describeFeature(chest, refereeMap)).toEqual({
      title: 'Treasure',
      lines: [
        'An iron-bound chest.',
        'Holds: 40 gp, a dagger',
        `Referee notes: ${notes.slice(0, 120).trimEnd()}…`,
        'Unseen by the party.',
      ],
    });
  });

  it('leaves out an empty referee notes line', () => {
    expect(refereeNotesLine('')).toBeNull();
    expect(refereeNotesLine('  ')).toBeNull();
    expect(refereeNotesLine('Short.')).toBe('Referee notes: Short.');
  });

  it('shows a pile the same on both layers: its title, then one capitalized line per entry', () => {
    const pile = feature({
      id: 'pile@0,0',
      kind: 'pile',
      contents: ['10 gold pieces', 'a set of thieves’ tools', 'a torch'],
    });
    const expected = {
      title: 'Dropped goods',
      lines: ['10 gold pieces', 'A set of thieves’ tools', 'A torch'],
    };
    expect(describeFeature(pile, playerMap)).toEqual(expected);
    expect(describeFeature(pile, refereeMap)).toEqual(expected);
  });

  it('titles an emptied cache as treasure, says it is emptied, and drops its trap on both layers', () => {
    const trap = { state: 'found' as const, trigger: 'open' as const, summary: '1d6 damage' };
    const chest = feature({
      description: 'A heavy hasp holds the lid shut.',
      emptied: true,
      trap,
      contents: ['40 gp'],
      refereeNotes: 'The key is in the well.',
    });
    expect(
      describeFeature(
        { ...chest, contents: [], refereeNotes: null, trap: { ...trap, trigger: null } },
        playerMap,
      ),
    ).toEqual({
      title: 'Treasure',
      lines: ['A heavy hasp holds the lid shut.', 'Emptied.'],
    });
    expect(describeFeature(chest, refereeMap)).toEqual({
      title: 'Treasure',
      lines: [
        'A heavy hasp holds the lid shut.',
        'Holds: 40 gp',
        'Emptied.',
        'Referee notes: The key is in the well.',
      ],
    });
  });

  it('never shows a player a referee notes line', () => {
    const chest = feature({ description: 'A chest.', refereeNotes: 'Holds the key.' });
    expect(describeFeature(chest, playerMap)?.lines).toEqual(['A chest.']);
  });

  it('names a construction trick for the referee, and only something odd for the players', () => {
    expect(describeFeature(feature({ kind: 'trick', found: false }), refereeMap)?.title).toBe(
      'Construction trick, not found',
    );
    expect(describeFeature(feature({ kind: 'trick', found: true }), refereeMap)?.title).toBe(
      'Construction trick',
    );
    expect(describeFeature(feature({ kind: 'trick', found: true }), playerMap)?.title).toBe('Something odd');
  });
});

describe('gated ways', () => {
  const stairs: MapTransition = {
    id: 'stairs_down@0,0',
    kind: 'stairs_down',
    x: 0,
    y: 0,
    side: null,
    to: null,
    gated: true,
    known: true,
  };

  it('tells the referee a gate opens on its condition', () => {
    expect(describeTarget({ kind: 'transition', transition: stairs }, refereeMap)?.lines).toEqual([
      'Opens only when its condition is met.',
    ]);
  });

  it('says a gated door opens only on its condition', () => {
    const door = {
      open: false,
      wedged: false,
      locked: false,
      unlocked: false,
      stuck: false,
      secret: false,
      discovered: null,
      gated: true,
    };
    const target = (map: LevelMap) =>
      describeTarget(
        {
          kind: 'edge',
          edge: { key: '0,0:north', x: 0, y: 0, side: 'north', kind: 'door', door },
          cell: { x: 0, y: 0 },
          side: 'north',
          direction: null,
        },
        map,
      );
    expect(target(refereeMap)?.lines).toEqual(['Closed, opens only when its condition is met.']);
  });
});
