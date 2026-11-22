import { describe, expect, it } from 'vitest';
import { fixture, fixtureLevel } from './fixtures/fixtures';
import { hitTest, sameTarget } from './hit';
import { fromPlayerView, fromRefereeView } from './model';
import { Scene } from './scene';

const explored = fixture('showcase-explored');
const refereeScene = new Scene(
  fromRefereeView(fixtureLevel(explored, 'vault', 1), explored.referee.dungeon_state, { dungeonId: 'vault' }),
);
const playerMap = fromPlayerView(explored.view);
if (!playerMap) throw new Error('no player map');
const playerScene = new Scene(playerMap);
const zoom = 40;

describe('hitTest', () => {
  it('reports the direction of a cell next to the party, which stands at 16,15', () => {
    expect(hitTest(playerScene, { x: 16.5, y: 16.5 }, { zoom })).toMatchObject({
      kind: 'cell',
      x: 16,
      y: 16,
      direction: 'south',
    });
    expect(hitTest(playerScene, { x: 16.5, y: 14.5 }, { zoom })).toMatchObject({
      kind: 'cell',
      direction: 'north',
    });
    expect(hitTest(playerScene, { x: 18.5, y: 15.5 }, { zoom })).toMatchObject({
      kind: 'cell',
      direction: null,
    });
  });

  it('reports an unknown neighbour as a cell that isn’t floor, still with its direction', () => {
    const target = hitTest(playerScene, { x: 15.5, y: 15.5 }, { zoom });
    expect(target).toMatchObject({ kind: 'cell', floor: false, known: false, direction: 'west' });
  });

  it('hits the party token, and a pin before anything else', () => {
    expect(hitTest(playerScene, { x: 16.55, y: 15.45 }, { zoom })?.kind).toBe('party');
    const pins = [{ id: 'p', x: 16.5, y: 15.5, label: '1' }];
    expect(hitTest(playerScene, { x: 16.5, y: 15.5 - 14 / zoom }, { zoom, pins })).toMatchObject({
      kind: 'pin',
    });
  });

  it('hits a door near its edge and reports the party side when the party stands next to it', () => {
    // The wedged door between 16,8 and 16,9.
    const door = hitTest(refereeScene, { x: 16.5, y: 9.05 }, { zoom });
    expect(door).toMatchObject({ kind: 'edge', side: 'north', cell: { x: 16, y: 9 } });
    if (door?.kind === 'edge') expect(door.edge.key).toBe('16,9:north');
    // A wall is not a click target in the default mode.
    expect(hitTest(refereeScene, { x: 14.5, y: 9.04 }, { zoom })?.kind).toBe('cell');
  });

  it('picks any edge in pick-edge mode and only cells in pick-cell mode', () => {
    const wall = hitTest(refereeScene, { x: 14.5, y: 9.2 }, { zoom, mode: 'edge' });
    expect(wall).toMatchObject({ kind: 'edge', side: 'north' });
    if (wall?.kind === 'edge') expect(wall.edge.kind).toBe('wall');
    expect(hitTest(refereeScene, { x: 16.5, y: 9.05 }, { zoom, mode: 'cell' })?.kind).toBe('cell');
  });

  it('hits features and stairs in their cells', () => {
    expect(hitTest(refereeScene, { x: 6.5, y: 3.5 }, { zoom })).toMatchObject({
      kind: 'feature',
      feature: { id: 'offering_bowl' },
    });
    expect(hitTest(refereeScene, { x: 26.5, y: 17.5 }, { zoom })).toMatchObject({
      kind: 'transition',
      transition: { kind: 'stairs_down' },
    });
  });
});

describe('sameTarget', () => {
  it('compares by identity of the thing, not the object', () => {
    const a = hitTest(refereeScene, { x: 3.5, y: 9.5 }, { zoom });
    const b = hitTest(refereeScene, { x: 3.6, y: 9.6 }, { zoom });
    expect(sameTarget(a, b)).toBe(true);
    expect(sameTarget(a, hitTest(refereeScene, { x: 4.5, y: 9.5 }, { zoom }))).toBe(false);
  });
});
