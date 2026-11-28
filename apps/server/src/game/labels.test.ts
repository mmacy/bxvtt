import { describe, expect, it } from 'vitest';
import type { GameEvent, PlayerView } from '@bxvtt/shared/protocol';
import { entryNames, itemNames, newLabelBook } from './labels';

/** A player view that names some items. */
function view(names: Record<string, string>, plurals: Record<string, string> = {}): PlayerView {
  return { item_names: names, item_names_plural: plurals } as unknown as PlayerView;
}

/** An `item_identified` event, as osrlib 2.8 writes it, or as an older save stored it without display names. */
function identified(fields: Record<string, unknown> = {}): GameEvent {
  return {
    event_type: 'item_identified',
    code: 'items.item.identified',
    visibility: 'player',
    instance_id: 'magic-item-0001',
    template_id: 'potion_of_healing',
    ...fields,
  } as unknown as GameEvent;
}

describe('valuable phrases for a feed entry', () => {
  /** A player view that names valuables, with the phrases osrlib 2.10 states. */
  function named(names: Record<string, string>, phrases: Record<string, string> | undefined): PlayerView {
    return {
      item_names: { 'valuable-0001': 'piece of jewellery' },
      item_names_plural: {},
      valuable_names: names,
      ...(phrases === undefined ? {} : { valuable_phrases: phrases }),
    } as unknown as PlayerView;
  }

  it("records each named valuable's phrase from the view", () => {
    const names = itemNames([named({ 'valuable-0001': "Ossor's Eye" }, { 'valuable-0001': "Ossor's Eye" })]);
    expect(names.one.get('valuable-0001')).toBe("Ossor's Eye");
    expect(names.phrases.get('valuable-0001')).toBe("Ossor's Eye");
  });

  it('records no phrase for a view that osrlib 2.9.0 built', () => {
    const names = itemNames([named({ 'valuable-0001': 'Moonstone' }, undefined)]);
    expect(names.one.get('valuable-0001')).toBe('Moonstone');
    expect(names.phrases.has('valuable-0001')).toBe(false);
  });

  it("writes the phrase into the entry's names only for an ID the events name", () => {
    const items = itemNames([named({ 'valuable-0001': 'Moonstone' }, { 'valuable-0001': 'a moonstone' })]);
    const book = newLabelBook();
    const events = [{ event_type: 'item_acquired', item_ids: ['valuable-0001'] }] as unknown as GameEvent[];
    expect(entryNames(events, book, items).valuable_phrases).toEqual({ 'valuable-0001': 'a moonstone' });
    expect(entryNames([], book, items).valuable_phrases).toEqual({});
  });
});

describe('item names for a feed entry', () => {
  it('takes the view from after the command over the one from before', () => {
    const names = itemNames([
      view({ 'magic-item-0001': 'potion' }),
      view({ 'magic-item-0001': 'potion of healing' }),
    ]);
    expect(names.one.get('magic-item-0001')).toBe('potion of healing');
  });

  it("keeps the before-view's masked name for an item identified and used up, and names its template by the event", () => {
    const event = identified({
      display_name: 'potion of healing',
      display_name_plural: 'potions of healing',
    });
    const names = itemNames(
      [view({ 'magic-item-0001': 'potion' }, { 'magic-item-0001': 'potions' }), view({})],
      [event],
    );
    expect(names.one.get('magic-item-0001')).toBe('potion');
    expect(names.many.get('magic-item-0001')).toBe('potions');
    expect(names.one.get('potion_of_healing')).toBe('potion of healing');
    expect(names.many.get('potion_of_healing')).toBe('potions of healing');
  });

  it('names nothing from an event stored before osrlib 2.8, which has no display names', () => {
    const names = itemNames([view({})], [identified()]);
    expect(names.one.has('magic-item-0001')).toBe(false);
    expect(names.one.has('potion_of_healing')).toBe(false);
    expect([...names.one.values()]).not.toContain(undefined);
  });
});
