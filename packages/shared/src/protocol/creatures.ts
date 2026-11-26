/**
 * The names that players see for the monsters and NPC adventurers of an open encounter.
 *
 * bxapi's player view lists every creature of each encounter group in `view.encounter.groups[].members`, with its
 * ID (`monster-0002` or `npc-0001`) and a coarse status. A player names a creature by that ID in `targets` or
 * `target_id`, and the browser shows the name from {@link creatureNames} instead of the ID.
 */

/** The parts of an encounter group that {@link creatureNames} reads. A bxapi `EncounterGroupView` fits it. */
export interface CreatureGroupLike {
  id: string;
  label: string;
  members?: ReadonlyArray<{ id: string; status: 'alive' | 'defeated' | 'fled' }>;
}

/** One creature of the open encounter, as the players see it. */
export interface CreatureName {
  /** The creature's ID, such as `monster-0002`. */
  id: string;
  /** The ID of the group the creature stands in now. */
  group_id: string;
  /** The creature's status in the player view. */
  status: 'alive' | 'defeated' | 'fled';
  /** What to call the creature: `Goblin 2`, `Ogre`, or `Mag Corrie`. */
  name: string;
}

/** The kind and the number of an ID such as `monster-0012`, for sorting. */
function idKey(id: string): [string, number] {
  const match = /^(.*?)(\d+)$/.exec(id);
  return match === null ? [id, 0] : [match[1] ?? '', Number(match[2])];
}

function byId(a: string, b: string): number {
  const [kindA, numberA] = idKey(a);
  const [kindB, numberB] = idKey(b);
  if (kindA !== kindB) return kindA < kindB ? -1 : 1;
  return numberA - numberB;
}

/**
 * Names each creature of an encounter. A creature that is the only one of its label in the encounter reads by
 * the label, such as `Ogre` or `Mag Corrie`. Two or more creatures with one label read with numbers, such as
 * `Goblin 1` and `Goblin 2`, counted in the order of their IDs.
 *
 * The numbers stay the same for the whole encounter. The player view lists slain creatures and fled groups as
 * well as living ones, and a creature keeps its ID when its group splits, so a number changes only when another
 * creature of the same label joins: a lone `Ogre` becomes `Ogre 1` when a second ogre arrives.
 *
 * @param groups - The encounter's groups from the player view, or `undefined` outside an encounter.
 * @returns The creatures in the view's order: group by group, and in each group's member order.
 */
export function creatureNames(groups: readonly CreatureGroupLike[] | undefined): CreatureName[] {
  const byLabel = new Map<string, string[]>();
  for (const group of groups ?? []) {
    const ids = byLabel.get(group.label) ?? [];
    for (const member of group.members ?? []) ids.push(member.id);
    byLabel.set(group.label, ids);
  }
  const numbers = new Map<string, number>();
  for (const ids of byLabel.values()) {
    [...ids].sort(byId).forEach((id, index) => numbers.set(id, index + 1));
  }
  const names: CreatureName[] = [];
  for (const group of groups ?? []) {
    const label = group.label.trim() === '' ? 'Monster' : group.label;
    const base = label.charAt(0).toUpperCase() + label.slice(1);
    const shared = (byLabel.get(group.label)?.length ?? 0) > 1;
    for (const member of group.members ?? []) {
      names.push({
        id: member.id,
        group_id: group.id,
        status: member.status,
        name: shared ? `${base} ${numbers.get(member.id) ?? 1}` : base,
      });
    }
  }
  return names;
}
