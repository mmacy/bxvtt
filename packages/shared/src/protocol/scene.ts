import { z } from 'zod';

/**
 * The scene is what the server, acting as the referee who describes the room, tells the players about the
 * dungeon beyond bxapi's player view. The player view gives the map's cells and edges but no area names,
 * features, stairs, or found traps, and its messages name things by ID. The server derives the scene from the
 * referee view with conservative rules, and sends it to every member in the `scene` of the game state:
 *
 * - An area appears once the party has walked into one of its cells, with its name, its description, and the
 *   cells of it the party knows.
 * - A treasure cache appears once the party has entered its area (or walked onto its cell, for one outside an
 *   area), until it is emptied, and never while an encounter or battle is open. A cache on a cell appears only
 *   once that cell is on the party's map. A lair hoard appears only after its monsters were slain or routed.
 *   Neither its contents nor its authored description appear. A player's `take_treasure`, `inspect_treasure`,
 *   or `remove_treasure_trap` that names a cache missing from `scene.here.caches` is refused with
 *   `exploration.feature.unknown`, as bxapi refuses a cache that isn't there.
 * - A custom feature appears with its description once the party has entered its area or walked onto its cell.
 *   A construction trick appears only after a search found it.
 * - A transition (stairs, trapdoor, chute, or passage) appears once its cell is on the party's map. The scene
 *   says which way it leads, never where it lands.
 * - A trap appears only after the party found it, it sprang, or a thief removed it.
 * - Nothing about cells off the party's map, monsters, or undiscovered secret doors appears. The player view
 *   already draws a secret door as a wall until the party finds it.
 */

/** A cell position: `[x, y]`. */
export const ScenePosition = z.tuple([z.number().int(), z.number().int()]);

/** A keyed area the party has entered. */
export const SceneArea = z.object({
  id: z.string(),
  name: z.string(),
  /** The author's description of the room, written to show the party when it walks in. */
  description: z.string(),
  /** The cells of the area that are on the party's map. */
  cells: z.array(ScenePosition),
});
/** A keyed area the party has entered. */
export type SceneArea = z.infer<typeof SceneArea>;

/** Where a transition leads: up or down a level, across the same level, or into another dungeon. */
export const TransitionLeads = z.enum(['up', 'down', 'same_level', 'elsewhere']);

/** A transition on a cell the party knows. Send `use_stairs` on its cell, or move through a passage's side. */
export const SceneTransition = z.object({
  kind: z.enum(['stairs_up', 'stairs_down', 'trapdoor', 'chute', 'passage']),
  position: ScenePosition,
  /** The side of the cell a passage stands on, or `null` for stairs, trapdoors, and chutes. */
  side: z.string().nullable(),
  leads: TransitionLeads,
});
/** A transition on a cell the party knows. */
export type SceneTransition = z.infer<typeof SceneTransition>;

/** A trap the party knows about, because it found it, it sprang, or a thief removed it. */
export const SceneTrap = z.object({
  /** `room` traps cover an area. `treasure` traps guard a cache. */
  kind: z.enum(['room', 'treasure']),
  /** When it springs: on `enter`ing the area, or on `open`ing a door or the cache. */
  trigger: z.enum(['enter', 'open']),
  state: z.enum(['found', 'sprung', 'removed']),
  /** The area a room trap covers, or the area of the guarded cache. */
  area_id: z.string().nullable(),
  /** The guarded cache's ID, for a treasure trap. */
  feature_id: z.string().nullable(),
});
/** A trap the party knows about. */
export type SceneTrap = z.infer<typeof SceneTrap>;

/**
 * A treasure cache the party can see, by the ID `take_treasure` takes as `feature_id`. An `authored` cache is
 * one the adventure placed. A `generated` cache is treasure the session rolled, such as a lair hoard, and its
 * ID is the session's `cache-NNNN` reference. The scene never lists a cache's contents, and it leaves out the
 * cache's authored description too, because authors often list the contents there. The area's description
 * usually says what the party sees.
 */
export const SceneCache = z.object({
  id: z.string(),
  source: z.enum(['authored', 'generated']),
  area_id: z.string().nullable(),
  /** The cell it stands on, or `null` for an authored cache the party can reach from any cell of its area. */
  position: ScenePosition.nullable(),
  /** Whether the party can take it from the cell it stands on now. */
  reachable: z.boolean(),
  /** The cache's trap, when the party knows about it. */
  trap: SceneTrap.nullable(),
});
/** A treasure cache the party can see. */
export type SceneCache = z.infer<typeof SceneCache>;

/** A custom feature, or a construction trick that a search found. */
export const SceneFeature = z.object({
  id: z.string(),
  kind: z.enum(['custom', 'construction_trick']),
  description: z.string(),
  area_id: z.string().nullable(),
  /** The cell it stands on, or `null` for a feature of the whole area. */
  position: ScenePosition.nullable(),
});
/** A custom feature, or a found construction trick. */
export type SceneFeature = z.infer<typeof SceneFeature>;

/** What the party knows of one level, for the map. */
export const SceneLevel = z.object({
  dungeon_id: z.string(),
  level_number: z.number().int(),
  areas: z.array(SceneArea),
  transitions: z.array(SceneTransition),
  traps: z.array(SceneTrap),
  caches: z.array(SceneCache),
  features: z.array(SceneFeature),
  /** The cells with a dropped pile, which `take_treasure` takes with `feature_id: "pile"`. */
  piles: z.array(ScenePosition),
});
/** What the party knows of one level. */
export type SceneLevel = z.infer<typeof SceneLevel>;

/**
 * What a party standing on its current cell perceives, with the IDs a command needs. `caches` lists the caches
 * of the area, and `reachable` marks the ones the party can take from this cell.
 */
export const SceneHere = z.object({
  dungeon_id: z.string(),
  level_number: z.number().int(),
  position: ScenePosition,
  area: SceneArea.nullable(),
  caches: z.array(SceneCache),
  features: z.array(SceneFeature),
  transitions: z.array(SceneTransition),
  traps: z.array(SceneTrap),
  /** Whether a dropped pile lies on this cell. */
  pile: z.boolean(),
});
/** What the party perceives where it stands. */
export type SceneHere = z.infer<typeof SceneHere>;

/** The scene: the levels the party knows, what it perceives where it stands, and display names. */
export const Scene = z.object({
  levels: z.array(SceneLevel),
  /** The party's cell in a dungeon, or `null` in town. */
  here: SceneHere.nullable(),
  /**
   * Display names for the item, magic item, and valuable IDs that appear in player events and in the party's
   * inventory, such as `crossbow` or `magic-item-0001`. An unidentified magic item keeps its masked name, such
   * as `a potion`. An ID with no entry has no name the party knows.
   */
  names: z.record(z.string(), z.string()),
});
/** The scene. */
export type Scene = z.infer<typeof Scene>;
