/** Helpers for the town's tests: command outcomes, a small equipment catalog, and edits to a snapshot. */
import type { CommandResult, GameState } from '@bxvtt/shared/protocol';
import type { Snapshot } from '@/app/testing/fixtures';
import type { FakeApi } from '@/app/testing/renderWithTable';

/** A command outcome that bxapi accepted, with the new game state one revision on. */
export function accepted(
  game: GameState,
  events: CommandResult['events'] = [],
  view?: Partial<GameState['view']>,
): CommandResult {
  const next = { ...game, revision: game.revision + 1, view: { ...game.view, ...view } };
  return {
    accepted: true,
    rejections: [],
    events,
    messages: [],
    mode: next.mode,
    ended: false,
    revision: next.revision,
    game: next,
  };
}

/** A command outcome that bxapi refused. */
export function refused(game: GameState, code: string, params: Record<string, unknown> = {}): CommandResult {
  return {
    accepted: false,
    rejections: [{ code, params } as CommandResult['rejections'][number]],
    events: [],
    messages: [],
    mode: game.mode,
    ended: false,
    revision: game.revision,
    game,
  };
}

const DETAILS: Record<string, unknown> = {
  sword: {
    item_type: 'weapon',
    id: 'sword',
    name: 'Sword',
    cost_gp: 10,
    weight_coins: 60,
    damage: '1d8',
    qualities: ['melee'],
    missile_ranges: null,
    material: 'standard',
    overrides_applied: [],
  },
  leather: {
    item_type: 'armour',
    id: 'leather',
    name: 'Leather',
    cost_gp: 20,
    weight_coins: 200,
    ac: 7,
    ac_ascending: 12,
    ac_bonus: null,
    category: 'light',
    overrides_applied: [],
  },
  torch: {
    item_type: 'gear',
    id: 'torch',
    name: 'Torches (6)',
    cost_gp: 1,
    lot_size: 6,
    capacity_coins: null,
    combat: null,
    params: { brightness: 'flame', burn_turns: 6, light_radius_feet: 30 },
    overrides_applied: [],
  },
  rope: {
    item_type: 'gear',
    id: 'rope',
    name: 'Rope (50’)',
    cost_gp: 1,
    lot_size: 1,
    capacity_coins: null,
    combat: null,
    params: {},
    overrides_applied: [],
  },
};

/** Makes `api.fullCatalog` return the small equipment catalog, and `api.listAdventures` return the adventures. */
export function stubCatalog(api: FakeApi, adventures?: unknown): void {
  const items = Object.values(DETAILS);
  api.fullCatalog.mockImplementation(async (catalog: string) => {
    if (catalog !== 'equipment') throw new Error(`The test did not stub the ${catalog} catalog.`);
    return { catalog, total: items.length, items } as never;
  });
  if (adventures !== undefined) api.listAdventures.mockResolvedValue(adventures as never);
}

/** Puts valuables in a party member's pack in the snapshot. */
export function giveValuables(
  snapshot: Snapshot,
  memberName: string,
  valuables: Array<{ id: string; kind: 'gem' | 'jewellery'; name: string; value: number }>,
): void {
  const member = snapshot.game?.view.party.find((candidate) => candidate.name === memberName);
  if (!member) throw new Error(`No member named ${memberName}.`);
  (member.inventory as Record<string, unknown>).valuables = valuables.map((valuable) => ({
    instance_type: 'valuable',
    instance_id: valuable.id,
    kind: valuable.kind,
    name: valuable.name,
    value_gp: valuable.value,
    weight_coins: 1,
  }));
}

/** The party after a member's pack gains one stack, as a purchase would leave it. */
export function partyWithPackItem(
  game: GameState,
  memberId: string,
  item: { id: string; name: string; itemType: string; quantity?: number },
): GameState['view']['party'] {
  const party = structuredClone(game.view.party);
  const member = party.find((candidate) => candidate.id === memberId);
  if (!member) throw new Error(`No member ${memberId}.`);
  const inventory = member.inventory as { items: unknown[] };
  inventory.items.push({
    instance_type: 'item',
    template: { item_type: item.itemType, id: item.id, name: item.name },
    quantity: item.quantity ?? 1,
  });
  return party;
}

/**
 * Turns a party member into a caster with nothing memorized, with the spell fields bxapi's view states for one:
 * `spell_slots` at the member's level, and the book spells (`sleep`, then `spell-1` and on) as the spells it can
 * prepare. A 1st-level cleric has five empty slots and nothing to prepare, a 2nd-level cleric has one slot and the
 * cleric list to prepare from, and a custom class gets the slots and spells passed to it. A cleric chooses a
 * spell's form when casting, and any other class when memorizing. The caster has to sleep before preparing,
 * as in a new game, unless `slept` is true.
 */
export function makeCaster(
  snapshot: Snapshot,
  memberName: string,
  classId: string,
  options: { book?: number; level?: number; slots?: number[]; className?: string; slept?: boolean } = {},
): void {
  const member = snapshot.game?.view.party.find((candidate) => candidate.name === memberName);
  if (!member) throw new Error(`No member named ${memberName}.`);
  const level = options.level ?? 1;
  const book = Array.from({ length: options.book ?? 0 }, (_, i) => (i === 0 ? 'sleep' : `spell-${i}`));
  const divine = classId === 'cleric';
  const slots =
    options.slots ?? (divine ? [level >= 2 ? 1 : 0, 0, 0, 0, 0] : [Math.min(level, 2), 0, 0, 0, 0, 0]);
  member.class_id = classId;
  if (options.className !== undefined) member.class_name = options.className;
  member.level = level;
  member.memorized_spells = [];
  member.spell_book = divine ? [] : book;
  member.spell_slots = slots;
  member.preparable_spells = !slots.some((n) => n > 0)
    ? []
    : divine
      ? ['cure_light_wounds', 'protection_from_evil']
      : book;
  member.learnable_spells = [];
  member.reverses_at = divine ? 'cast' : 'memorize';
  member.needs_sleep_to_prepare = options.slept !== true;
  member.can_prepare_now = options.slept === true;
}

/** A feed entry for an accepted command whose events are the given ones. */
export function gameEntry(
  seq: number,
  commandType: string,
  events: unknown[],
): Snapshot['feed']['entries'][number] {
  return {
    seq,
    created_at: '2026-11-22T05:30:00Z',
    user_id: null,
    visibility: 'everyone',
    to: [],
    kind: 'game',
    command_type: commandType,
    revision: seq,
    session_id: 'ses_test',
    events: events as never,
    messages: [],
  };
}
