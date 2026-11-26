import { describe, expect, it } from 'vitest';
import type { GameEvent, PlayerView } from '@bxvtt/shared/protocol';
import { itemNames } from './labels';

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
