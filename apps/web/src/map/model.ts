/**
 * The normalized map model: one `LevelMap` per dungeon level, built from a bxapi player view or
 * from the referee's adventure and dungeon state. The renderer draws a `LevelMap` and nothing else.
 *
 * A builder only translates what bxapi reports. It never decides what the party could see or do.
 */
import type { components } from '@bxvtt/shared/bxapi';
import {
  CELL_FEET,
  DIRECTIONS,
  cellKey,
  cellOfRef,
  edgeKey,
  levelKey,
  parseEdgeKey,
  parseLevelKey,
  step,
  type Cell,
  type Direction,
  type ParsedEdgeKey,
  type Point,
} from './geometry';

type Schemas = components['schemas'];
export type PlayerView = Schemas['PlayerView'];
export type LevelSpec = Schemas['LevelSpec'];
export type DungeonState = Schemas['DungeonState'];
export type DungeonSpec = Schemas['DungeonSpec'];
type FeatureSpec = Schemas['FeatureSpec'];
type TrapSpec = Schemas['TrapSpec'];
type Coins = Schemas['Coins'];

/** Which audience a map was built for. A player map holds only what `PlayerView` contains. */
export type MapLayer = 'player' | 'referee';

export interface Bounds {
  minX: number;
  minY: number;
  /** Exclusive: the east edge of the easternmost cell. */
  maxX: number;
  /** Exclusive: the south edge of the southernmost cell. */
  maxY: number;
}

export interface MapCell {
  x: number;
  y: number;
  /** Whether the party knows this cell: it walked it, remembers seeing it, or sees it now. */
  known: boolean;
  /** Whether the party walked this cell. `null` on a player map, because the view doesn't say. */
  walked: boolean | null;
  /** The id of the area that covers the cell, or `null` for corridor and on a player map. */
  areaId: string | null;
}

export type EdgeKind = 'wall' | 'open' | 'door' | 'passage';

export interface MapDoor {
  /** Whether the door stands open. */
  open: boolean;
  /** Whether an iron spike holds it open. */
  wedged: boolean;
  /** Whether it is locked now (locked in the adventure and not yet unlocked). `null` when unknown. */
  locked: boolean | null;
  /** Whether it is locked in the adventure but has been unlocked. `null` when unknown. */
  unlocked: boolean | null;
  /** Whether it is stuck and has to be forced. `null` when unknown. */
  stuck: boolean | null;
  /** Whether it is a secret door. `null` on a player map: a found secret door looks like any door. */
  secret: boolean | null;
  /** For a secret door, whether the party has found it. `null` when unknown or not secret. */
  discovered: boolean | null;
  /** Whether a gate (a condition such as carrying a key) guards opening it. `null` when unknown. */
  gated: boolean | null;
}

export interface MapEdge extends ParsedEdgeKey {
  /**
   * What stands on the edge. `passage` is a wall that a level transition leads through. On a player
   * map a passage reads `open`, because the player view reports it that way.
   */
  kind: EdgeKind;
  /** The door, when `kind` is `door`. */
  door: MapDoor | null;
}

export type TransitionKind = 'stairs_up' | 'stairs_down' | 'trapdoor' | 'chute' | 'passage';

export interface MapTransition {
  /** A stable id, like `"stairs_down@26,17"` or `"passage@16,20:west"`. */
  id: string;
  kind: TransitionKind;
  x: number;
  y: number;
  /** The cell side a passage stands on, and `null` for the other kinds. */
  side: Direction | null;
  /** Where it leads, or `null` when unknown. */
  to: { dungeonId: string; levelNumber: number; x: number; y: number; facing: Direction } | null;
  /** Whether a gate guards it. `null` when unknown. */
  gated: boolean | null;
  /** Whether the party knows the transition's cell. */
  known: boolean;
}

export type FeatureKind = 'cache' | 'generated_cache' | 'pile' | 'trick' | 'custom';

/** The state of a trap: still hidden, found by the party, sprung, or taken out by a thief. */
export type TrapState = 'hidden' | 'found' | 'sprung' | 'removed';

export interface MapTrap {
  state: TrapState;
  /** What springs it: walking in (`enter`) or opening (`open`). */
  trigger: 'enter' | 'open';
  /** A short summary for the referee, like `"10' fall"` or `"1d6 damage"`. */
  summary: string;
}

export interface MapFeature {
  /** The feature id from the adventure, a generated cache id, or `"pile@x,y"` for a drop pile. */
  id: string;
  kind: FeatureKind;
  x: number;
  y: number;
  /** True when the feature has no cell of its own and the party reaches it from anywhere in its area. */
  areaWide: boolean;
  areaId: string | null;
  description: string;
  /** For a cache, whether the party emptied it. */
  emptied: boolean;
  /** For a construction trick, whether the party found it. `null` for other kinds. */
  found: boolean | null;
  /** The treasure trap on a cache, referee maps only. */
  trap: MapTrap | null;
  /** One line per thing inside, for a tooltip, like `"120 gp"` or `"dagger×1"`. */
  contents: string[];
  /** Whether the party knows the feature's cell. */
  known: boolean;
}

export interface MapEncounter {
  /** A one-line summary, like `"4 goblin"`. */
  summary: string;
  monsters: { templateId: string; count: string }[];
  /** Whether every monster was slain or routed. */
  resolved: boolean;
  /** Whether the monsters keep a lair hoard. */
  hoard: boolean;
  /** Whether the monsters expect the party. */
  aware: boolean;
}

export interface MapArea {
  id: string;
  /** The `"{dungeon}:{level}:{id}"` reference events and the dungeon state use. */
  ref: string;
  /** The label to draw: the area's position in the level's list, counting from 1. */
  label: string;
  name: string;
  description: string;
  cells: Cell[];
  /** Where the label goes: the centre of the area cell farthest from the area's edge. */
  anchor: Point;
  bounds: Bounds;
  /** Whether the party knows any of the area's cells. */
  known: boolean;
  encounter: MapEncounter | null;
  /** Unguarded treasure the session rolls on entry, and whether it has rolled it. */
  treasure: { summary: string; rolled: boolean } | null;
  trap: MapTrap | null;
}

export interface MapParty {
  x: number;
  y: number;
  facing: Direction;
}

export interface MapWandering {
  chanceInSix: number;
  intervalTurns: number;
  /** Whether the level has its own encounter table instead of the built-in one. */
  customTable: boolean;
}

export interface LevelMap {
  layer: MapLayer;
  /** The `"{dungeon}:{level}"` key. */
  key: string;
  dungeonId: string;
  levelNumber: number;
  /** The grid size. On a player map it covers the known cells only, so it reveals nothing. */
  width: number;
  height: number;
  /** Every floor cell to draw. A player map lists the known cells only. */
  cells: MapCell[];
  /** Every edge around the floor cells, each once, keyed as osrlib keys them. */
  edges: MapEdge[];
  transitions: MapTransition[];
  features: MapFeature[];
  areas: MapArea[];
  /** The cell the party arrives at from town, referee maps only. */
  entrance: Cell | null;
  /** The party, when it stands on this level. */
  party: MapParty | null;
  /** The party's light, when it has one and stands on this level. */
  light: { radiusFeet: number } | null;
  wandering: MapWandering | null;
  /** The bounds of the cells the party knows, or `null` when it knows none. */
  knownBounds: Bounds | null;
  /** The bounds of every cell in `cells`. */
  bounds: Bounds;
}

/** Light effect kinds and darkness effect kinds, as osrlib's `LIGHT_EFFECT_KINDS` lists them. */
export const LIGHT_EFFECT_KINDS: ReadonlySet<string> = new Set(['light', 'continual_light']);
export const DARKNESS_EFFECT_KINDS: ReadonlySet<string> = new Set(['darkness', 'continual_darkness']);
/** A torch's radius, which osrlib also uses when a light source doesn't state one. */
export const DEFAULT_LIGHT_RADIUS_FEET = 30;

/** Extra knowledge a client can add to a player map, such as stairs the party has used. */
export interface PlayerMapExtras {
  transitions?: { kind: TransitionKind; x: number; y: number; side?: Direction | null }[];
  /**
   * Areas the party has entered, such as the scene's `levels[].areas`. The map names each one at a label anchor
   * clear of stairs and features, and the hover tooltip names the area under the pointer. Pass only what the
   * party knows: the cells on its map and the name it was told.
   */
  areas?: { id: string; name: string; description?: string; cells: readonly (readonly [number, number])[] }[];
  features?: {
    id: string;
    kind: FeatureKind;
    x: number;
    y: number;
    description?: string;
    emptied?: boolean;
  }[];
}

export interface PlayerMapOptions {
  /** The light radius to hint when the party has light. The player view doesn't state it. */
  lightRadiusFeet?: number;
  extras?: PlayerMapExtras;
}

/** The level keys a player view knows, current level first. */
export function playerLevelKeys(view: PlayerView): string[] {
  const keys = view.explored.map((level) => levelKey(level.dungeon_id, level.level_number));
  const current = currentLevelKey(view);
  if (current && keys.includes(current)) return [current, ...keys.filter((key) => key !== current)];
  return keys;
}

/** The key of the level the party stands on, or `null` in town. */
export function currentLevelKey(view: Pick<PlayerView, 'location'>): string | null {
  const { location } = view;
  if (location.kind !== 'dungeon' || location.dungeon_id == null || location.level_number == null)
    return null;
  return levelKey(location.dungeon_id, location.level_number);
}

/**
 * Builds the map of one level from a player view. Pass the level's `"{dungeon}:{level}"` key, or
 * leave it out for the level the party stands on. Returns `null` when the view knows no such level.
 */
export function fromPlayerView(
  view: PlayerView,
  key?: string,
  options: PlayerMapOptions = {},
): LevelMap | null {
  const wanted = key ?? currentLevelKey(view) ?? playerLevelKeys(view)[0];
  if (wanted === undefined) return null;
  const level = view.explored.find((entry) => levelKey(entry.dungeon_id, entry.level_number) === wanted);
  if (!level) return null;
  const { dungeon_id: dungeonId, level_number: levelNumber } = level;

  const cells: MapCell[] = [];
  const seen = new Set<string>();
  for (const [x, y] of level.cells) {
    const k = cellKey(x, y);
    if (seen.has(k)) continue;
    seen.add(k);
    cells.push({ x, y, known: true, walked: null, areaId: null });
  }

  const edges: MapEdge[] = [];
  for (const [rawKey, edge] of Object.entries(level.edges)) {
    const parsed = parseEdgeKey(rawKey);
    if (!parsed) continue;
    const kind: EdgeKind = edge.kind === 'open' ? 'open' : edge.kind === 'door' ? 'door' : 'wall';
    edges.push({
      ...parsed,
      kind,
      door:
        kind === 'door'
          ? {
              open: edge.door_open ?? false,
              wedged: edge.door_wedged ?? false,
              locked: null,
              unlocked: null,
              stuck: null,
              secret: null,
              discovered: null,
              gated: null,
            }
          : null,
    });
  }

  const features: MapFeature[] = [];
  for (const [ref, pile] of Object.entries(view.piles)) {
    const cell = cellOfRef(ref, dungeonId, levelNumber);
    if (!cell) continue;
    const contents = [...pile.items];
    if (pile.coins_gp_value > 0) contents.push(`${pile.coins_gp_value} gp in coins`);
    features.push(pileFeature(cell, contents, seen.has(cellKey(cell[0], cell[1]))));
  }
  for (const extra of options.extras?.features ?? []) {
    features.push({
      id: extra.id,
      kind: extra.kind,
      x: extra.x,
      y: extra.y,
      areaWide: false,
      areaId: null,
      description: extra.description ?? '',
      emptied: extra.emptied ?? false,
      found: extra.kind === 'trick' ? true : null,
      trap: null,
      contents: [],
      known: seen.has(cellKey(extra.x, extra.y)),
    });
  }

  const transitions: MapTransition[] = (options.extras?.transitions ?? []).map((t) => ({
    id: transitionId(t.kind, t.x, t.y, t.side ?? null),
    kind: t.kind,
    x: t.x,
    y: t.y,
    side: t.side ?? null,
    to: null,
    gated: null,
    known: seen.has(cellKey(t.x, t.y)),
  }));

  const areas = playerAreas(options.extras?.areas ?? [], seen, features, transitions, dungeonId, levelNumber);
  if (areas.length > 0) {
    const areaOf = new Map<string, string>();
    for (const area of areas) for (const [x, y] of area.cells) areaOf.set(cellKey(x, y), area.id);
    for (const cell of cells) cell.areaId = areaOf.get(cellKey(cell.x, cell.y)) ?? null;
  }

  const party = partyOn(view.location, dungeonId, levelNumber);
  const lit = hasLight(view.effects.map((effect) => effect.kind));
  const bounds = boundsOf(cells) ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  let width = bounds.maxX;
  let height = bounds.maxY;
  for (const edge of edges) {
    width = Math.max(width, edge.x + 1);
    height = Math.max(height, edge.y + 1);
  }

  return {
    layer: 'player',
    key: wanted,
    dungeonId,
    levelNumber,
    width,
    height,
    cells,
    edges,
    transitions,
    features,
    areas,
    entrance: null,
    party,
    light: party && lit ? { radiusFeet: options.lightRadiusFeet ?? DEFAULT_LIGHT_RADIUS_FEET } : null,
    wandering: null,
    knownBounds: boundsOf(cells),
    bounds,
  };
}

/**
 * The areas a client passed for a player map. Each keeps only the cells on the map, has no number (players don't
 * see the key), and puts its label on the cell deepest inside it that holds no stairs or feature.
 */
function playerAreas(
  extras: NonNullable<PlayerMapExtras['areas']>,
  known: ReadonlySet<string>,
  features: readonly MapFeature[],
  transitions: readonly MapTransition[],
  dungeonId: string,
  levelNumber: number,
): MapArea[] {
  const occupied = new Set<string>();
  for (const t of transitions) if (t.kind !== 'passage') occupied.add(cellKey(t.x, t.y));
  for (const f of features) occupied.add(cellKey(f.x, f.y));
  const areas: MapArea[] = [];
  for (const extra of extras) {
    const cells = extra.cells.filter(([x, y]) => known.has(cellKey(x, y))).map(([x, y]) => [x, y] as const);
    if (cells.length === 0) continue;
    areas.push({
      id: extra.id,
      ref: `${dungeonId}:${levelNumber}:${extra.id}`,
      label: '',
      name: extra.name,
      description: extra.description ?? '',
      cells,
      anchor: labelAnchor(cells, occupied),
      bounds: boundsOf(cells.map(([x, y]) => ({ x, y }))) ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      known: true,
      encounter: null,
      treasure: null,
      trap: null,
    });
  }
  return areas;
}

export interface RefereeMapOptions {
  dungeonId: string;
  /** The party's light, from `refereeLight`, or `null` when it has none. */
  light?: { radiusFeet: number } | null;
}

/**
 * Builds the referee's map of one level from its `LevelSpec` (in `RefereeView.adventure`) and the
 * session's `DungeonState` (`RefereeView.dungeon_state`). Every cell, door, trap, and feature is
 * on it, each marked with what the party knows.
 */
export function fromRefereeView(level: LevelSpec, state: DungeonState, options: RefereeMapOptions): LevelMap {
  const { dungeonId } = options;
  const levelNumber = level.number;
  const key = levelKey(dungeonId, levelNumber);
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < level.width && y < level.height;
  const explored = new Set((state.explored[key] ?? []).map(([x, y]) => cellKey(x, y)));
  const known = new Set(explored);
  for (const [x, y] of state.seen[key] ?? []) known.add(cellKey(x, y));

  // Which area covers each cell: the first area listed wins, as in osrlib.
  const areaOf = new Map<string, string>();
  for (const area of level.areas) {
    for (const [x, y] of area.cells) {
      const k = cellKey(x, y);
      if (!areaOf.has(k)) areaOf.set(k, area.id);
    }
  }

  // A floor cell is one an area covers, one with a way in or out, or one that holds something.
  const floor = new Map<string, Cell>();
  const addFloor = (x: number, y: number) => {
    if (inBounds(x, y)) floor.set(cellKey(x, y), [x, y]);
  };
  for (const area of level.areas) for (const [x, y] of area.cells) addFloor(x, y);
  for (const [rawKey, edge] of Object.entries(level.edges)) {
    if (edge.kind === 'wall') continue;
    const parsed = parseEdgeKey(rawKey);
    if (!parsed) continue;
    addFloor(parsed.x, parsed.y);
    if (parsed.side === 'north') addFloor(parsed.x, parsed.y - 1);
    else addFloor(parsed.x - 1, parsed.y);
  }
  for (const transition of level.transitions) addFloor(transition.position[0], transition.position[1]);
  for (const feature of level.features) if (feature.cell) addFloor(feature.cell[0], feature.cell[1]);
  if (level.entrance) addFloor(level.entrance[0], level.entrance[1]);
  if (state.location.kind === 'dungeon' && state.location.dungeon_id === dungeonId) {
    const position = state.location.position;
    if (state.location.level_number === levelNumber && position) addFloor(position[0], position[1]);
  }

  const cells: MapCell[] = [...floor.values()].map(([x, y]) => {
    const k = cellKey(x, y);
    return { x, y, known: known.has(k), walked: explored.has(k), areaId: areaOf.get(k) ?? null };
  });
  cells.sort((a, b) => a.y - b.y || a.x - b.x);

  const passages = new Map<string, Schemas['TransitionSpec']>();
  for (const transition of level.transitions) {
    if (transition.kind === 'passage' && transition.side) {
      passages.set(edgeKey(transition.position[0], transition.position[1], transition.side), transition);
    }
  }

  const edges: MapEdge[] = [];
  const done = new Set<string>();
  for (const [x, y] of floor.values()) {
    for (const direction of DIRECTIONS) {
      const k = edgeKey(x, y, direction);
      if (done.has(k)) continue;
      done.add(k);
      const parsed = parseEdgeKey(k);
      if (!parsed) continue;
      const [nx, ny] = step(x, y, direction);
      const spec = inBounds(nx, ny) ? level.edges[k] : undefined;
      if (passages.has(k)) {
        edges.push({ ...parsed, kind: 'passage', door: null });
      } else if (!spec || spec.kind === 'wall') {
        edges.push({ ...parsed, kind: 'wall', door: null });
      } else if (spec.kind === 'open') {
        edges.push({ ...parsed, kind: 'open', door: null });
      } else {
        const door = spec.door;
        const doorState = state.doors[`${dungeonId}:${levelNumber}:${k}`];
        const secret = door?.kind === 'secret';
        const lockedInSpec = door?.locked ?? false;
        const unlocked = doorState?.unlocked ?? false;
        edges.push({
          ...parsed,
          kind: 'door',
          door: {
            open: doorState ? doorState.open : (door?.starts_open ?? false),
            wedged: doorState?.wedged ?? false,
            locked: lockedInSpec && !unlocked,
            unlocked: lockedInSpec && unlocked,
            stuck: door?.stuck ?? false,
            secret,
            discovered: secret ? (doorState?.discovered ?? false) : null,
            gated: door?.requires != null,
          },
        });
      }
    }
  }

  const transitions: MapTransition[] = level.transitions.map((t) => ({
    id: transitionId(t.kind, t.position[0], t.position[1], t.side ?? null),
    kind: t.kind,
    x: t.position[0],
    y: t.position[1],
    side: t.side ?? null,
    to: {
      dungeonId: t.to_dungeon_id,
      levelNumber: t.to_level_number,
      x: t.to_position[0],
      y: t.to_position[1],
      facing: t.to_facing,
    },
    gated: t.requires != null,
    known: known.has(cellKey(t.position[0], t.position[1])),
  }));

  const ref = (id: string) => `${dungeonId}:${levelNumber}:${id}`;
  const emptied = new Set(state.emptied_caches);
  const foundTricks = new Set(state.found_tricks);
  const trapState = (id: string): TrapState => {
    const r = ref(id);
    if (state.sprung_traps.includes(r)) return 'sprung';
    if (state.removed_traps.includes(r)) return 'removed';
    if (state.found_traps.includes(r)) return 'found';
    return 'hidden';
  };

  const features: MapFeature[] = [];
  const addFeature = (spec: FeatureSpec, areaId: string | null, fallback: Cell | undefined) => {
    const cell = spec.cell ?? fallback;
    if (!cell) return;
    const kind: FeatureKind =
      spec.kind === 'treasure_cache' ? 'cache' : spec.kind === 'construction_trick' ? 'trick' : 'custom';
    features.push({
      id: spec.id,
      kind,
      x: cell[0],
      y: cell[1],
      areaWide: spec.cell == null,
      areaId,
      description: spec.description,
      emptied: kind === 'cache' && emptied.has(ref(spec.id)),
      found: kind === 'trick' ? foundTricks.has(ref(spec.id)) : null,
      trap: spec.trap ? describeTrapState(spec.trap, trapState(spec.id)) : null,
      contents: kind === 'cache' ? describeContents(spec) : [],
      known: known.has(cellKey(cell[0], cell[1])),
    });
  };
  for (const feature of level.features) {
    const areaId = feature.cell ? (areaOf.get(cellKey(feature.cell[0], feature.cell[1])) ?? null) : null;
    addFeature(feature, areaId, undefined);
  }
  for (const area of level.areas)
    for (const feature of area.features) addFeature(feature, area.id, area.cells[0]);

  for (const [id, cache] of Object.entries(state.generated_caches)) {
    const cell = cellOfRef(cache.cell_ref, dungeonId, levelNumber);
    if (!cell) continue;
    const contents = coinLines(cache.coins);
    for (const valuable of cache.valuables) contents.push(valuable.name || valuable.kind);
    for (const item of cache.magic_items) contents.push(magicItemName(item));
    if (cache.treasure_types.length > 0) contents.unshift(`Rolled on ${cache.treasure_types.join(', ')}`);
    features.push({
      id,
      kind: 'generated_cache',
      x: cell[0],
      y: cell[1],
      areaWide: false,
      areaId: areaOf.get(cellKey(cell[0], cell[1])) ?? null,
      description: 'Rolled treasure.',
      emptied: false,
      found: null,
      trap: null,
      contents,
      known: known.has(cellKey(cell[0], cell[1])),
    });
  }
  for (const [cellReference, pile] of Object.entries(state.piles)) {
    const cell = cellOfRef(cellReference, dungeonId, levelNumber);
    if (!cell) continue;
    const contents = pile.items.map((item) => `${item.item_id.replaceAll('_', ' ')} × ${item.quantity}`);
    for (const item of pile.magic_items) contents.push(magicItemName(item));
    for (const valuable of pile.valuables) contents.push(valuable.name || valuable.kind);
    contents.push(...coinLines(pile.coins));
    features.push(pileFeature(cell, contents, known.has(cellKey(cell[0], cell[1]))));
  }

  const occupied = new Set<string>();
  for (const t of transitions) if (t.kind !== 'passage') occupied.add(cellKey(t.x, t.y));
  for (const f of features) occupied.add(cellKey(f.x, f.y));
  const resolved = new Set(state.resolved_encounters);
  const rolledTreasure = new Set(state.generated_treasure_areas);
  const areas: MapArea[] = level.areas.map((area, index) => {
    const own = area.cells.filter(([x, y]) => areaOf.get(cellKey(x, y)) === area.id);
    const cellsForArea = own.length > 0 ? own : area.cells;
    const encounter = area.encounter;
    return {
      id: area.id,
      ref: ref(area.id),
      label: String(index + 1),
      name: area.name,
      description: area.description,
      cells: cellsForArea.map(([x, y]) => [x, y] as const),
      anchor: labelAnchor(cellsForArea, occupied),
      bounds: boundsOf(cellsForArea.map(([x, y]) => ({ x, y }))) ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 },
      known: cellsForArea.some(([x, y]) => known.has(cellKey(x, y))),
      encounter: encounter
        ? {
            monsters: encounter.monsters.map((m) => ({
              templateId: m.template_id,
              count: m.count_fixed != null ? String(m.count_fixed) : (m.count_dice ?? '?'),
            })),
            summary: encounter.monsters
              .map((m) => `${m.count_fixed ?? m.count_dice ?? '?'} ${m.template_id.replaceAll('_', ' ')}`)
              .join(', '),
            resolved: resolved.has(ref(area.id)),
            hoard: encounter.hoard,
            aware: encounter.aware,
          }
        : null,
      treasure: area.treasure
        ? {
            summary: area.treasure.unguarded
              ? 'Unguarded treasure'
              : `Treasure type ${area.treasure.letters.join(', ')}`,
            rolled: rolledTreasure.has(ref(area.id)),
          }
        : null,
      trap: area.trap ? describeTrapState(area.trap, trapState(area.id)) : null,
    };
  });

  const party = partyOn(state.location, dungeonId, levelNumber);
  const knownCells = cells.filter((cell) => cell.known);
  return {
    layer: 'referee',
    key,
    dungeonId,
    levelNumber,
    width: level.width,
    height: level.height,
    cells,
    edges,
    transitions,
    features,
    areas,
    entrance: level.entrance ? [level.entrance[0], level.entrance[1]] : null,
    party,
    light: party ? (options.light ?? null) : null,
    wandering: {
      chanceInSix: level.wandering.chance_in_six,
      intervalTurns: level.wandering.interval_turns,
      customTable: level.wandering.table != null,
    },
    knownBounds: boundsOf(knownCells),
    bounds: boundsOf(cells) ?? { minX: 0, minY: 0, maxX: level.width, maxY: level.height },
  };
}

/** The parts of a `RefereeView` that `fromReferee` and `refereeLight` read. */
export interface RefereeMapSource {
  adventure: { dungeons: DungeonSpec[] };
  dungeon_state: DungeonState;
  /** `RefereeView.ledger`. Only each effect's target and kind and its radius parameters are read. */
  ledger?: {
    effects: { target_ref: string; definition: { kind: string; params: Record<string, unknown> } }[];
  };
  /** `RefereeView.party`. Only the member ids are read. */
  party?: { members: { id?: string | null }[] };
}

/** Every level key in a referee view's adventure, the party's level first. */
export function refereeLevelKeys(source: RefereeMapSource): string[] {
  const keys = source.adventure.dungeons.flatMap((dungeon) =>
    dungeon.levels.map((level) => levelKey(dungeon.id, level.number)),
  );
  const current = currentLevelKey({ location: source.dungeon_state.location });
  if (current && keys.includes(current)) return [current, ...keys.filter((key) => key !== current)];
  return keys;
}

/**
 * Builds the referee's map of one level straight from a referee view. Pass a level key, or leave it
 * out for the party's level. Returns `null` when the adventure has no such level.
 */
export function fromReferee(source: RefereeMapSource, key?: string): LevelMap | null {
  const wanted = key ?? refereeLevelKeys(source)[0];
  if (wanted === undefined) return null;
  const parsed = parseLevelKey(wanted);
  if (!parsed) return null;
  const dungeon = source.adventure.dungeons.find((d) => d.id === parsed.dungeonId);
  const level = dungeon?.levels.find((l) => l.number === parsed.levelNumber);
  if (!dungeon || !level) return null;
  return fromRefereeView(level, source.dungeon_state, { dungeonId: dungeon.id, light: refereeLight(source) });
}

/**
 * The party's light from the referee view's effects ledger: the largest radius of any light effect
 * on a party member, or `null` when no member has light or darkness puts it out.
 */
export function refereeLight(source: RefereeMapSource): { radiusFeet: number } | null {
  const ledger = source.ledger;
  if (!ledger) return null;
  const members = new Set(
    (source.party?.members ?? []).map((member) => member.id).filter((id) => id != null),
  );
  const onParty = ledger.effects.filter((effect) => members.size === 0 || members.has(effect.target_ref));
  if (!hasLight(onParty.map((effect) => effect.definition.kind))) return null;
  let radius = 0;
  for (const effect of onParty) {
    if (!LIGHT_EFFECT_KINDS.has(effect.definition.kind)) continue;
    const params = effect.definition.params;
    const raw = params['light_radius_feet'] ?? params['radius_feet'];
    radius = Math.max(radius, typeof raw === 'number' ? raw : DEFAULT_LIGHT_RADIUS_FEET);
  }
  return { radiusFeet: radius || DEFAULT_LIGHT_RADIUS_FEET };
}

// ---------------------------------------------------------------------------------------------

function hasLight(kinds: string[]): boolean {
  return (
    kinds.some((kind) => LIGHT_EFFECT_KINDS.has(kind)) &&
    !kinds.some((kind) => DARKNESS_EFFECT_KINDS.has(kind))
  );
}

function partyOn(
  location: Schemas['PartyLocation'],
  dungeonId: string,
  levelNumber: number,
): MapParty | null {
  if (
    location.kind !== 'dungeon' ||
    location.dungeon_id !== dungeonId ||
    location.level_number !== levelNumber
  ) {
    return null;
  }
  if (!location.position) return null;
  return { x: location.position[0], y: location.position[1], facing: location.facing ?? 'north' };
}

function pileFeature(cell: Cell, contents: string[], known: boolean): MapFeature {
  return {
    id: `pile@${cell[0]},${cell[1]}`,
    kind: 'pile',
    x: cell[0],
    y: cell[1],
    areaWide: false,
    areaId: null,
    description: 'Dropped goods.',
    emptied: false,
    found: null,
    trap: null,
    contents,
    known,
  };
}

function transitionId(kind: TransitionKind, x: number, y: number, side: Direction | null): string {
  return side ? `${kind}@${x},${y}:${side}` : `${kind}@${x},${y}`;
}

function coinLines(coins: Coins): string[] {
  return (['pp', 'gp', 'ep', 'sp', 'cp'] as const).filter((d) => coins[d] > 0).map((d) => `${coins[d]} ${d}`);
}

function magicItemName(item: Schemas['MagicItemInstance']): string {
  const name = item.template_id.replaceAll('_', ' ');
  return item.quantity > 1 ? `${name}×${item.quantity}` : name;
}

function describeContents(spec: FeatureSpec): string[] {
  const lines = coinLines(spec.coins);
  for (const id of spec.item_ids) lines.push(id.replaceAll('_', ' '));
  for (const id of spec.magic_item_ids) lines.push(id.replaceAll('_', ' '));
  for (const valuable of spec.valuables) lines.push(valuable.name || valuable.kind);
  return lines;
}

/** A short summary of a trap's effect, for the referee. */
export function describeTrap(trap: TrapSpec): string {
  const effect = trap.effect;
  const parts: string[] = [];
  if (effect.fall_feet) parts.push(`${effect.fall_feet}' fall`);
  if (effect.damage_dice)
    parts.push(`${effect.volley_dice ? `${effect.volley_dice}× ` : ''}${effect.damage_dice} damage`);
  if (effect.kills) parts.push('deadly');
  if (effect.condition) parts.push(String(effect.condition).replaceAll('_', ' '));
  if (effect.save) parts.push('save allowed');
  if (effect.transition) parts.push('moves the party');
  if (effect.manual) parts.push(effect.manual);
  return parts.length > 0 ? parts.join(', ') : 'Trap';
}

function describeTrapState(trap: TrapSpec, state: TrapState): MapTrap {
  return { state, trigger: trap.trigger, summary: describeTrap(trap) };
}

export function boundsOf(cells: readonly { x: number; y: number }[]): Bounds | null {
  if (cells.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y } of cells) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + 1 > maxX) maxX = x + 1;
    if (y + 1 > maxY) maxY = y + 1;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * The label position for an area: the centre of the cell farthest from any cell outside the area,
 * with ties going to the cell nearest the area's centroid. It keeps a label inside an L-shaped room.
 */
export function labelAnchor(
  cells: readonly (readonly [number, number])[],
  occupied: ReadonlySet<string> = new Set(),
): Point {
  if (cells.length === 0) return { x: 0, y: 0 };
  const inside = new Set(cells.map(([x, y]) => cellKey(x, y)));
  const depth = new Map<string, number>();
  let frontier: (readonly [number, number])[] = [];
  for (const [x, y] of cells) {
    const edge = DIRECTIONS.some((d) => {
      const [nx, ny] = step(x, y, d);
      return !inside.has(cellKey(nx, ny));
    });
    if (edge) {
      depth.set(cellKey(x, y), 0);
      frontier.push([x, y]);
    }
  }
  let level = 0;
  while (frontier.length > 0) {
    level += 1;
    const next: (readonly [number, number])[] = [];
    for (const [x, y] of frontier) {
      for (const d of DIRECTIONS) {
        const [nx, ny] = step(x, y, d);
        const k = cellKey(nx, ny);
        if (inside.has(k) && !depth.has(k)) {
          depth.set(k, level);
          next.push([nx, ny]);
        }
      }
    }
    frontier = next;
  }
  const cx = cells.reduce((sum, [x]) => sum + x + 0.5, 0) / cells.length;
  const cy = cells.reduce((sum, [, y]) => sum + y + 0.5, 0) / cells.length;
  let best = cells[0] ?? [0, 0];
  let bestDepth = -1;
  let bestDistance = Infinity;
  // A cell that holds stairs or a feature keeps its glyph clear of the label, when there's a choice.
  const free = cells.filter(([x, y]) => !occupied.has(cellKey(x, y)));
  for (const cell of free.length > 0 ? free : cells) {
    const d = depth.get(cellKey(cell[0], cell[1])) ?? 0;
    const distance = (cell[0] + 0.5 - cx) ** 2 + (cell[1] + 0.5 - cy) ** 2;
    if (d > bestDepth || (d === bestDepth && distance < bestDistance)) {
      best = cell;
      bestDepth = d;
      bestDistance = distance;
    }
  }
  // A room with an even span centres better between two cells than on one of them.
  const span = depth.get(cellKey(best[0], best[1])) ?? 0;
  const centroidCell = cellKey(Math.floor(cx), Math.floor(cy));
  const centroidFree = inside.has(centroidCell) && !occupied.has(centroidCell);
  if (
    span >= 1 &&
    centroidFree &&
    Math.abs(cx - (best[0] + 0.5)) <= 0.5 &&
    Math.abs(cy - (best[1] + 0.5)) <= 0.5
  ) {
    return { x: cx, y: cy };
  }
  return { x: best[0] + 0.5, y: best[1] + 0.5 };
}

/** The light radius in cells, as osrlib rounds it. */
export function lightRadiusCells(light: { radiusFeet: number } | null): number {
  return light ? Math.max(1, Math.floor(light.radiusFeet / CELL_FEET)) : 0;
}
