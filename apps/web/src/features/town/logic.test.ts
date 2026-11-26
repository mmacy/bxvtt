import type { MemberView, PlayerView } from '@bxvtt/shared/bxapi';
import { contextFromPlayerView } from '@bxvtt/shared/text';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { cartCount, cartLines, cartTotal, purchaseItemIds } from './cartLines';
import { gaps, readinessChecklist } from './checklist';
import { describeItem, lotSentence, type ShopItem } from './equipment';
import { serviceReason } from './hooks';
import { classLine } from './parts';
import { describeChanges } from './RestAndPrepare';
import { summarizeEntry } from './Glance';
import { hasSleptSincePreparing, spellAdvice, spellAdviceStatus, spellAdviceText } from './SpellAdvice';
import { gameEntry, makeCaster } from './testKit';
import { readInventory } from './inventory';
import { neediestFirst, memberStatus } from './members';
import { buildCommand, missingRequired, readFields } from './schemaForm';
import { parseService, placeName, sectionOf, townListsService } from './services';

function shopItem(id: string, name: string, cost: number, lotSize = 1): ShopItem {
  const detail = {
    item_type: 'gear',
    id,
    name,
    cost_gp: cost,
    lot_size: lotSize,
    capacity_coins: null,
    combat: null,
    params: {},
    overrides_applied: [],
  } as unknown as ShopItem['detail'];
  return { summary: { id, name, item_type: 'gear', cost_gp: cost }, detail };
}

const CTX = contextFromPlayerView(fixtureSnapshot('town', 'player').game?.view as PlayerView);

describe('the cart', () => {
  const torch = shopItem('torch', 'Torches (6)', 1, 6);
  const rope = shopItem('rope', 'Rope (50’)', 1, 1);
  const items = [torch, rope];

  it('prices each line and repeats an item once for each lot', () => {
    const lines = cartLines({ torch: 2, rope: 1, gone: 3 }, items);
    expect(lines.map((line) => [line.item.summary.id, line.lots, line.costGp])).toEqual([
      ['torch', 2, 2],
      ['rope', 1, 1],
    ]);
    expect(cartTotal(lines)).toBe(3);
    expect(purchaseItemIds(lines)).toEqual(['torch', 'torch', 'rope']);
    expect(cartCount({ torch: 2, rope: 1 })).toBe(3);
  });

  it('explains a purchase lot in plain words', () => {
    expect(lotSentence(torch, 1, CTX)).toBe('Comes as 6 torches');
    expect(lotSentence(torch, 3, CTX)).toBe('Comes as 18 torches');
    expect(lotSentence(rope, 1, CTX)).toBeNull();
    expect(lotSentence(shopItem('rations_standard', 'Rations (standard, 7 days)', 5, 7), 1, CTX)).toBe(
      'Comes as 7 standard rations',
    );
  });
});

describe('the readiness checklist', () => {
  it('names who carries a light and what is missing', () => {
    const party = fixtureSnapshot('town', 'player').game?.view.party ?? [];
    const checklist = readinessChecklist(party);
    const light = checklist.find((line) => line.key === 'light');
    expect(light?.covered).toBe(true);
    expect(light?.detail).toBe('Brenna and Tamsin carry torches or a lantern.');
    expect(gaps(checklist).map((line) => line.key)).toEqual(['tinder', 'rations', 'rope']);
  });
});

function packWith(party: MemberView[], names: string[], ids: string[]): MemberView[] {
  const copy = structuredClone(party);
  for (const member of copy) {
    const inventory = member.inventory as { items: unknown[] };
    inventory.items = names.includes(member.name)
      ? ids.map((id) => ({
          instance_type: 'item',
          template: { item_type: 'gear', id, name: id },
          quantity: 1,
        }))
      : [];
  }
  return copy;
}

describe('the checklist wording', () => {
  const base = fixtureSnapshot('town', 'player').game?.view.party ?? [];
  const kit = ['torch', 'tinder_box', 'rations_standard', 'rope'];
  const details = (party: MemberView[]) => readinessChecklist(party).map((line) => line.detail);

  it('uses carries for one member', () => {
    expect(details(packWith(base, ['Brenna'], kit))).toEqual([
      'Brenna carries torches or a lantern.',
      'Brenna carries a tinder box.',
      'Brenna carries rations.',
      'Brenna carries rope.',
    ]);
  });

  it('uses carry for two or more members', () => {
    expect(details(packWith(base, ['Brenna', 'Wren'], kit))).toEqual([
      'Brenna and Wren carry torches or a lantern.',
      'Brenna and Wren carry a tinder box.',
      'Brenna and Wren carry rations.',
      'Brenna and Wren carry rope.',
    ]);
    expect(details(packWith(base, ['Brenna', 'Wren', 'Osric'], ['rope']))[3]).toBe(
      'Brenna, Wren, and Osric carry rope.',
    );
  });

  it('reads as a suggestion when nobody carries the item', () => {
    expect(details(packWith(base, [], kit))).toEqual([
      'Bring torches or a lantern to see underground.',
      'You need a tinder box to light torches and lanterns.',
      'Pack food for multi-day expeditions.',
      'Bring rope for pits, ledges, and climbing.',
    ]);
  });
});

describe('counted words', () => {
  it('uses the singular for one', () => {
    const torch = {
      summary: { id: 'torch', name: 'Torches (6)', item_type: 'gear', cost_gp: 1 },
      detail: {
        item_type: 'gear',
        id: 'torch',
        name: 'Torches (6)',
        cost_gp: 1,
        lot_size: 6,
        capacity_coins: 1,
        combat: null,
        params: { light_radius_feet: 1, burn_turns: 1 },
        overrides_applied: [],
      },
    } as unknown as ShopItem;
    const facts = describeItem(torch, CTX);
    expect(facts.notes).toContain('Light reaches 1 foot. Burns for 1 turn.');
    expect(facts.facts).toContainEqual({ label: 'Capacity', value: '1 coin' });
  });

  it('says one hit point, not one hit points', () => {
    const before = structuredClone(fixtureSnapshot('town', 'player').game?.view) as PlayerView;
    const after = structuredClone(before);
    const wren = after.party.find((member) => member.name === 'Wren');
    const was = before.party.find((member) => member.name === 'Wren');
    if (!wren || !was) throw new Error('No Wren.');
    was.current_hp = wren.max_hp - 1;
    wren.current_hp = wren.max_hp;
    expect(describeChanges(before, after)).toEqual([
      `Wren recovered 1 hit point and has ${wren.max_hp} of ${wren.max_hp}.`,
    ]);
  });
});

describe('members', () => {
  it('puts the dead, then the afflicted, then the hurt before everyone else', () => {
    const party = structuredClone(fixtureSnapshot('town', 'player').game?.view.party ?? []);
    const [brenna, wren, osric, tamsin] = party;
    if (!brenna || !wren || !osric || !tamsin) throw new Error('The fixture party changed.');
    wren.current_hp = 1;
    osric.conditions = ['poisoned'];
    tamsin.conditions = ['dead'];
    expect(neediestFirst(party).map((member) => member.name)).toEqual(['Tamsin', 'Osric', 'Wren', 'Brenna']);
    expect(memberStatus(wren)).toMatchObject({ hurt: true, dead: false });
    expect(memberStatus(osric).afflictions).toEqual(['Poisoned']);
  });

  it('names a member’s class as the view states it, and from the catalog for an older view', () => {
    const brenna = structuredClone(fixtureSnapshot('town', 'player').game?.view.party[0]);
    if (!brenna) throw new Error('No Brenna.');
    expect(classLine({ ...brenna, class_id: 'fighter', class_name: '', level: 3 })).toBe('Fighter 3');
    expect(classLine({ ...brenna, class_id: 'hollow_knight', class_name: 'Hollow knight', level: 3 })).toBe(
      'Hollow knight 3',
    );
  });

  it('reads the purse, the worn gear, and the pack', () => {
    const brenna = fixtureSnapshot('town', 'player').game?.view.party[0];
    if (!brenna) throw new Error('No Brenna.');
    const inventory = readInventory(brenna);
    expect(inventory.purse.gp).toBe(59);
    expect(inventory.items.map((item) => [item.name, item.equipped, item.quantity])).toEqual([
      ['Leather', true, 1],
      ['Sword', true, 1],
      ['Torches (6)', false, 6],
    ]);
  });
});

describe('the schema form', () => {
  const giveItems = {
    required: ['character_id', 'recipient_id'],
    properties: {
      command_type: { const: 'give_items' },
      source: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      character_id: { type: 'string' },
      recipient_id: { type: 'string' },
      item_ids: { type: 'array', items: { type: 'string' } },
      coins: { $ref: '#/$defs/Coins' },
    },
    $defs: {
      Coins: { type: 'object', properties: { pp: {}, gp: {}, ep: {}, sp: {}, cp: {} } },
    },
  };

  it('reads fields, required first, and resolves references', () => {
    const fields = readFields(giveItems);
    expect(fields.map((field) => [field.name, field.kind, field.required])).toEqual([
      ['character_id', 'text', true],
      ['recipient_id', 'text', true],
      ['item_ids', 'list', false],
      ['coins', 'coins', false],
    ]);
  });

  it('reads an enum behind an optional anyOf and a service choice', () => {
    const fields = readFields({
      required: ['service'],
      properties: {
        service: { enum: ['a', 'b'], type: 'string' },
        caster_level: { anyOf: [{ type: 'integer' }, { type: 'null' }], default: null },
      },
    });
    expect(fields).toEqual([
      { name: 'service', kind: 'enum', required: true, options: ['a', 'b'] },
      { name: 'caster_level', kind: 'integer', required: false, options: [] },
    ]);
  });

  it('builds a command from the values and leaves out empty fields', () => {
    const fields = readFields(giveItems);
    const built = buildCommand('give_items', fields, {
      character_id: 'character-0001',
      recipient_id: 'character-0002',
      item_ids: ['torch', 'torch'],
      coins: { pp: 0, gp: 5, ep: 0, sp: 0, cp: 0 },
    });
    expect(built).toEqual({
      command: {
        command_type: 'give_items',
        character_id: 'character-0001',
        recipient_id: 'character-0002',
        item_ids: ['torch', 'torch'],
        coins: { pp: 0, gp: 5, ep: 0, sp: 0, cp: 0 },
      },
    });
    expect(missingRequired(fields, { character_id: 'x' })).toEqual(['recipient_id']);
  });

  it('refuses a JSON field that is not JSON', () => {
    const fields = readFields({ properties: { selections: { type: 'array', items: { type: 'object' } } } });
    expect(buildCommand('prepare_spells', fields, { selections: '[{' })).toEqual({
      error: 'One field is not valid JSON. Check the brackets and quotes, then try again.',
    });
  });
});

describe("the town's service lines", () => {
  const lines = [
    "Ostler's store: weapons, armour, and adventuring gear",
    'Temple of the Lantern: cure light wounds, cure serious wounds, and raise dead',
    'Widow Marl, moneychanger: buys gems, jewellery, and coin',
    'The Smoked Eel: beds, hot food, and a quiet corner to study spells',
  ];

  it('splits a line into a name and what it offers', () => {
    expect(parseService(lines[0] ?? '')).toEqual({
      name: "Ostler's store",
      offer: 'weapons, armour, and adventuring gear',
    });
    expect(parseService('The ferry')).toEqual({ name: 'The ferry', offer: '' });
  });

  it('matches each line to the part of town that does the job', () => {
    expect(lines.map(sectionOf)).toEqual(['outfitter', 'temple', 'treasure', 'rest']);
    expect(placeName('treasure', lines)).toBe('Widow Marl, moneychanger');
    expect(placeName('temple', ['Hob Tanner: weapons'])).toBeNull();
  });

  it('hides a service the town does not list, unless the lines are unreadable', () => {
    expect(townListsService('temple', [lines[0] ?? ''])).toBe(false);
    expect(townListsService('outfitter', [lines[0] ?? ''])).toBe(true);
    expect(townListsService('temple', [])).toBe(true);
    expect(townListsService('temple', ['A quiet crossroads'])).toBe(true);
  });
});

describe('spells to prepare', () => {
  const night = gameEntry(10, 'rest', [
    { event_type: 'rested', code: 'exploration.rest.rested', kind: 'night' },
  ]);
  const prepared = (caster: string) =>
    gameEntry(11, 'prepare_spells', [
      { event_type: 'spells_memorized', code: 'magic.memorize.prepared', caster_id: caster },
    ]);

  function party(mutate: (snapshot: ReturnType<typeof fixtureSnapshot>) => void) {
    const snapshot = fixtureSnapshot('town', 'player');
    mutate(snapshot);
    return snapshot.game?.view.party ?? [];
  }

  it('warns about a magic-user with a book and nothing memorized, by name', () => {
    const members = party((s) => makeCaster(s, 'Tamsin', 'magic_user', { book: 1 }));
    const advice = spellAdvice(members, []);
    expect(advice.needRest.map((m) => m.name)).toEqual(['Tamsin']);
    expect(spellAdviceText(advice)).toBe("Tamsin needs a night's rest before preparing spells.");
  });

  it('says have for two casters and can prepare after a night', () => {
    const members = party((s) => {
      makeCaster(s, 'Tamsin', 'magic_user', { book: 1 });
      makeCaster(s, 'Wren', 'magic_user', { book: 2 });
    });
    expect(spellAdviceText(spellAdvice(members, []))).toBe(
      "Wren and Tamsin need a night's rest before preparing spells.",
    );
    expect(spellAdviceText(spellAdvice(members, [night]))).toBe('Wren and Tamsin can prepare spells now.');
  });

  it('needs a new night after each preparation', () => {
    expect(hasSleptSincePreparing([night], 'character-0004')).toBe(true);
    expect(hasSleptSincePreparing([night, prepared('character-0004')], 'character-0004')).toBe(false);
    expect(hasSleptSincePreparing([night, prepared('character-0001')], 'character-0004')).toBe(true);
    const interrupted = gameEntry(12, 'rest', [
      { event_type: 'rested', code: 'exploration.rest.interrupted', kind: 'night' },
    ]);
    expect(hasSleptSincePreparing([interrupted], 'character-0004')).toBe(false);
    const turn = gameEntry(13, 'rest', [
      { event_type: 'rested', code: 'exploration.rest.rested', kind: 'turn' },
    ]);
    expect(hasSleptSincePreparing([turn], 'character-0004')).toBe(false);
  });

  it('gives no warning to a first-level cleric, a mage with an empty book, or a member with spells memorized', () => {
    expect(
      spellAdvice(
        party((s) => makeCaster(s, 'Osric', 'cleric')),
        [],
      ),
    ).toEqual({ needRest: [], canPrepare: [] });
    expect(
      spellAdvice(
        party((s) => makeCaster(s, 'Tamsin', 'magic_user', { book: 0 })),
        [],
      ),
    ).toEqual({ needRest: [], canPrepare: [] });
    const memorized = party((s) => {
      makeCaster(s, 'Tamsin', 'magic_user', { book: 1 });
      const tamsin = s.game?.view.party.find((m) => m.name === 'Tamsin');
      if (tamsin) tamsin.memorized_spells = [{ spell_id: 'sleep' }];
    });
    expect(spellAdvice(memorized, [])).toEqual({ needRest: [], canPrepare: [] });
  });

  it('warns about a second-level cleric, who has slots and no book', () => {
    const members = party((s) => makeCaster(s, 'Osric', 'cleric', { level: 2 }));
    expect(spellAdvice(members, []).needRest.map((m) => m.name)).toEqual(['Osric']);
  });

  it('includes a caster of a custom class from the view alone, beside a 1st-level cleric it leaves out', () => {
    const members = party((s) => {
      makeCaster(s, 'Tamsin', 'hedge_mage', {
        level: 2,
        book: 1,
        slots: [2, 0, 0, 0, 0, 0],
        className: 'Hedge Mage',
      });
      makeCaster(s, 'Osric', 'cleric');
    });
    const advice = spellAdvice(members, []);
    expect(advice.needRest.map((m) => m.name)).toEqual(['Tamsin']);
    expect(spellAdviceText(advice)).toBe("Tamsin needs a night's rest before preparing spells.");
  });

  it('reads both groups for a screen reader, joined with and', () => {
    const members = party((s) => {
      makeCaster(s, 'Tamsin', 'magic_user', { book: 1 });
      makeCaster(s, 'Osric', 'cleric', { level: 2 });
    });
    // Osric prepared after the night, so he needs another, and Tamsin hasn't prepared since it.
    const advice = spellAdvice(members, [night, prepared('character-0003')]);
    expect(spellAdviceStatus(advice)).toBe("Osric needs a night's rest, and Tamsin can prepare now");
  });
});

describe('summarizing a town action', () => {
  const line = (eventType: string, text: string, amount?: number) => ({ eventType, text, amount });
  it('headlines the rest, and the hit points it healed, ahead of a burnt-out torch', () => {
    const summary = summarizeEntry('rest', [
      line('effect_expired', 'The torch that Brenna carries burns out.'),
      line('healing_applied', 'Wren regains no hit points.', 0),
      line('rested', 'The party rests for a full day.'),
      line('healing_applied', 'Brenna regains 3 hit points.', 3),
      line('provisions', 'Brenna eats the day’s food.'),
    ]);
    expect(summary.headline).toBe('The party rests for a full day. Brenna regains 3 hit points.');
    expect(summary.rest).toEqual([
      'The torch that Brenna carries burns out.',
      'Wren regains no hit points.',
      'Brenna eats the day’s food.',
    ]);
  });

  it('falls back to the first line for a command it has no headline for', () => {
    expect(summarizeEntry('equip_item', [line('x', 'One.'), line('y', 'Two.')])).toEqual({
      headline: 'One.',
      rest: ['Two.'],
    });
  });
});

describe('why a town service is unavailable', () => {
  const town = 'Nobody in Hollin Ferry sells equipment.';

  it('gives the permission reason when the command is not legal, even if the town offers the service', () => {
    expect(serviceReason(false, true, 'You can buy equipment only in town.', town)).toBe(
      'You can buy equipment only in town.',
    );
  });

  it("names the town when the command is legal but the town doesn't offer the service", () => {
    expect(serviceReason(true, false, null, town)).toBe(town);
  });

  it('gives no reason when the service is available', () => {
    expect(serviceReason(true, true, null, town)).toBeNull();
  });
});
