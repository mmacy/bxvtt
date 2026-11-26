import { contextFromPlayerView } from '@bxvtt/shared/text';
import { describe, expect, it } from 'vitest';
import { itemStackPhrase, pileContents, pileContentsSentence } from './items';
import { pileView, playerView } from './testing/views';

/** The names a player view states for a vial of holy water and an unidentified potion. */
const ctx = contextFromPlayerView(
  playerView({
    item_names: { holy_water: 'vial of holy water', 'magic-item-0003': 'potion' },
    item_names_plural: { holy_water: 'vials of holy water', 'magic-item-0003': 'potions' },
  }),
);

describe('itemStackPhrase', () => {
  it('names one item with its article and several with the count and the view’s plural', () => {
    expect(itemStackPhrase('torch', 1, ctx)).toBe('a torch');
    expect(itemStackPhrase('holy_water', 2, ctx)).toBe('2 vials of holy water');
    expect(itemStackPhrase('magic-item-0003', 1, ctx)).toBe('a potion');
  });
});

describe('pileContents', () => {
  it('lists the coins first, then each entry in order, by the names the players know', () => {
    const pile = pileView({
      coins: { pp: 0, gp: 30, ep: 0, sp: 0, cp: 0 },
      contents: [
        { item_id: 'holy_water', quantity: 2 },
        { item_id: 'torch', quantity: 1 },
        { item_id: 'magic-item-0003', quantity: 1 },
      ],
    });
    expect(pileContents(pile, ctx)).toEqual([
      '30 gold pieces',
      '2 vials of holy water',
      'a torch',
      'a potion',
    ]);
    expect(pileContentsSentence(pile, ctx)).toBe(
      '30 gold pieces, 2 vials of holy water, a torch, and a potion.',
    );
  });

  it('collapses entries the view doesn’t name into one “something else” at the end', () => {
    const pile = pileView({
      contents: [
        { item_id: 'jade_idol', quantity: 1 },
        { item_id: 'torch', quantity: 3 },
        { item_id: 'gilded_skull', quantity: 2 },
      ],
    });
    expect(pileContentsSentence(pile, ctx)).toBe('3 torches and something else.');
    expect(pileContentsSentence(pileView({ contents: [{ item_id: 'jade_idol', quantity: 1 }] }), ctx)).toBe(
      'Something.',
    );
  });

  it('says nothing of an empty pile', () => {
    expect(pileContentsSentence(pileView(), ctx)).toBe('');
  });
});
