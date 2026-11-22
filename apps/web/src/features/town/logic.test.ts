import type { PlayerView } from '@bxvtt/shared/bxapi';
import { contextFromPlayerView } from '@bxvtt/shared/text';
import { describe, expect, it } from 'vitest';
import { fixtureSnapshot } from '@/app/testing/fixtures';
import { cartCount, cartLines, cartTotal, purchaseItemIds } from './cartLines';
import { gaps, readinessChecklist } from './checklist';
import { lotSentence, type ShopItem } from './equipment';
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
    expect(lotSentence(torch, 1, CTX)).toBe('1 lot is 6 torches');
    expect(lotSentence(torch, 3, CTX)).toBe('3 lots are 18 torches');
    expect(lotSentence(rope, 1, CTX)).toBeNull();
    expect(lotSentence(shopItem('rations_standard', 'Rations (standard, 7 days)', 5, 7), 1, CTX)).toBe(
      '1 lot is 7 standard rations',
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
