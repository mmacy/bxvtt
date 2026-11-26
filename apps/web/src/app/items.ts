/**
 * Item names from the player view, for lists the interface shows: "a torch", "2 vials of holy water", and a pile's
 * contents. The names come from the text context, which reads the view's `item_names` and `item_names_plural`.
 */
import type { PileView } from '@bxvtt/shared/bxapi';
import {
  capitalizeFirst,
  coinParts,
  itemPhrase,
  joinList,
  resolveItemNoun,
  type TextContext,
} from '@bxvtt/shared/text';

/** One kind of item and how many: a pile entry (`PileView.contents`) or an inventory stack. */
export interface ItemStack {
  item_id: string;
  quantity: number;
}

/**
 * One item ID and a count as a phrase: "a torch", "2 vials of holy water", or "something" when nothing names the
 * ID.
 *
 * ```ts
 * itemStackPhrase('holy_water', 2, ctx); // '2 vials of holy water'
 * ```
 */
export function itemStackPhrase(itemId: string, quantity: number, ctx: TextContext): string {
  return itemPhrase(resolveItemNoun(itemId, ctx), quantity);
}

/**
 * Item stacks as list entries, in order. The stacks that nothing names collapse into one entry at the end:
 * "something else" beside named entries, or "something" alone. Pass `named` to count entries listed before these,
 * such as coins.
 *
 * ```ts
 * itemStackPhrases([{ item_id: 'torch', quantity: 1 }, { item_id: 'unknown', quantity: 1 }], ctx);
 * // ['a torch', 'something else']
 * ```
 */
export function itemStackPhrases(stacks: readonly ItemStack[], ctx: TextContext, named = 0): string[] {
  const phrases: string[] = [];
  let unnamed = false;
  for (const stack of stacks) {
    const noun = resolveItemNoun(stack.item_id, ctx);
    if (noun.unnamed === true) unnamed = true;
    else phrases.push(itemPhrase(noun, stack.quantity));
  }
  if (unnamed) phrases.push(phrases.length + named > 0 ? 'something else' : 'something');
  return phrases;
}

/**
 * The contents of a dropped pile as list entries: its coins first, then each entry of `contents` in order.
 *
 * ```ts
 * pileContents(pile, ctx); // ['30 gold pieces', '2 vials of holy water', 'a torch', 'a potion']
 * ```
 */
export function pileContents(pile: Pick<PileView, 'coins' | 'contents'>, ctx: TextContext): string[] {
  const coins = coinParts(pile.coins);
  return [...coins, ...itemStackPhrases(pile.contents, ctx, coins.length)];
}

/**
 * The contents of a dropped pile as one sentence, such as "30 gold pieces, 2 vials of holy water, a torch, and a
 * potion.", or an empty string for a pile with nothing in it.
 */
export function pileContentsSentence(pile: Pick<PileView, 'coins' | 'contents'>, ctx: TextContext): string {
  const entries = pileContents(pile, ctx);
  return entries.length === 0 ? '' : `${capitalizeFirst(joinList(entries))}.`;
}
