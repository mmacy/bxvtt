/**
 * What the party perceives where it stands, read from bxapi's player view and the server's scene. The player view
 * decides what the party knows. These functions only pick out the parts at the party's cell, so a screen can
 * list them. Whether a command works there is bxapi's decision, and its refusal explains why.
 */
import type { EnteredAreaView, MapFeatureView, TransitionView } from '@bxvtt/shared/bxapi';
import type { PlayerView, Scene, SceneRoomTrap } from '@bxvtt/shared/protocol';

/** A cell position: `[x, y]`. */
export type Cell = [number, number];

/** The kinds of feature that hold treasure. */
const CACHE_KINDS: ReadonlySet<MapFeatureView['kind']> = new Set(['treasure_cache', 'generated_cache']);

/** A feature of the player view, with what the party can do with it from where it stands. */
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
  /** Whether the party stands where it can reach the feature: on its cell, or anywhere in its area. */
  reachable: boolean;
  /** Whether the party has emptied this cache. */
  emptied: boolean;
}

/** What the party perceives on its current cell. */
export interface Here {
  dungeonId: string;
  levelNumber: number;
  position: Cell;
  /** The entered area that covers the party's cell, or `null` in a passage between areas. */
  area: EnteredAreaView | null;
  /** The treasure caches on the party's cell or in its area, emptied ones included. */
  caches: HereFeature[];
  /** The custom features and found construction tricks on the party's cell or in its area. */
  features: HereFeature[];
  /** The transitions on the party's cell. */
  transitions: TransitionView[];
  /** The room trap the party knows about in its area, or `null`. */
  roomTrap: SceneRoomTrap | null;
  /** Whether a dropped pile lies on the party's cell, which `take_treasure` takes with `feature_id: "pile"`. */
  pile: boolean;
  /** Whether the party stands on the level's entrance. */
  atEntrance: boolean;
}

function sameCell(a: readonly number[] | null | undefined, b: readonly number[]): boolean {
  return a != null && a[0] === b[0] && a[1] === b[1];
}

/**
 * Reads what the party perceives where it stands.
 *
 * The result lists the features on the party's cell and the features of its area. A feature on a cell is
 * reachable from that cell only. An area-wide feature is reachable from any cell of its area, as osrlib looks up
 * the features at the party's location.
 *
 * @param view - The player view.
 * @param scene - The scene, for emptied caches and room traps.
 * @returns `null` in town, or before the view lists the party's level.
 */
export function partyHere(view: PlayerView, scene: Scene | null): Here | null {
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
  const emptied = new Set(scene?.emptied_features ?? []);
  const here: HereFeature[] = [];
  for (const feature of level.features) {
    const inArea = feature.area_id != null && feature.area_id === area?.id;
    const reachable = feature.cell != null ? sameCell(feature.cell, position) : inArea;
    if (!reachable && !inArea) continue;
    here.push({
      id: feature.id,
      kind: feature.kind,
      description: feature.description,
      cell: feature.cell == null ? null : [feature.cell[0], feature.cell[1]],
      areaId: feature.area_id ?? null,
      trapState: feature.trap_state ?? null,
      reachable,
      emptied: emptied.has(feature.id),
    });
  }
  const pileRef = `cell:${dungeonId}:${levelNumber}:${position[0]},${position[1]}`;
  return {
    dungeonId,
    levelNumber,
    position,
    area,
    caches: here.filter((feature) => CACHE_KINDS.has(feature.kind)),
    features: here.filter((feature) => !CACHE_KINDS.has(feature.kind)),
    transitions: level.transitions.filter((transition) => sameCell(transition.position, position)),
    roomTrap:
      area === null
        ? null
        : (scene?.room_traps.find(
            (trap) =>
              trap.dungeon_id === dungeonId && trap.level_number === levelNumber && trap.area_id === area.id,
          ) ?? null),
    pile: pileRef in view.piles,
    atEntrance: sameCell(level.entrance, position),
  };
}

/** The caches where the party stands that it hasn't emptied, which the treasure actions offer. */
export function cachesToTake(here: Here | null): HereFeature[] {
  return (here?.caches ?? []).filter((cache) => !cache.emptied);
}
