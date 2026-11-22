/**
 * Reads the adventure document and the referee state together: which keyed area a cell belongs to, the doors
 * on an area's walls with their state, and the references osrlib uses to record found traps, emptied caches,
 * and resolved encounters. Everything here looks data up. None of it decides what the rules allow.
 */
import type { components } from '@bxvtt/shared/bxapi';
import type { RefereeState } from '@bxvtt/shared/protocol';

type Schemas = components['schemas'];
export type Adventure = Schemas['Adventure'];
export type DungeonSpec = Schemas['DungeonSpec'];
export type LevelSpec = Schemas['LevelSpec'];
export type AreaSpec = Schemas['AreaSpec'];
export type FeatureSpec = Schemas['FeatureSpec'];
export type TrapSpec = Schemas['TrapSpec'];
export type DoorSpec = Schemas['DoorSpec'];
export type DoorState = Schemas['DoorState'];
export type TransitionSpec = Schemas['TransitionSpec'];
export type TriggerSpec = Schemas['TriggerSpec'];
export type QuestSpec = Schemas['QuestSpec'];
export type ObjectiveSpec = Schemas['ObjectiveSpec'];
export type GateSpec = Schemas['GateSpec'];
export type TriggerClause = Schemas['TriggerClause'];
export type TriggerPattern = TriggerSpec['when'];
export type Condition = TriggerSpec['conditions'][number];
export type Consequence = TriggerSpec['consequences'][number];
export type KeyedEncounter = Schemas['KeyedEncounter'];
export type MonsterInstance = Schemas['MonsterInstance'];
export type CharacterSheet = Schemas['Character'];
export type Direction = 'north' | 'east' | 'south' | 'west';
export type Cell = readonly [number, number];

export const DIRECTIONS: readonly Direction[] = ['north', 'east', 'south', 'west'];

/**
 * The adventure document as an {@link Adventure}, or `null` when it is missing or isn't an adventure.
 *
 * @param document - The body of `GET /api/tables/{t}/game/adventure`.
 */
export function asAdventure(document: Record<string, unknown> | null): Adventure | null {
  if (document === null || !Array.isArray(document.dungeons)) return null;
  return document as unknown as Adventure;
}

/** A level of a dungeon, or `null`. */
export function findLevel(adventure: Adventure, dungeonId: string, levelNumber: number): LevelSpec | null {
  const dungeon = adventure.dungeons.find((d) => d.id === dungeonId);
  return dungeon?.levels.find((l) => l.number === levelNumber) ?? null;
}

/** Every level of every dungeon, in document order. */
export function allLevels(adventure: Adventure): Array<{ dungeon: DungeonSpec; level: LevelSpec }> {
  return adventure.dungeons.flatMap((dungeon) => dungeon.levels.map((level) => ({ dungeon, level })));
}

function sameCell(a: readonly number[], x: number, y: number): boolean {
  return a[0] === x && a[1] === y;
}

/** The keyed area that contains a cell, or `null` for a corridor. */
export function areaAt(level: LevelSpec, x: number, y: number): AreaSpec | null {
  return level.areas.find((area) => area.cells.some((cell) => sameCell(cell, x, y))) ?? null;
}

/** A keyed area by ID on any level, with where it is. */
export function findArea(
  adventure: Adventure,
  areaId: string,
): { dungeon: DungeonSpec; level: LevelSpec; area: AreaSpec } | null {
  for (const { dungeon, level } of allLevels(adventure)) {
    const area = level.areas.find((a) => a.id === areaId);
    if (area) return { dungeon, level, area };
  }
  return null;
}

/**
 * The cell of an area nearest its middle, to center the map on or place the party in.
 *
 * @param area - The area. An area always has at least one cell.
 */
export function areaCenter(area: AreaSpec): Cell {
  const cells = area.cells;
  const first = cells[0] ?? [0, 0];
  if (cells.length === 0) return [first[0], first[1]];
  const mx = cells.reduce((sum, c) => sum + c[0], 0) / cells.length;
  const my = cells.reduce((sum, c) => sum + c[1], 0) / cells.length;
  let best = first;
  let bestDistance = Infinity;
  for (const cell of cells) {
    const distance = (cell[0] - mx) ** 2 + (cell[1] - my) ** 2;
    if (distance < bestDistance) {
      best = cell;
      bestDistance = distance;
    }
  }
  return [best[0], best[1]];
}

/**
 * The key of the edge on one side of a cell in a level's `edges` map. Every edge has one key, written from the
 * cell on its south or east side, as osrlib's `edge_key` does.
 */
export function edgeKey(x: number, y: number, direction: Direction): string {
  if (direction === 'south') return `${x},${y + 1}:north`;
  if (direction === 'east') return `${x + 1},${y}:west`;
  return `${x},${y}:${direction}`;
}

/** The reference `DungeonState.doors` is keyed by: `{dungeon}:{level}:{edge key}`. */
export function edgeRef(
  dungeonId: string,
  levelNumber: number,
  x: number,
  y: number,
  direction: Direction,
): string {
  return `${dungeonId}:${levelNumber}:${edgeKey(x, y, direction)}`;
}

/** The reference osrlib records an area's trap, encounter, or treasure under: `{dungeon}:{level}:{area}`. */
export function areaRef(dungeonId: string, levelNumber: number, areaId: string): string {
  return `${dungeonId}:${levelNumber}:${areaId}`;
}

/** The reference osrlib records a feature's trap or contents under: `{dungeon}:{level}:{feature}`. */
export function featureRef(dungeonId: string, levelNumber: number, featureId: string): string {
  return `${dungeonId}:${levelNumber}:${featureId}`;
}

function neighbour(x: number, y: number, direction: Direction): Cell {
  switch (direction) {
    case 'north':
      return [x, y - 1];
    case 'south':
      return [x, y + 1];
    case 'east':
      return [x + 1, y];
    case 'west':
      return [x - 1, y];
  }
}

/** A door on the boundary of a set of cells, with what lies past it and its state in play. */
export interface DoorFacts {
  /** The edge key, unique on the level. */
  key: string;
  /** The cell inside the area, and the side of it the door is on. */
  x: number;
  y: number;
  direction: Direction;
  spec: DoorSpec;
  /** The state osrlib recorded once something in play changed the door, or `null` before that. */
  state: DoorState | null;
  /** The area on the other side, or `null` for a corridor. */
  beyond: AreaSpec | null;
}

/**
 * The doors on the walls of a set of cells, such as an area, in the order the cells list them.
 *
 * @param level - The level.
 * @param cells - The cells inside, such as an area's `cells` or the party's one cell in a corridor.
 * @param doors - `DungeonState.doors` from the referee state.
 * @param dungeonId - The dungeon, for door references.
 */
export function doorsAround(
  level: LevelSpec,
  cells: readonly (readonly number[])[],
  doors: Record<string, DoorState>,
  dungeonId: string,
): DoorFacts[] {
  const inside = new Set(cells.map((c) => `${c[0]},${c[1]}`));
  const found = new Map<string, DoorFacts>();
  for (const cell of cells) {
    const [x = 0, y = 0] = cell;
    for (const direction of DIRECTIONS) {
      const [nx, ny] = neighbour(x, y, direction);
      if (inside.has(`${nx},${ny}`)) continue;
      const key = edgeKey(x, y, direction);
      if (found.has(key)) continue;
      const edge = level.edges[key];
      if (edge?.kind !== 'door' || !edge.door) continue;
      found.set(key, {
        key,
        x,
        y,
        direction,
        spec: edge.door,
        state: doors[edgeRef(dungeonId, level.number, x, y, direction)] ?? null,
        beyond: areaAt(level, nx, ny),
      });
    }
  }
  return [...found.values()];
}

/** The transitions (stairs, trapdoors, chutes, passages) on any of a set of cells. */
export function transitionsOn(level: LevelSpec, cells: readonly (readonly number[])[]): TransitionSpec[] {
  return level.transitions.filter((t) => cells.some((c) => sameCell(c, t.position[0], t.position[1])));
}

/** The level-wide features (those with a cell) that lie inside a set of cells. */
export function levelFeaturesOn(level: LevelSpec, cells: readonly (readonly number[])[]): FeatureSpec[] {
  return level.features.filter((f) => {
    const at = f.cell;
    return at !== null && at !== undefined && cells.some((c) => sameCell(c, at[0], at[1]));
  });
}

/** What the session has recorded about traps, caches, and encounters, read from the referee state. */
export interface PlayRecord {
  foundTraps: ReadonlySet<string>;
  foundTricks: ReadonlySet<string>;
  sprungTraps: ReadonlySet<string>;
  removedTraps: ReadonlySet<string>;
  emptiedCaches: ReadonlySet<string>;
  resolvedEncounters: ReadonlySet<string>;
  generatedTreasureAreas: ReadonlySet<string>;
  generatedLairHoards: ReadonlySet<string>;
  alertedAreas: ReadonlySet<string>;
  explored: ReadonlySet<string>;
  doors: Record<string, DoorState>;
}

/** Builds a {@link PlayRecord} from the referee state. */
export function playRecord(state: RefereeState): PlayRecord {
  const d = state.dungeon_state;
  const explored = new Set<string>();
  for (const [level, cells] of Object.entries(d.explored ?? {})) {
    for (const cell of cells) explored.add(`${level}:${cell[0]},${cell[1]}`);
  }
  return {
    foundTraps: new Set(d.found_traps ?? []),
    foundTricks: new Set(d.found_tricks ?? []),
    sprungTraps: new Set(d.sprung_traps ?? []),
    removedTraps: new Set(d.removed_traps ?? []),
    emptiedCaches: new Set(d.emptied_caches ?? []),
    resolvedEncounters: new Set(d.resolved_encounters ?? []),
    generatedTreasureAreas: new Set(d.generated_treasure_areas ?? []),
    generatedLairHoards: new Set(d.generated_lair_hoards ?? []),
    alertedAreas: new Set(state.exploration.alerted_areas ?? []),
    explored,
    doors: d.doors ?? {},
  };
}

/** Whether the party has walked into any cell of an area. */
export function areaVisited(
  record: PlayRecord,
  dungeonId: string,
  levelNumber: number,
  area: AreaSpec,
): boolean {
  return area.cells.some((c) => record.explored.has(`${dungeonId}:${levelNumber}:${c[0]},${c[1]}`));
}

/** The state of a trap in play, from the references osrlib recorded. */
export type TrapStatus = 'hidden' | 'found' | 'sprung' | 'removed';

export function trapStatus(record: PlayRecord, ref: string): TrapStatus {
  if (record.removedTraps.has(ref)) return 'removed';
  if (record.sprungTraps.has(ref)) return 'sprung';
  if (record.foundTraps.has(ref)) return 'found';
  return 'hidden';
}

/** A door's state now: the recorded state, or the state its `DoorSpec` starts in, as osrlib's `door()` reads it. */
export function doorNow(facts: Pick<DoorFacts, 'spec' | 'state'>): {
  open: boolean;
  locked: boolean;
  secret: boolean;
  found: boolean;
  wedged: boolean;
  stuck: boolean;
  gated: boolean;
} {
  const state = facts.state;
  return {
    open: state ? state.open : facts.spec.starts_open,
    locked: facts.spec.locked && !(state?.unlocked ?? false),
    secret: facts.spec.kind === 'secret',
    found: state?.discovered ?? false,
    wedged: state?.wedged ?? false,
    stuck: facts.spec.stuck,
    gated: facts.spec.requires !== null && facts.spec.requires !== undefined,
  };
}

/** Where the party is, read from the referee state. */
export type PartyPlace =
  | { kind: 'town' }
  | { kind: 'dungeon'; dungeonId: string; levelNumber: number; x: number; y: number; facing: Direction };

export function partyPlace(state: RefereeState): PartyPlace {
  const location = state.dungeon_state.location;
  if (location.kind !== 'dungeon' || !location.dungeon_id || !location.position) return { kind: 'town' };
  return {
    kind: 'dungeon',
    dungeonId: location.dungeon_id,
    levelNumber: location.level_number ?? 1,
    x: location.position[0],
    y: location.position[1],
    facing: (location.facing ?? 'north') as Direction,
  };
}

/**
 * What the referee calls a monster the adventure bundles: its true name, in lower case, such as `drowned prior`.
 * `disguise` is what the players see instead, when the author gave it a different display name.
 */
export function bundledMonsterLabel(
  adventure: Adventure | null,
  templateId: string,
): { label: string; labelPlural: string; disguise: string | null } | null {
  const bundled = adventure?.monsters.find((m) => m.id === templateId);
  if (!bundled) return null;
  const label = bundled.name.toLowerCase();
  const shown = bundled.display_name?.toLowerCase() ?? null;
  return { label, labelPlural: `${label}s`, disguise: shown !== null && shown !== label ? shown : null };
}
