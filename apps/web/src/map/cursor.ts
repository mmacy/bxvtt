/**
 * The keyboard cursor: a highlighted cell (or a side of a cell) that the arrow keys move in the tools that pick a
 * place, so the keyboard can do what a click does. This module holds the pure parts: moving the cursor, finding
 * its target, and the sentence a screen reader hears, which names what lies on the cell in the hover tooltip's words.
 */
import { describeTarget, doorSummary, type TargetDescription } from './describe';
import { DIRECTIONS, cellKey, directionBetween, step, type Direction } from './geometry';
import type { CellTarget, EdgeTarget } from './hit';
import type { MapParty, MapEdge } from './model';
import type { MapTool, Measurement } from './overlays';
import type { Scene } from './scene';
import { UNKEYED_PLACE_TITLE } from '@/app/places';

/** The tools that show a keyboard cursor while the map has keyboard focus. */
export type CursorTool = 'pick-cell' | 'pick-edge' | 'pin' | 'ping' | 'ruler';

export interface KeyboardCursor {
  x: number;
  y: number;
  /** The side the pick-an-edge tool points at. */
  side: Direction;
}

export function isCursorTool(tool: MapTool): tool is CursorTool {
  return (
    tool === 'pick-cell' || tool === 'pick-edge' || tool === 'pin' || tool === 'ping' || tool === 'ruler'
  );
}

/** Where the cursor starts: the party's cell, or the cell at the centre of the screen. */
export function startCursor(
  party: MapParty | null,
  centre: { x: number; y: number },
  scene: Scene | null,
): KeyboardCursor {
  const x = party ? party.x : Math.floor(centre.x);
  const y = party ? party.y : Math.floor(centre.y);
  // Point at a door of the starting cell when it has one, since doors are what the edge tool is for.
  const door = scene ? DIRECTIONS.find((d) => scene.edgeAt(x, y, d)?.kind === 'door') : undefined;
  return { x, y, side: door ?? party?.facing ?? 'north' };
}

export function moveCursor(cursor: KeyboardCursor, direction: Direction): KeyboardCursor {
  const [x, y] = step(cursor.x, cursor.y, direction);
  return { ...cursor, x, y };
}

/** The next side clockwise, or anticlockwise with `reverse`. */
export function cycleSide(side: Direction, reverse = false): Direction {
  const i = DIRECTIONS.indexOf(side);
  return DIRECTIONS[(i + (reverse ? 3 : 1)) % 4] ?? 'north';
}

/** The cell target under the cursor, as a click with the pick-a-cell tool reports it. */
export function cursorCell(scene: Scene, cursor: KeyboardCursor): CellTarget {
  const { x, y } = cursor;
  const areaIndex = scene.areaAt(x, y);
  const party = scene.map.party;
  return {
    kind: 'cell',
    x,
    y,
    known: scene.isKnown(x, y),
    floor: scene.isFloor(x, y),
    areaId: areaIndex >= 0 ? (scene.map.areas[areaIndex]?.id ?? null) : null,
    direction: party ? directionBetween([party.x, party.y], [x, y]) : null,
  };
}

/** The edge target under the cursor, or `null` when the map knows nothing of that side. */
export function cursorEdge(scene: Scene, cursor: KeyboardCursor): EdgeTarget | null {
  const edge = scene.edgeAt(cursor.x, cursor.y, cursor.side);
  if (!edge) return null;
  const party = scene.map.party;
  let direction: Direction | null = null;
  if (party) {
    if (party.x === cursor.x && party.y === cursor.y) direction = cursor.side;
    else {
      const [nx, ny] = step(cursor.x, cursor.y, cursor.side);
      if (party.x === nx && party.y === ny)
        direction = DIRECTIONS[(DIRECTIONS.indexOf(cursor.side) + 2) % 4] ?? null;
    }
  }
  return { kind: 'edge', edge, cell: { x: cursor.x, y: cursor.y }, side: cursor.side, direction };
}

function squares(n: number): string {
  return n === 1 ? '1 square' : `${n} squares`;
}

/** Where a cell is, from the party: "2 squares north and 3 squares east of the party". */
export function positionPhrase(x: number, y: number, party: MapParty | null): string {
  if (!party) return `square ${x}, ${y}`;
  const dx = x - party.x;
  const dy = y - party.y;
  if (dx === 0 && dy === 0) return "the party's square";
  const parts: string[] = [];
  if (dy !== 0) parts.push(`${squares(Math.abs(dy))} ${dy < 0 ? 'north' : 'south'}`);
  if (dx !== 0) parts.push(`${squares(Math.abs(dx))} ${dx < 0 ? 'west' : 'east'}`);
  return `${parts.join(' and ')} of the party`;
}

/** What a cell is: an area's name, the name for an unkeyed place, or unexplored. */
function placePhrase(scene: Scene, x: number, y: number): string {
  const referee = scene.map.layer === 'referee';
  if (!scene.isFloor(x, y)) return referee ? 'Solid rock' : 'Unexplored';
  const area = scene.map.areas[scene.areaAt(x, y)];
  const name = area ? area.name || 'Unnamed area' : UNKEYED_PLACE_TITLE;
  return referee && !scene.isKnown(x, y) ? `${name}, not yet seen by the party` : name;
}

function edgePhrase(edge: MapEdge | undefined): string {
  if (!edge) return 'unexplored';
  switch (edge.kind) {
    case 'wall':
      return 'a wall';
    case 'open':
      return 'an opening';
    case 'passage':
      return 'a passage';
    case 'door': {
      const door = edge.door;
      if (!door) return 'a door';
      if (door.secret && door.discovered === false) return 'a secret door, undiscovered';
      return `${door.secret ? 'a secret door' : 'a door'}, ${doorSummary(door)}`;
    }
  }
}

/** A tooltip's title and lines as spoken sentences, each ending in a full stop. */
function spoken(description: TargetDescription): string {
  return [description.title, ...description.lines]
    .map((text) => text.trim())
    .filter((text) => text !== '')
    .map((text) => (/[.!?…]$/.test(text) ? text : `${text}.`))
    .join(' ');
}

/**
 * What lies on a cell, in the words of the hover tooltip for each thing: the treasure, dropped goods, and other
 * features, then the stairs, trapdoor, or chute. An empty string when the cell holds none of them.
 */
export function cellContents(scene: Scene, x: number, y: number): string {
  const key = cellKey(x, y);
  const descriptions = [
    ...(scene.featuresByCell.get(key) ?? []).map((feature) =>
      describeTarget({ kind: 'feature', feature }, scene.map),
    ),
    ...(scene.transitionsByCell.get(key) ?? [])
      .filter((transition) => transition.kind !== 'passage')
      .map((transition) => describeTarget({ kind: 'transition', transition }, scene.map)),
  ];
  return descriptions.flatMap((description) => (description ? [spoken(description)] : [])).join(' ');
}

/** The measurement in words, such as "6 squares, 60 feet". */
export function measurementText(m: Measurement): string {
  return `${squares(m.squares)}, ${m.feet} feet`;
}

/** The sentence a screen reader hears when the cursor moves or the tool changes. */
export function describeCursor(
  scene: Scene,
  cursor: KeyboardCursor,
  tool: CursorTool,
  measurement: Measurement | null = null,
): string {
  const party = scene.map.party;
  const contents = cellContents(scene, cursor.x, cursor.y);
  const where = `${placePhrase(scene, cursor.x, cursor.y)}, ${positionPhrase(cursor.x, cursor.y, party)}.${contents ? ` ${contents}` : ''}`;
  switch (tool) {
    case 'pick-cell':
      return `${where} Press Enter to choose this square, or Escape to cancel.`;
    case 'pick-edge': {
      const edge = scene.edgeAt(cursor.x, cursor.y, cursor.side);
      return `${cursor.side.charAt(0).toUpperCase()}${cursor.side.slice(1)} side: ${edgePhrase(edge)}. ${where} Press E for the next side, Enter to choose this edge, or Escape to cancel.`;
    }
    case 'pin':
      return `${where} Press Enter to place a pin here.`;
    case 'ping':
      return `${where} Press Enter to ping here.`;
    case 'ruler':
      return measurement
        ? `${measurementText(measurement)}. ${where} Press Enter to keep this measurement, or Escape to cancel.`
        : `${where} Press Enter to measure from here.`;
  }
}
