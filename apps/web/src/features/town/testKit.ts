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

/** Makes `api.rules` answer the equipment list and each item's entry, and nothing else. */
export function stubCatalog(api: FakeApi, adventures?: unknown): void {
  api.rules.mockImplementation(async (path: string) => {
    if (path === 'equipment') {
      const items = Object.values(DETAILS).map((entry) => {
        const detail = entry as { id: string; name: string; item_type: string; cost_gp: number };
        return { id: detail.id, name: detail.name, item_type: detail.item_type, cost_gp: detail.cost_gp };
      });
      return { items, total: items.length, limit: 200, offset: 0 } as never;
    }
    const match = /^equipment\/(.+)$/.exec(path);
    const entry = match?.[1] ? DETAILS[match[1]] : undefined;
    if (entry !== undefined) return entry as never;
    throw new Error(`The test did not stub ${path}.`);
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
