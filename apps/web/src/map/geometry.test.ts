import { describe, expect, it } from 'vitest';
import {
  cellOfRef,
  directionBetween,
  edgeCells,
  edgeKey,
  edgeSegment,
  idOfRef,
  parseEdgeKey,
  parseLevelKey,
  sideOfCell,
} from './geometry';

describe('edge keys', () => {
  it('names each edge once, by its north or west side, as osrlib does', () => {
    expect(edgeKey(0, 0, 'east')).toBe('1,0:west');
    expect(edgeKey(1, 0, 'west')).toBe('1,0:west');
    expect(edgeKey(2, 3, 'south')).toBe('2,4:north');
    expect(edgeKey(2, 4, 'north')).toBe('2,4:north');
  });

  it('parses canonical keys and normalizes south and east keys', () => {
    expect(parseEdgeKey('2,0:west')).toEqual({ key: '2,0:west', x: 2, y: 0, side: 'west' });
    expect(parseEdgeKey('0,0:east')).toEqual({ key: '1,0:west', x: 1, y: 0, side: 'west' });
    expect(parseEdgeKey('5,5:south')).toEqual({ key: '5,6:north', x: 5, y: 6, side: 'north' });
    expect(parseEdgeKey('nonsense')).toBeNull();
    expect(parseEdgeKey('1,2:up')).toBeNull();
  });

  it('finds the cells on each side and the segment in world space', () => {
    const west = { x: 2, y: 0, side: 'west' as const };
    expect(edgeCells(west)).toEqual([
      [1, 0],
      [2, 0],
    ]);
    expect(edgeSegment(west)).toEqual([
      { x: 2, y: 0 },
      { x: 2, y: 1 },
    ]);
    const north = { x: 3, y: 4, side: 'north' as const };
    expect(edgeCells(north)).toEqual([
      [3, 3],
      [3, 4],
    ]);
  });

  it('tells which side of a cell an edge is', () => {
    const edge = { x: 2, y: 0, side: 'west' as const };
    expect(sideOfCell(edge, 2, 0)).toBe('west');
    expect(sideOfCell(edge, 1, 0)).toBe('east');
    expect(sideOfCell(edge, 3, 0)).toBeNull();
    expect(sideOfCell({ x: 4, y: 5, side: 'north' }, 4, 4)).toBe('south');
  });
});

describe('neighbours and references', () => {
  it('gives the direction between orthogonal neighbours only', () => {
    expect(directionBetween([3, 3], [3, 2])).toBe('north');
    expect(directionBetween([3, 3], [4, 3])).toBe('east');
    expect(directionBetween([3, 3], [4, 4])).toBeNull();
    expect(directionBetween([3, 3], [3, 3])).toBeNull();
  });

  it('reads level keys, cell references, and feature references', () => {
    expect(parseLevelKey('crypt:1')).toEqual({ dungeonId: 'crypt', levelNumber: 1 });
    expect(parseLevelKey('a:b:2')).toEqual({ dungeonId: 'a:b', levelNumber: 2 });
    expect(parseLevelKey('crypt')).toBeNull();
    expect(cellOfRef('cell:vault:1:6,9', 'vault', 1)).toEqual([6, 9]);
    expect(cellOfRef('cell:vault:2:6,9', 'vault', 1)).toBeNull();
    expect(idOfRef('vault:1:offering_bowl', 'vault', 1)).toBe('offering_bowl');
    expect(idOfRef('vault:12:x', 'vault', 1)).toBeNull();
  });
});
