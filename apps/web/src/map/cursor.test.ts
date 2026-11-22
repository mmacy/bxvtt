import { describe, expect, it } from 'vitest';
import {
  cursorCell,
  cursorEdge,
  cycleSide,
  describeCursor,
  measurementText,
  moveCursor,
  positionPhrase,
  startCursor,
} from './cursor';
import { fixture, fixtureLevel } from './fixtures/fixtures';
import { fromPlayerView, fromRefereeView } from './model';
import { measure } from './overlays';
import { Scene } from './scene';

const explored = fixture('showcase-explored');
const referee = new Scene(
  fromRefereeView(fixtureLevel(explored, 'vault', 1), explored.referee.dungeon_state, { dungeonId: 'vault' }),
);
const playerMap = fromPlayerView(explored.view);
if (!playerMap) throw new Error('no player map');
const player = new Scene(playerMap);

describe('the keyboard cursor', () => {
  it('starts on the party, moves a cell at a time, and turns through the sides', () => {
    const start = startCursor({ x: 16, y: 15, facing: 'south' }, { x: 0, y: 0 }, player);
    expect(start).toMatchObject({ x: 16, y: 15 });
    expect(moveCursor(start, 'north')).toMatchObject({ x: 16, y: 14 });
    expect(cycleSide('north')).toBe('east');
    expect(cycleSide('west')).toBe('north');
    expect(cycleSide('north', true)).toBe('west');
  });

  it('starts at the centre of the screen when the party is elsewhere', () => {
    expect(startCursor(null, { x: 4.7, y: 9.2 }, null)).toEqual({ x: 4, y: 9, side: 'north' });
  });

  it('reports the cell and the side as a click would, with the party side of a door', () => {
    expect(cursorCell(player, { x: 16, y: 16, side: 'north' })).toMatchObject({
      kind: 'cell',
      floor: true,
      direction: 'south',
    });
    // The wedged door between 16,8 and 16,9, from the cell below it.
    const door = cursorEdge(referee, { x: 16, y: 9, side: 'north' });
    expect(door).toMatchObject({ kind: 'edge', side: 'north', cell: { x: 16, y: 9 } });
    expect(door?.edge.key).toBe('16,9:north');
    // From the party's own cell, the side is the party's side.
    expect(cursorEdge(player, { x: 16, y: 15, side: 'west' })?.direction).toBe('west');
    expect(cursorEdge(player, { x: 40, y: 40, side: 'west' })).toBeNull();
  });
});

describe('cursor announcements', () => {
  it('places a cell relative to the party', () => {
    const party = { x: 10, y: 10, facing: 'north' as const };
    expect(positionPhrase(10, 10, party)).toBe("the party's square");
    expect(positionPhrase(13, 8, party)).toBe('2 squares north and 3 squares east of the party');
    expect(positionPhrase(10, 11, party)).toBe('1 square south of the party');
    expect(positionPhrase(4, 5, null)).toBe('square 4, 5');
  });

  it('names the area, the side, and the next step for each tool', () => {
    expect(describeCursor(referee, { x: 15, y: 3, side: 'north' }, 'pick-cell')).toBe(
      'Guard post, 12 squares north and 1 square west of the party. Press Enter to choose this square, or Escape to stop.',
    );
    expect(describeCursor(referee, { x: 26, y: 8, side: 'north' }, 'pick-edge')).toMatch(
      /^North side: a door, closed, locked, stuck\. A corridor, .* Press E for the next side, Enter to choose it, or Escape to stop\.$/,
    );
    expect(describeCursor(referee, { x: 24, y: 17, side: 'west' }, 'pick-edge')).toMatch(
      /^West side: a secret door, not found\./,
    );
    expect(describeCursor(player, { x: 30, y: 2, side: 'north' }, 'pin')).toMatch(
      /^Unexplored, .* Press Enter to place a pin here\.$/,
    );
  });

  it('says the measurement in words while the ruler runs', () => {
    const m = measure({ x: 16.5, y: 15.5 }, { x: 16.5, y: 9.5 });
    expect(measurementText(m)).toBe('6 squares, 60 feet');
    expect(measurementText(measure({ x: 0, y: 0 }, { x: 1.5, y: 0 }))).toBe('1 square, 10 feet');
    expect(describeCursor(player, { x: 16, y: 9, side: 'north' }, 'ruler', m)).toMatch(
      /^6 squares, 60 feet\. .* Press Enter to keep the measurement, or Escape to stop\.$/,
    );
  });
});
