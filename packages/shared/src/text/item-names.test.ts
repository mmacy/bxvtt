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
  extendContextWithNames,
  resolveItemNoun,
  valuableNames,
  valuablePhrases,
  type PlayerViewLike,
} from './context';
import { itemNounFromName, itemPhrase } from './catalog';
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

/** An `item_acquired` event for a party member taking treasure. */
function takenEvent(itemIds: string[]): GameEvent {
  return {
    event_type: 'item_acquired',
    code: 'exploration.item.acquired',
    visibility: 'player',
    character_id: 'character-0001',
    item_ids: itemIds,
    coins_gp_value: 0,
    origin: 'treasure',
  } as GameEvent;
}

describe("a valuable's own name and phrase", () => {
  /** A player view from osrlib 2.10: two named valuables with phrases, a rolled gem, and a torch. */
  const view: PlayerViewLike = {
    party: [{ id: 'character-0001', name: 'Wren' }],
    item_names: {
      'valuable-0001': 'piece of jewellery',
      'valuable-0002': 'gem',
      'valuable-0003': 'gem',
      'valuable-0004': 'piece of jewellery',
      torch: 'torch',
    },
    item_names_plural: {
      'valuable-0001': 'pieces of jewellery',
      'valuable-0002': 'gems',
      'valuable-0003': 'gems',
      'valuable-0004': 'pieces of jewellery',
      torch: 'torches',
    },
    valuable_names: {
      'valuable-0001': "Prior's chain of office",
      'valuable-0003': 'Moonstone',
      'valuable-0004': "Ossor's Eye",
    },
    valuable_phrases: {
      'valuable-0001': "the prior's chain of office",
      'valuable-0003': 'a moonstone',
      'valuable-0004': "Ossor's Eye",
    },
  };

  it("reads the own names from the view's valuable_names and the phrases from its valuable_phrases", () => {
    expect(valuableNames(view)).toEqual({
      'valuable-0001': "Prior's chain of office",
      'valuable-0003': 'Moonstone',
      'valuable-0004': "Ossor's Eye",
    });
    expect(valuablePhrases(view)).toEqual({
      'valuable-0001': "the prior's chain of office",
      'valuable-0003': 'a moonstone',
      'valuable-0004': "Ossor's Eye",
    });
    expect(valuableNames({ item_names: { 'valuable-0002': 'gem' } })).toEqual({});
  });

  it("words a named valuable by the view's phrase as written, and an unnamed one by its kind", () => {
    const ctx = contextFromPlayerView(view);
    // A phrase that the stand-in would get wrong: a proper name, which the stand-in would give an article.
    expect(itemName('valuable-0004', ctx)).toBe("Ossor's Eye");
    expect(itemName('valuable-0001', ctx)).toBe("the prior's chain of office");
    expect(itemName('valuable-0003', ctx)).toBe('a moonstone');
    expect(itemName('valuable-0002', ctx)).toBe('a gem');
    expect(ctx.itemsPlural?.['valuable-0001']).toBeUndefined();
    expect(itemList(['valuable-0002', 'valuable-0003', 'valuable-0004', 'torch'], ctx)).toEqual([
      'a gem',
      'a moonstone',
      "Ossor's Eye",
      'a torch',
    ]);
  });

  it("uses bxapi's phrase even when it differs from what the name would give", () => {
    const ctx = contextFromPlayerView({
      valuable_names: { 'valuable-0001': 'Unicorn-horn cup' },
      valuable_phrases: { 'valuable-0001': 'a unicorn-horn cup' },
    });
    expect(itemName('valuable-0001', ctx)).toBe('a unicorn-horn cup');
    expect(itemNoun('valuable-0001', ctx)).toBe('unicorn-horn cup');
  });

  it('counts valuables that share a phrase, and lists distinct phrases apart', () => {
    const ctx = contextFromPlayerView({
      valuable_names: {
        'valuable-0001': 'Garnet',
        'valuable-0002': 'Garnet',
        'valuable-0003': 'Topaz',
      },
      valuable_phrases: {
        'valuable-0001': 'a garnet',
        'valuable-0002': 'a garnet',
        'valuable-0003': 'a topaz',
      },
    });
    expect(itemList(['valuable-0001', 'valuable-0002', 'valuable-0003'], ctx)).toEqual([
      '2 garnets',
      'a topaz',
    ]);
  });

  it('keeps the view of a named valuable over the kind that the item names give', () => {
    const ctx = contextFromPlayerView(view);
    expect(describeEvent(takenEvent(['valuable-0004', 'valuable-0001']), ctx).text).toBe(
      "Wren takes Ossor's Eye and the prior's chain of office.",
    );
  });

  it('names a valuable with no name of its own by its kind, with or without item names', () => {
    const named = contextFromPlayerView({
      party: [{ id: 'character-0001', name: 'Wren' }],
      item_names: { 'valuable-0002': 'gem', 'valuable-0005': 'piece of jewellery' },
      item_names_plural: { 'valuable-0002': 'gems', 'valuable-0005': 'pieces of jewellery' },
      valuable_names: {},
      valuable_phrases: {},
    });
    expect(itemName('valuable-0002', named)).toBe('a gem');
    expect(itemName('valuable-0005', named)).toBe('a piece of jewellery');
    expect(valuablePhrases({ valuable_phrases: {} })).toEqual({});
    expect(named.valuablePhrases).toBeUndefined();
    // A view that states no names at all.
    expect(itemName('valuable-0002', emptyContext())).toBe('a gem or jewel');
    expect(describeEvent(takenEvent(['valuable-0002', 'valuable-0005']), named).text).toBe(
      'Wren takes a gem and a piece of jewellery.',
    );
  });

  it("reads a feed entry's recorded valuable phrases as the live view does", () => {
    const ctx = extendContextWithEntryNames(emptyContext(), {
      items: { 'valuable-0001': "Ossor's Eye", 'valuable-0002': 'gem' },
      items_plural: { 'valuable-0002': 'gems' },
      valuable_phrases: { 'valuable-0001': "Ossor's Eye" },
    });
    expect(itemName('valuable-0001', ctx)).toBe("Ossor's Eye");
    expect(itemName('valuable-0002', ctx)).toBe('a gem');
  });

  it('prefers the phrase of the live view over an entry that records a different one', () => {
    const live = contextFromPlayerView(view);
    const ctx = extendContextWithEntryNames(live, {
      items: { 'valuable-0003': 'Moonstone' },
      valuable_phrases: { 'valuable-0003': 'the moonstone' },
    });
    expect(itemName('valuable-0003', ctx)).toBe('a moonstone');
  });

  describe('the fallback for entries stored before osrlib 2.10.0', () => {
    // These entries record a name and no phrase, so the text words the name itself with the stand-in rules.
    it('words a recorded name with an article, and a possessive with the', () => {
      const ctx = extendContextWithEntryNames(emptyContext(), {
        items: {
          'valuable-0001': 'Silver altar candlestick',
          'valuable-0002': 'gem',
          'valuable-0003': "Prior's chain of office",
        },
      });
      expect(itemName('valuable-0001', ctx)).toBe('a silver altar candlestick');
      expect(itemName('valuable-0002', ctx)).toBe('a gem');
      expect(itemName('valuable-0003', ctx)).toBe("the prior's chain of office");
      expect(ctx.valuablePhrases).toBeUndefined();
    });

    it('words a view that states names and no phrases the same way', () => {
      const ctx = contextFromPlayerView({
        item_names: { 'valuable-0003': 'gem' },
        valuable_names: { 'valuable-0003': 'Moonstone', 'valuable-0004': '   ' },
      });
      expect(itemName('valuable-0003', ctx)).toBe('a moonstone');
      expect(ctx.valuablePhrases).toBeUndefined();
      // A blank name is no name, so it keeps the generic phrase.
      expect(itemName('valuable-0004', ctx)).toBe('a gem or jewel');
    });
  });

  it("reads each sample adventure's valuables and keys as the content design asks", () => {
    const names: Record<string, string> = {
      'Silver altar candlestick': 'a silver altar candlestick',
      Moonstone: 'a moonstone',
      'Pair of gilt psalter covers': 'a pair of gilt psalter covers',
      Bloodstone: 'a bloodstone',
      "Abbot's gold ring": "the abbot's gold ring",
      Sapphire: 'a sapphire',
      'Silver chalice': 'a silver chalice',
      Garnet: 'a garnet',
      Topaz: 'a topaz',
      "Prior's chain of office": "the prior's chain of office",
      'Silver brooch': 'a silver brooch',
      'Piece of amber': 'a piece of amber',
      "Prior's iron key": "the prior's iron key",
      'Hand of Saint Corvane': 'the Hand of Saint Corvane',
      'Tongue of Mercy': 'the Tongue of Mercy',
      "Miller Aske's strongbox": "Miller Aske's strongbox",
    };
    for (const [name, phrase] of Object.entries(names)) {
      expect(itemPhrase(itemNounFromName(name)), name).toBe(phrase);
      // The stored form reads the same again, as a feed entry's names do.
      const ctx = extendContextWithNames(emptyContext(), { 'valuable-0001': name });
      expect(itemName('valuable-0001', ctx), name).toBe(phrase);
    }
    expect(itemPhrase(itemNounFromName("Prior's iron key"), 2)).toBe("2 prior's iron keys");
  });
});
