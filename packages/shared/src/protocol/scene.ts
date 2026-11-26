import { z } from 'zod';

/**
 * The scene contains the three things a player needs that bxapi's player view doesn't state yet
 * (https://github.com/mmacy/bxapi/issues/52). The player view itself decides what the party perceives: entered
 * areas, visible features with their `feature:` handles and known trap states, known transitions, the entrance,
 * the dungeons the party has entered, and `can_travel_to_town`. The server derives the scene from the referee view,
 * limits each field to what the party already knows, and sends it to every member in the `scene` of the game state:
 *
 * - `names`: display names for the item IDs in the party's inventory and in player events.
 * - `room_traps`: the room traps the party found, sprang, or saw a thief remove, in areas the player view lists as
 *   entered.
 * - `emptied_features`: the `feature:` handles of the authored treasure caches in the player view that the party
 *   has emptied. The player view keeps an emptied cache in `explored[].features` without marking it.
 *
 * A player's `take_treasure`, `inspect_treasure`, or `remove_treasure_trap` must name a `feature:` handle from the
 * player view or `pile`. The server refuses any other `feature_id` from a player with `exploration.feature.unknown`
 * and doesn't send it to bxapi.
 */

/** A room trap the party knows about, because it found it, it sprang, or a thief removed it. */
export const SceneRoomTrap = z.object({
  dungeon_id: z.string(),
  level_number: z.number().int(),
  /** The ID of the area the trap covers, as in the player view's `explored[].areas[].id`. */
  area_id: z.string(),
  state: z.enum(['found', 'sprung', 'removed']),
});
/** A room trap the party knows about. */
export type SceneRoomTrap = z.infer<typeof SceneRoomTrap>;

/** What the server adds to the player view: item names, known room traps, and emptied caches. */
export const Scene = z.object({
  /**
   * Display names for the item, magic item, and valuable IDs that appear in player events and in the party's
   * inventory, such as `crossbow` or `magic-item-0001`. An unidentified magic item keeps its masked name, such
   * as `a potion`. An ID with no entry has no name the party knows.
   */
  names: z.record(z.string(), z.string()),
  /** The room traps the party knows about, in the areas it has entered. */
  room_traps: z.array(SceneRoomTrap),
  /**
   * The `feature:` handles of the authored treasure caches in the player view that the party has emptied. Draw
   * such a cache as emptied, and don't offer to take it.
   */
  emptied_features: z.array(z.string()),
});
/** What the server adds to the player view. */
export type Scene = z.infer<typeof Scene>;
