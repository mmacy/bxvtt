/**
 * Fake game state for the harness only. It moves the party, reveals cells, and opens doors so the
 * map has something to animate without a server. The product never uses it: in the product, bxapi
 * decides every move and reports every cell.
 */
import { DIRECTIONS, cellKey, edgeKey, levelKey, step, type Direction } from '../geometry';
import type { DungeonState, LevelSpec, PlayerView } from '../model';

export function emptyDungeonState(): DungeonState {
  return {
    location: { kind: 'town' },
    explored: {},
    seen: {},
    doors: {},
    sprung_traps: [],
    removed_traps: [],
    found_traps: [],
    found_tricks: [],
    emptied_caches: [],
    piles: {},
    generated_caches: {},
    generated_treasure_areas: [],
    generated_lair_hoards: [],
    resolved_encounters: [],
    listen_attempts: {},
    search_attempts: {},
    inspect_attempts: {},
    removal_attempts: {},
    lock_failures: {},
  };
}

function doorRef(dungeonId: string, level: LevelSpec, key: string): string {
  return `${dungeonId}:${level.number}:${key}`;
}

/** Whether sight and a step cross a side, by the fake rules the harness uses. */
export function passable(
  level: LevelSpec,
  state: DungeonState,
  dungeonId: string,
  x: number,
  y: number,
  d: Direction,
): boolean {
  const [nx, ny] = step(x, y, d);
  if (nx < 0 || ny < 0 || nx >= level.width || ny >= level.height) return false;
  const key = edgeKey(x, y, d);
  const edge = level.edges[key];
  if (!edge || edge.kind === 'wall') return false;
  if (edge.kind === 'open') return true;
  const door = edge.door;
  const s = state.doors[doorRef(dungeonId, level, key)];
  if (door?.kind === 'secret' && !s?.discovered) return false;
  return s ? s.open : (door?.starts_open ?? false);
}

/** Cells lit from a position: the whole room the party stands in, and open floor within reach. */
export function litCells(
  level: LevelSpec,
  state: DungeonState,
  dungeonId: string,
  x: number,
  y: number,
  radius = 3,
): [number, number][] {
  const area = level.areas.find((a) => a.cells.some(([cx, cy]) => cx === x && cy === y));
  const room = new Set((area?.cells ?? []).map(([cx, cy]) => cellKey(cx, cy)));
  const seen = new Set([cellKey(x, y)]);
  const out: [number, number][] = [[x, y]];
  const frontier: [number, number][] = [[x, y]];
  while (frontier.length > 0) {
    const cell = frontier.pop();
    if (!cell) break;
    for (const d of DIRECTIONS) {
      const [nx, ny] = step(cell[0], cell[1], d);
      const k = cellKey(nx, ny);
      if (seen.has(k)) continue;
      const near = Math.max(Math.abs(nx - x), Math.abs(ny - y)) <= radius;
      if (!near && !room.has(k)) continue;
      if (!passable(level, state, dungeonId, cell[0], cell[1], d)) continue;
      seen.add(k);
      out.push([nx, ny]);
      frontier.push([nx, ny]);
    }
  }
  return out;
}

function addCells(map: Record<string, [number, number][]>, key: string, cells: [number, number][]): void {
  const list = map[key] ?? [];
  const known = new Set(list.map(([x, y]) => cellKey(x, y)));
  for (const c of cells) {
    if (!known.has(cellKey(c[0], c[1]))) {
      list.push(c);
      known.add(cellKey(c[0], c[1]));
    }
  }
  map[key] = list;
}

/** Places the party and marks what it walks and sees. Returns a new state. */
export function placeParty(
  level: LevelSpec,
  state: DungeonState,
  dungeonId: string,
  x: number,
  y: number,
  facing: Direction,
): DungeonState {
  const key = levelKey(dungeonId, level.number);
  const next: DungeonState = {
    ...state,
    location: {
      kind: 'dungeon',
      dungeon_id: dungeonId,
      level_number: level.number,
      position: [x, y],
      facing,
    },
    explored: { ...state.explored },
    seen: { ...state.seen },
  };
  addCells(next.explored, key, [[x, y]]);
  addCells(next.seen, key, litCells(level, next, dungeonId, x, y));
  return next;
}

/** One fake step, or `null` when the fake rules block it. */
export function tryMove(
  level: LevelSpec,
  state: DungeonState,
  dungeonId: string,
  d: Direction,
): DungeonState | null {
  const loc = state.location;
  if (loc.kind !== 'dungeon' || !loc.position) return null;
  const [x, y] = loc.position;
  if (!passable(level, state, dungeonId, x, y, d)) {
    // Bumping a wall still turns the party, as a turn would.
    return loc.facing === d ? null : { ...state, location: { ...loc, facing: d } };
  }
  const [nx, ny] = step(x, y, d);
  return placeParty(level, state, dungeonId, nx, ny, d);
}

export function setDoor(
  level: LevelSpec,
  state: DungeonState,
  dungeonId: string,
  key: string,
  change: Partial<DungeonState['doors'][string]>,
): DungeonState {
  const edge = level.edges[key];
  if (edge?.kind !== 'door') return state;
  const ref = doorRef(dungeonId, level, key);
  const current = state.doors[ref] ?? {
    open: edge.door?.starts_open ?? false,
    wedged: false,
    discovered: false,
    unlocked: false,
    opened_by_party: false,
  };
  const next = { ...state, doors: { ...state.doors, [ref]: { ...current, ...change } } };
  const loc = next.location;
  if (loc.kind === 'dungeon' && loc.position && loc.level_number === level.number) {
    const k = levelKey(dungeonId, level.number);
    next.seen = { ...next.seen };
    addCells(next.seen, k, litCells(level, next, dungeonId, loc.position[0], loc.position[1]));
  }
  return next;
}

/** A player view built the way osrlib builds one, from fake state, for the harness's player layer. */
export function playerViewFrom(
  level: LevelSpec,
  state: DungeonState,
  dungeonId: string,
  lit: boolean,
): PlayerView {
  const key = levelKey(dungeonId, level.number);
  const cells: [number, number][] = [];
  const known = new Set<string>();
  for (const list of [state.explored[key] ?? [], state.seen[key] ?? []]) {
    for (const [x, y] of list) {
      if (known.has(cellKey(x, y))) continue;
      known.add(cellKey(x, y));
      cells.push([x, y]);
    }
  }
  const passages = new Set(
    level.transitions
      .filter((t) => t.kind === 'passage' && t.side)
      .map((t) => edgeKey(t.position[0], t.position[1], t.side ?? 'north')),
  );
  const edges: PlayerView['explored'][number]['edges'] = {};
  for (const [x, y] of cells) {
    for (const d of DIRECTIONS) {
      const k = edgeKey(x, y, d);
      if (edges[k]) continue;
      if (passages.has(k)) {
        edges[k] = { kind: 'open' };
        continue;
      }
      const [nx, ny] = step(x, y, d);
      const inBounds = nx >= 0 && ny >= 0 && nx < level.width && ny < level.height;
      const edge = inBounds ? level.edges[k] : undefined;
      if (!edge || edge.kind === 'wall') edges[k] = { kind: 'wall' };
      else if (edge.kind === 'open') edges[k] = { kind: 'open' };
      else {
        const s = state.doors[doorRef(dungeonId, level, k)];
        if (edge.door?.kind === 'secret' && !s?.discovered) edges[k] = { kind: 'wall' };
        else
          edges[k] = {
            kind: 'door',
            door_open: s ? s.open : (edge.door?.starts_open ?? false),
            door_wedged: s?.wedged ?? false,
          };
      }
    }
  }
  return {
    adventure_name: 'Harness',
    adventure_description: '',
    town_name: 'Town',
    town_description: '',
    town_services: [],
    town_healing_prices: {},
    party: [],
    location: state.location,
    clock_rounds: 0,
    mode: 'exploring',
    dungeons: [],
    can_travel_to_town: false,
    spell_names: {},
    spell_levels: {},
    reversed_spell_names: {},
    item_names: {},
    item_names_plural: {},
    valuable_names: {},
    valuable_phrases: {},
    features_here: [],
    explored: [
      {
        dungeon_id: dungeonId,
        level_number: level.number,
        cells,
        edges,
        areas: [],
        features: [],
        transitions: [],
      },
    ],
    piles: {},
    emptied_caches: [...state.emptied_caches],
    effects: lit ? [{ character_id: 'character-0001', kind: 'light', remaining_rounds: 300 }] : [],
    fatigued: false,
    exhausted: false,
    deprivation: {},
    journal: [],
    quests: [],
  };
}
