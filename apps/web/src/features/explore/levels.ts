/**
 * Builds the map of one level from what the viewer may know.
 *
 * - A player, and a referee with the lens off, see the player view: the entered areas, the features and
 *   transitions the party knows, the piles, and the entrance. The scene marks the caches the party emptied. The
 *   table's session lore adds what refusals and events taught the party about doors, such as a door that turned
 *   out to be locked.
 * - A referee with the lens on sees the whole keyed level from the adventure document and the referee state.
 *
 * Every function here translates data. None decides what the party could see or do.
 */
import type { ExploredLevelView } from '@bxvtt/shared/bxapi';
import type { PlayerView, RefereeState, Scene } from '@bxvtt/shared/protocol';
import {
  edgeKey,
  fromPlayerView,
  fromReferee,
  levelKey,
  parseLevelKey,
  playerLevelKeys,
  refereeLevelKeys,
  type Direction,
  type FeatureKind,
  type LevelMap,
  type PlayerMapExtras,
  type RefereeMapSource,
} from '@/map';
import type { DoorLore } from './lore';
import { packItems } from './party';

/**
 * Why a control that needs the party on the level shown is unavailable.
 *
 * @param canShowParty - Whether the off-level banner offers its "Show party" button, which takes the viewer back.
 * @param place - How the control's screen names the level: "the level shown" on the map, "this level" in the pins list.
 */
export function partyOffLevelReason(canShowParty: boolean, place = 'the level shown'): string {
  const cause = `The party isn't on ${place}.`;
  return canShowParty ? `${cause} Choose Show party to go back to it.` : cause;
}

/** A level the switcher offers. */
export interface LevelOption {
  key: string;
  dungeonId: string;
  levelNumber: number;
  /** Whether the party stands on it. */
  partyHere: boolean;
}

/** The adventure document's dungeons, when the document has the shape the map builder reads. */
export function adventureDungeons(
  document: Record<string, unknown> | null,
): RefereeMapSource['adventure'] | null {
  if (document === null) return null;
  const dungeons = document['dungeons'];
  if (!Array.isArray(dungeons)) return null;
  return { dungeons: dungeons as RefereeMapSource['adventure']['dungeons'] };
}

/** The source `fromReferee` reads, or `null` without both parts. */
export function refereeSource(
  referee: RefereeState | null,
  document: Record<string, unknown> | null,
): RefereeMapSource | null {
  const adventure = adventureDungeons(document);
  if (referee === null || adventure === null) return null;
  return {
    adventure,
    dungeon_state: referee.dungeon_state,
    ledger: referee.ledger,
    party: referee.party,
  };
}

/**
 * The levels the viewer can look at, the party's first. A player gets the levels on the party's map. A referee
 * with the lens on gets every level of the adventure.
 */
export function levelOptions(view: PlayerView, source: RefereeMapSource | null): LevelOption[] {
  const keys = source ? refereeLevelKeys(source) : playerLevelKeys(view);
  const location = view.location;
  const here =
    location.kind === 'dungeon' && location.dungeon_id != null && location.level_number != null
      ? levelKey(location.dungeon_id, location.level_number)
      : null;
  return keys.flatMap((key) => {
    const parsed = parseLevelKey(key);
    if (!parsed) return [];
    return [{ key, dungeonId: parsed.dungeonId, levelNumber: parsed.levelNumber, partyHere: key === here }];
  });
}

/** The player view's record of one level, or `null`. */
export function viewLevel(view: PlayerView, key: string): ExploredLevelView | null {
  return view.explored.find((level) => levelKey(level.dungeon_id, level.level_number) === key) ?? null;
}

/** The cell of an area nearest its centre, where a marker for the whole area goes. */
export function areaCenterCell(area: {
  cells: readonly (readonly [number, number])[];
}): [number, number] | null {
  if (area.cells.length === 0) return null;
  const cx = area.cells.reduce((sum, [x]) => sum + x + 0.5, 0) / area.cells.length;
  const cy = area.cells.reduce((sum, [, y]) => sum + y + 0.5, 0) / area.cells.length;
  let best = area.cells[0] ?? null;
  let bestDistance = Infinity;
  for (const cell of area.cells) {
    const distance = (cell[0] + 0.5 - cx) ** 2 + (cell[1] + 0.5 - cy) ** 2;
    if (distance < bestDistance) {
      best = cell;
      bestDistance = distance;
    }
  }
  return best ? [best[0], best[1]] : null;
}

function isDirection(value: string | null | undefined): value is Direction {
  return value === 'north' || value === 'east' || value === 'south' || value === 'west';
}

/** The map kind of a player view feature. */
function featureKind(kind: ExploredLevelView['features'][number]['kind']): FeatureKind {
  switch (kind) {
    case 'treasure_cache':
      return 'cache';
    case 'generated_cache':
      return 'generated_cache';
    case 'construction_trick':
      return 'trick';
    case 'custom':
      return 'custom';
  }
}

/**
 * What the player view adds to a player's map of one level: transitions, features, and entered areas. An
 * area-wide feature goes on the cell nearest the centre of the area's walked cells.
 *
 * @param level - The player view's level.
 * @param emptied - The `feature:` handles of the caches the party emptied, from `scene.emptied_features`.
 */
export function viewExtras(
  level: ExploredLevelView | null,
  emptied: ReadonlySet<string> = new Set(),
): PlayerMapExtras {
  if (level === null) return {};
  const features: NonNullable<PlayerMapExtras['features']> = [];
  for (const feature of level.features) {
    const area = level.areas.find((candidate) => candidate.id === feature.area_id);
    const cell = feature.cell ?? (area ? areaCenterCell(area) : null);
    if (!cell) continue;
    const kind = featureKind(feature.kind);
    features.push({
      id: feature.id,
      kind,
      x: cell[0],
      y: cell[1],
      description: feature.description,
      emptied: emptied.has(feature.id),
    });
  }
  return {
    transitions: level.transitions.map((transition) => ({
      kind: transition.kind,
      x: transition.position[0],
      y: transition.position[1],
      side: isDirection(transition.side) ? transition.side : null,
    })),
    features,
    areas: level.areas.map(({ id, name, description, cells }) => ({ id, name, description, cells })),
  };
}

/** The light radius the party's carried light sources state, for the map's light hint. */
export function partyLightRadiusFeet(view: PlayerView): number | undefined {
  const lit = new Set(
    view.effects.filter((effect) => effect.kind === 'light').map((effect) => effect.character_id),
  );
  let radius: number | undefined;
  for (const member of view.party) {
    if (!lit.has(member.id)) continue;
    for (const item of packItems(member)) {
      const value = item.params['light_radius_feet'];
      if (typeof value === 'number') radius = Math.max(radius ?? 0, value);
    }
  }
  return radius;
}

/**
 * Builds a player's map of one level: the player view, the caches the party emptied, the treasure traps it knows,
 * and the door states the table learned this session.
 *
 * @param view - The player view.
 * @param scene - The scene.
 * @param key - The level key, such as `priory:1`.
 * @param doors - What the table learned about doors, by `{dungeon}:{level}:{edge key}`.
 */
export function buildPlayerLevel(
  view: PlayerView,
  scene: Scene | null,
  key: string,
  doors: Readonly<Record<string, DoorLore>> = {},
): LevelMap | null {
  const level = viewLevel(view, key);
  const map = fromPlayerView(view, key, {
    extras: viewExtras(level, new Set(scene?.emptied_features ?? [])),
    lightRadiusFeet: partyLightRadiusFeet(view),
  });
  if (map === null) return null;
  const trapByFeature = new Map(
    (level?.features ?? []).flatMap((feature) =>
      feature.trap_state != null ? [[feature.id, feature.trap_state] as const] : [],
    ),
  );
  const features = map.features.map((feature) => {
    const state = trapByFeature.get(feature.id);
    return state ? { ...feature, trap: { state, trigger: null, summary: 'Treasure trap' } } : feature;
  });
  const edges = map.edges.map((edge) => {
    const lore = doors[`${key}:${edge.key}`];
    if (!lore || edge.door === null) return edge;
    return {
      ...edge,
      door: {
        ...edge.door,
        locked: lore.locked === true ? true : edge.door.locked,
        unlocked: lore.unlocked === true ? true : edge.door.unlocked,
        stuck: lore.stuck === true ? true : edge.door.stuck,
      },
    };
  });
  // The player view states the entrance once its cell is on the party's map, and the map draws it.
  const entrance = level?.entrance ?? null;
  return { ...map, features, edges, entrance: entrance ? [entrance[0], entrance[1]] : map.entrance };
}

/** Builds a referee's map of one level, or `null` when the adventure has no such level. */
export function buildRefereeLevel(source: RefereeMapSource, key: string): LevelMap | null {
  return fromReferee(source, key);
}

/** The key of the door lore for one side of a cell. */
export function doorLoreKey(level: string, x: number, y: number, direction: Direction): string {
  return `${level}:${edgeKey(x, y, direction)}`;
}

/** The name of a level's own wandering monster table in the adventure document, such as "Priory undercroft". */
export function wanderingTableName(
  document: Record<string, unknown> | null,
  dungeonId: string,
  levelNumber: number,
): string | null {
  const dungeon = adventureDungeons(document)?.dungeons.find((d) => d.id === dungeonId);
  const level = dungeon?.levels.find((l) => l.number === levelNumber);
  const table = level?.wandering.table;
  if (!table) return null;
  const label = (table as { label?: unknown }).label;
  return typeof label === 'string' && label.trim() !== '' ? label : null;
}
