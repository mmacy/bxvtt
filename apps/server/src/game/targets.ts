import type { PlayerView } from '@bxvtt/shared/protocol';

/**
 * The fields of a command or a declaration that can name a monster: lists of targets, or one target. The
 * classifier finds them in each command's schema by these names. The command schemas name monster targets only
 * in `cast_spell.targets`, `use_item.targets`, `use_item.target_id`, and `BattleDeclaration.targets`.
 */
export const TARGET_FIELD_NAMES: readonly string[] = ['targets', 'target_id'];

/** The shape of a monster or NPC adventurer ID, such as `monster-0002` or `npc-0001`. */
const CREATURE_ID = /^(?:monster|npc)-\d+$/;

/**
 * The monsters and NPC adventurers that a player may name: every member of every group in the player view's
 * open encounter, whatever its status, and the party members, since an NPC who joined the party is one.
 *
 * @param view - The player view.
 */
export function listedCreatures(view: PlayerView): Set<string> {
  const listed = new Set<string>(view.party.map((member) => member.id));
  for (const group of view.encounter?.groups ?? []) {
    for (const member of group.members) listed.add(member.id);
  }
  return listed;
}

/**
 * Whether a value names a monster or an NPC adventurer: an ID in the session's referee view, or a string shaped
 * like one. The shape makes an ID that doesn't exist read the same as one that does, so a refusal never tells a
 * player which IDs exist.
 *
 * @param value - The value.
 * @param known - The monster and NPC IDs of the session, from the referee view.
 */
function isCreature(value: unknown, known: ReadonlySet<string>): value is string {
  return typeof value === 'string' && (known.has(value) || CREATURE_ID.test(value));
}

/**
 * Finds the first target of a command or a declaration that names a monster or an NPC adventurer the player view
 * doesn't list. bxapi accepts any creature of the session in an out-of-battle `cast_spell` or `use_item`
 * (https://github.com/mmacy/osrlib-python/issues/317), so the server checks a player's targets against the player
 * view before it forwards them.
 *
 * @param body - The command or the declaration.
 * @param fields - The fields that can name a target.
 * @param view - The player view.
 * @param known - The monster and NPC IDs of the session, from the referee view.
 * @returns The field and the ID, or `null` when every target is listed.
 */
export function unlistedTarget(
  body: Record<string, unknown>,
  fields: readonly string[],
  view: PlayerView,
  known: ReadonlySet<string>,
): { field: string; id: string } | null {
  const listed = listedCreatures(view);
  for (const field of fields) {
    const value = body[field];
    for (const entry of Array.isArray(value) ? value : [value]) {
      if (isCreature(entry, known) && !listed.has(entry)) return { field, id: entry };
    }
  }
  return null;
}

/**
 * Makes a value safe to send a player: a monster or NPC ID that the player view doesn't list leaves its list, or
 * becomes `null` elsewhere. A declaration that a referee aimed at a creature the party can't see, or a refusal
 * that names one, reaches a player without the ID.
 *
 * @param value - A declaration, a refusal, or any JSON value. It isn't changed.
 * @param view - The player view.
 * @param known - The monster and NPC IDs of the session, from the referee view.
 * @returns A copy that names only the creatures the player view lists.
 */
export function withoutUnlistedCreatures<T>(value: T, view: PlayerView, known: ReadonlySet<string>): T {
  const listed = listedCreatures(view);
  const hidden = (entry: unknown) => isCreature(entry, known) && !listed.has(entry);
  const strip = (current: unknown): unknown => {
    if (hidden(current)) return null;
    if (Array.isArray(current)) return current.filter((entry) => !hidden(entry)).map(strip);
    if (typeof current === 'object' && current !== null) {
      return Object.fromEntries(Object.entries(current).map(([key, entry]) => [key, strip(entry)]));
    }
    return current;
  };
  return strip(value) as T;
}
