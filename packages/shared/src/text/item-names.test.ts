import { describe, expect, it } from 'vitest';
import {
  contextFromPlayerView,
  emptyContext,
  extendContextWithEntryNames,
  extendContextWithEvents,
  itemCount,
  itemList,
  itemName,
  itemNoun,
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

  it('reads an item that nothing names as something, never by the words of its ID', () => {
    const ctx = emptyContext();
    expect(itemName('jade_idol', ctx)).toBe('something');
    expect(itemCount('jade_idol', 3, ctx)).toBe('something');
    expect(itemNoun('jade_idol', ctx)).toBe('something');
    // A name from the view, the catalog, or the caller still wins.
    expect(itemName('torch', ctx)).toBe('a torch');
    expect(itemName('jade_idol', contextFromPlayerView({ item_names: { jade_idol: 'jade idol' } }))).toBe(
      'a jade idol',
    );
    expect(resolveItemNoun('jade_idol', ctx, { name: 'Jade idol' }).one).toBe('jade idol');
  });

  it('collapses the unnamed items of a list into one something at the end', () => {
    const ctx = contextFromPlayerView({ item_names: { jade_idol: 'jade idol' } });
    expect(itemList(['moon_blade', 'jade_idol', 'ember_lamp'], ctx)).toEqual([
      'a jade idol',
      'something else',
    ]);
    expect(itemList(['moon_blade', 'ember_lamp'], ctx)).toEqual(['something']);
  });

  it('reads the events that name an item by ID with something when no name is known', () => {
    const taken = {
      event_type: 'item_acquired',
      code: 'exploration.item.acquired',
      visibility: 'player',
      character_id: 'character-0001',
      item_ids: ['jade_idol'],
      coins_gp_value: 0,
      origin: 'treasure',
    } as GameEvent;
    expect(describeEvent(taken, emptyContext()).text).toMatch(/ takes something\.$/);
    const cursed = {
      event_type: 'curse_revealed',
      code: 'items.item.curse_revealed',
      visibility: 'player',
      character_id: 'character-0001',
      instance_id: 'magic-item-0004',
      template_id: 'unknown_template',
    } as GameEvent;
    expect(describeEvent(cursed, emptyContext()).text).toMatch(
      /^Something .* carries is cursed and cannot be removed\.$/,
    );
    const identified = {
      event_type: 'item_identified',
      code: 'items.item.identified',
      visibility: 'player',
      instance_id: 'magic-item-0004',
      template_id: 'unknown_template',
    } as GameEvent;
    expect(describeEvent(identified, emptyContext()).text).toMatch(/turns out to be something\.$/);
  });
});
