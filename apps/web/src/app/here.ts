/**
 * What the party perceives where it stands, read from bxapi's player view. The player view decides what the party
 * knows and what it can reach. These functions only pick out the parts at the party's cell, so a screen can list
 * them. Whether a command works there is bxapi's decision, and its refusal explains why.
 */
import type { EnteredAreaView, MapFeatureView, PileView, TransitionView } from '@bxvtt/shared/bxapi';
import type { PlayerView } from '@bxvtt/shared/protocol';

/** A cell position: `[x, y]`. */
export type Cell = [number, number];

/** The kinds of feature that hold treasure. */
const CACHE_KINDS: ReadonlySet<MapFeatureView['kind']> = new Set(['treasure_cache', 'generated_cache']);

/** A feature of the player view where the party stands. */
export interface HereFeature {
  /** The `feature:` handle that `take_treasure`, `inspect_treasure`, and `remove_treasure_trap` take. */
  id: string;
  kind: MapFeatureView['kind'];
  /** The author's description, or an empty string for a rolled cache. */
  description: string;
  /** The feature's cell, or `null` for a feature of the whole area. */
  cell: Cell | null;
  areaId: string | null;
  /** The trap state the party knows, or `null` when it knows of no trap. */
  trapState: 'found' | 'sprung' | 'removed' | null;
  /** Whether the treasure commands accept the cache from where the party stands: its ID is in `features_here`. */
  inReach: boolean;
  /** Whether the party has emptied this cache (`MapFeatureView.emptied`). */
  emptied: boolean;
}

/** What the party perceives on its current cell. */
export interface Here {
  dungeonId: string;
  levelNumber: number;
  position: Cell;
  /** Whether the game is in the exploring mode, the only mode in which bxapi lists what the party can reach. */
  exploring: boolean;
  /** The entered area that covers the party's cell, or `null` in a passage between areas. */
  area: EnteredAreaView | null;
  /** The treasure caches on the party's cell or in its area, emptied ones included, in the view's order. */
  caches: HereFeature[];
  /** The custom features and found construction tricks on the party's cell or in its area. */
  features: HereFeature[];
  /** The transitions on the party's cell. */
  transitions: TransitionView[];
  /** The state of the trap the party knows in its area (`EnteredAreaView.trap_state`), or `null`. */
  roomTrap: 'found' | 'sprung' | null;
  /** The pile dropped on the party's cell, which `take_treasure` takes with `feature_id: "pile"`, or `null`. */
  pile: PileView | null;
  /** Whether the party stands on the level's entrance. */
  atEntrance: boolean;
}

function sameCell(a: readonly number[] | null | undefined, b: readonly number[]): boolean {
  return a != null && a[0] === b[0] && a[1] === b[1];
}

/**
 * Reads what the party perceives where it stands.
 *
 * The result lists the features on the party's cell and the features of its area. A cache is in reach when its
 * ID is in the view's `features_here`, which bxapi fills only while the party explores.
 *
 * @param view - The player view.
 * @returns `null` in town, or before the view lists the party's level.
 */
export function partyHere(view: PlayerView): Here | null {
  const location = view.location;
  if (location.kind !== 'dungeon' || location.position == null) return null;
  const { dungeon_id: dungeonId, level_number: levelNumber } = location;
  if (dungeonId == null || levelNumber == null) return null;
  const position: Cell = [location.position[0], location.position[1]];
  const level = view.explored.find(
    (entry) => entry.dungeon_id === dungeonId && entry.level_number === levelNumber,
  );
  if (level === undefined) return null;
  const area = level.areas.find((entry) => entry.cells.some((cell) => sameCell(cell, position))) ?? null;
  const reach = new Set(view.features_here);
  const here: HereFeature[] = [];
  for (const feature of level.features) {
    const inReach = reach.has(feature.id);
    const inArea = feature.area_id != null && feature.area_id === area?.id;
    if (!inReach && !inArea && !sameCell(feature.cell, position)) continue;
    here.push({
      id: feature.id,
      kind: feature.kind,
      description: feature.description,
      cell: feature.cell == null ? null : [feature.cell[0], feature.cell[1]],
      areaId: feature.area_id ?? null,
      trapState: feature.trap_state ?? null,
      inReach,
      emptied: feature.emptied,
    });
  }
  const pileRef = `cell:${dungeonId}:${levelNumber}:${position[0]},${position[1]}`;
  const roomTrap = area?.trap_state;
  return {
    dungeonId,
    levelNumber,
    position,
    exploring: view.mode === 'exploring',
    area,
    caches: here.filter((feature) => CACHE_KINDS.has(feature.kind)),
    features: here.filter((feature) => !CACHE_KINDS.has(feature.kind)),
    transitions: level.transitions.filter((transition) => sameCell(transition.position, position)),
    // A room never shows `removed`, because no command removes a room trap.
    roomTrap: roomTrap === 'found' || roomTrap === 'sprung' ? roomTrap : null,
    pile: view.piles[pileRef] ?? null,
    atEntrance: sameCell(level.entrance, position),
  };
}

/** The caches the treasure commands accept where the party stands: in reach and not emptied. */
export function cachesToTake(here: Here | null): HereFeature[] {
  return (here?.caches ?? []).filter((cache) => cache.inReach && !cache.emptied);
}

/** The caches where the party stands that it hasn't emptied, in reach or not. */
export function cachesNotEmptied(here: Here | null): HereFeature[] {
  return (here?.caches ?? []).filter((cache) => !cache.emptied);
}

/**
 * The number of each rolled treasure (a cache with an empty description) in a list, counting only the rolled
 * ones, in list order, from 1.
 */
export function rolledTreasureNumbers(
  caches: readonly Pick<HereFeature, 'id' | 'description'>[],
): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const cache of caches) {
    if (cache.description.trim() === '') numbers.set(cache.id, numbers.size + 1);
  }
  return numbers;
}

/**
 * The text of a treasure's row in a list: its description, "Treasure lies here." for the one rolled treasure, or
 * "Treasure 2 lies here." when the list has two or more rolled treasures.
 *
 * @param cache - The treasure.
 * @param list - Every treasure on the same list, in order.
 */
export function treasureRowText(
  cache: Pick<HereFeature, 'id' | 'description'>,
  list: readonly Pick<HereFeature, 'id' | 'description'>[],
): string {
  const description = cache.description.trim();
  if (description !== '') return description;
  const numbers = rolledTreasureNumbers(list);
  const n = numbers.get(cache.id);
  return numbers.size > 1 && n !== undefined ? `Treasure ${n} lies here.` : 'Treasure lies here.';
}
