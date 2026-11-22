/**
 * Grid geometry shared by the model, the renderer, and hit testing.
 *
 * A cell `(x, y)` covers the world square from `(x, y)` to `(x + 1, y + 1)`, with `x` growing east
 * and `y` growing south, as in osrlib. One world unit is one cell, and a cell is 10 feet on a side.
 *
 * osrlib names every edge once, by the cell on its south or east side: `"{x},{y}:north"` is the
 * top side of cell `(x, y)`, and `"{x},{y}:west"` is its left side. The east side of `(0, 0)` is
 * therefore `"1,0:west"`.
 */

export type Direction = 'north' | 'east' | 'south' | 'west';

/** The side an osrlib edge key names. Only north and west sides appear in a key. */
export type EdgeSide = 'north' | 'west';

export type Cell = readonly [x: number, y: number];

export interface Point {
  x: number;
  y: number;
}

export interface ParsedEdgeKey {
  /** The key as osrlib writes it, like `"2,0:west"`. */
  key: string;
  /** The cell whose north or west side the edge is. */
  x: number;
  y: number;
  side: EdgeSide;
}

/** The feet on one side of a cell. */
export const CELL_FEET = 10;

export const DIRECTIONS: readonly Direction[] = ['north', 'east', 'south', 'west'];

export const DIRECTION_VECTORS: Readonly<Record<Direction, Cell>> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};

export const OPPOSITE: Readonly<Record<Direction, Direction>> = {
  north: 'south',
  east: 'west',
  south: 'north',
  west: 'east',
};

/** The angle of a facing in radians, measured clockwise from east, as canvas rotation expects. */
export const FACING_ANGLE: Readonly<Record<Direction, number>> = {
  east: 0,
  south: Math.PI / 2,
  west: Math.PI,
  north: -Math.PI / 2,
};

export function isDirection(value: unknown): value is Direction {
  return value === 'north' || value === 'east' || value === 'south' || value === 'west';
}

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function step(x: number, y: number, direction: Direction): Cell {
  const [dx, dy] = DIRECTION_VECTORS[direction];
  return [x + dx, y + dy];
}

/** The canonical osrlib key of one side of a cell, the same string from either neighbour. */
export function edgeKey(x: number, y: number, direction: Direction): string {
  switch (direction) {
    case 'south':
      return `${x},${y + 1}:north`;
    case 'east':
      return `${x + 1},${y}:west`;
    default:
      return `${x},${y}:${direction}`;
  }
}

const EDGE_KEY = /^(-?\d+),(-?\d+):(north|west|south|east)$/;

/**
 * Parses an edge key. It accepts the canonical north and west forms and also normalizes a south or
 * east key, which osrlib never writes but a hand-written fixture might.
 */
export function parseEdgeKey(key: string): ParsedEdgeKey | null {
  const match = EDGE_KEY.exec(key);
  if (!match) return null;
  const x = Number(match[1]);
  const y = Number(match[2]);
  const direction = match[3] as Direction;
  if (direction === 'north' || direction === 'west') return { key, x, y, side: direction };
  const canonical = edgeKey(x, y, direction);
  const parsed = EDGE_KEY.exec(canonical);
  if (!parsed) return null;
  return { key: canonical, x: Number(parsed[1]), y: Number(parsed[2]), side: parsed[3] as EdgeSide };
}

/** The two cells an edge separates: first the cell to the north or west, then the keyed cell. */
export function edgeCells(edge: Pick<ParsedEdgeKey, 'x' | 'y' | 'side'>): [Cell, Cell] {
  return edge.side === 'north'
    ? [
        [edge.x, edge.y - 1],
        [edge.x, edge.y],
      ]
    : [
        [edge.x - 1, edge.y],
        [edge.x, edge.y],
      ];
}

/** The edge's segment in world coordinates. */
export function edgeSegment(edge: Pick<ParsedEdgeKey, 'x' | 'y' | 'side'>): [Point, Point] {
  return edge.side === 'north'
    ? [
        { x: edge.x, y: edge.y },
        { x: edge.x + 1, y: edge.y },
      ]
    : [
        { x: edge.x, y: edge.y },
        { x: edge.x, y: edge.y + 1 },
      ];
}

/** Which side of `(x, y)` the edge lies on, or `null` when the edge isn't a side of that cell. */
export function sideOfCell(
  edge: Pick<ParsedEdgeKey, 'x' | 'y' | 'side'>,
  x: number,
  y: number,
): Direction | null {
  if (edge.x === x && edge.y === y) return edge.side;
  if (edge.side === 'north' && edge.x === x && edge.y === y + 1) return 'south';
  if (edge.side === 'west' && edge.x === x + 1 && edge.y === y) return 'east';
  return null;
}

/** The direction from one cell to an orthogonal neighbour, or `null` when they aren't neighbours. */
export function directionBetween(from: Cell, to: Cell): Direction | null {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (dx === 0 && dy === -1) return 'north';
  if (dx === 1 && dy === 0) return 'east';
  if (dx === 0 && dy === 1) return 'south';
  if (dx === -1 && dy === 0) return 'west';
  return null;
}

/** The `"{dungeon}:{level}"` key osrlib uses for `explored` and `seen`. */
export function levelKey(dungeonId: string, levelNumber: number): string {
  return `${dungeonId}:${levelNumber}`;
}

/** Splits a level key on its last colon, as osrlib does, so a dungeon id may contain colons. */
export function parseLevelKey(key: string): { dungeonId: string; levelNumber: number } | null {
  const at = key.lastIndexOf(':');
  if (at <= 0) return null;
  const levelNumber = Number(key.slice(at + 1));
  if (!Number.isInteger(levelNumber)) return null;
  return { dungeonId: key.slice(0, at), levelNumber };
}

/**
 * Reads the cell of a `"cell:{dungeon}:{level}:{x},{y}"` reference when it is on the given level,
 * and returns `null` otherwise.
 */
export function cellOfRef(ref: string, dungeonId: string, levelNumber: number): Cell | null {
  const prefix = `cell:${dungeonId}:${levelNumber}:`;
  if (!ref.startsWith(prefix)) return null;
  const match = /^(-?\d+),(-?\d+)$/.exec(ref.slice(prefix.length));
  if (!match) return null;
  return [Number(match[1]), Number(match[2])];
}

/**
 * Reads the id of a `"{dungeon}:{level}:{id}"` area or feature reference when it is on the given
 * level, and returns `null` otherwise.
 */
export function idOfRef(ref: string, dungeonId: string, levelNumber: number): string | null {
  const prefix = `${dungeonId}:${levelNumber}:`;
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : null;
}
