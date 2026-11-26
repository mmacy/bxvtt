import { describe, expect, it } from 'vitest';
import {
  contextFromPlayerView,
  emptyContext,
  extendContextWithEntryNames,
  extendContextWithEvents,
  itemCount,
  itemList,
  itemName,
  resolveItemNoun,
} from './context';
import { describeEvent } from './events';
import type { GameEvent } from './types';

describe('item names from bxapi', () => {
  it("reads a player view's item names and plurals, so a masked item counts by bxapi's plural", () => {
    const ctx = contextFromPlayerView({
      item_names: { 'magic-item-0003': 'shield with a faint aura', ember_lamp: 'ember lamp' },
      item_names_plural: { 'magic-item-0003': 'shields with a faint aura', ember_lamp: 'ember lampes' },
    });
    expect(itemName('magic-item-0003', ctx)).toBe('a shield with a faint aura');
    expect(itemCount('magic-item-0003', 2, ctx)).toBe('2 shields with a faint aura');
    // bxapi's plural wins over the one the text layer would form.
    expect(itemCount('ember_lamp', 3, ctx)).toBe('3 ember lampes');
  });

  it("counts an entry's items by the plurals it recorded", () => {
    const ctx = extendContextWithEntryNames(emptyContext(), {
      items: { 'magic-item-0001': 'pair of boots with a faint aura' },
      items_plural: { 'magic-item-0001': 'pairs of boots with a faint aura' },
    });
    expect(itemList(['magic-item-0001', 'magic-item-0001'], ctx)).toEqual([
      '2 pairs of boots with a faint aura',
    ]);
  });

  it('still reads an entry stored before osrlib 2.8, which has names with articles and no plurals', () => {
    const ctx = extendContextWithEntryNames(emptyContext(), {
      items: {
        'magic-item-0001': 'a potion',
        torch: 'Torches (6)',
        hand_of_saint_corvane: 'Hand of Saint Corvane',
      },
    });
    expect(itemName('magic-item-0001', ctx)).toBe('a potion');
    expect(itemCount('magic-item-0001', 2, ctx)).toBe('2 potions');
    expect(itemCount('torch', 6, ctx)).toBe('6 torches');
    expect(itemName('hand_of_saint_corvane', ctx)).toBe('the Hand of Saint Corvane');
  });

  it('names a built-in item by the display names osrlib states', () => {
    expect(itemCount('staff', 2, emptyContext())).toBe('2 staves');
    expect(resolveItemNoun('boots_of_speed', emptyContext())).toEqual({
      one: 'pair of boots of speed',
      many: 'pairs of boots of speed',
    });
  });

  it("names an identified item by the event's display names, even when no view names it", () => {
    const event = {
      event_type: 'item_identified',
      code: 'items.item.identified',
      visibility: 'player',
      instance_id: 'magic-item-0004',
      template_id: 'ember_wand',
      display_name: 'wand of embers',
      display_name_plural: 'wands of embers',
    } as GameEvent;
    expect(describeEvent(event, emptyContext()).text).toMatch(/turns out to be a wand of embers\.$/);
    const ctx = extendContextWithEvents(emptyContext(), [event]);
    expect(itemCount('magic-item-0004', 2, ctx)).toBe('2 wands of embers');
  });

  it('gives an item that nothing names a generic phrase, never its ID', () => {
    expect(itemName('magic-item-0009', emptyContext())).toBe('a magic item');
    expect(itemName('valuable-0002', emptyContext())).toBe('a gem or jewel');
  });
});
