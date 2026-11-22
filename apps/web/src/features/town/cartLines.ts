/** Pure helpers for the outfitter's cart. */
import type { ShopItem } from './equipment';

/** One line of a cart: an item and how many purchase lots. */
export interface CartLine {
  item: ShopItem;
  lots: number;
  /** Lots times the listed price, in gold pieces. */
  costGp: number;
}

/**
 * Turns a cart into lines, in catalog order, skipping items the catalog no longer lists.
 *
 * @param cart - Lots by catalog item ID.
 * @param items - The catalog.
 */
export function cartLines(cart: Record<string, number>, items: readonly ShopItem[]): CartLine[] {
  const lines: CartLine[] = [];
  for (const item of items) {
    const lots = cart[item.summary.id] ?? 0;
    if (lots > 0) lines.push({ item, lots, costGp: lots * item.summary.cost_gp });
  }
  return lines;
}

/** The total price of a cart, in gold pieces. */
export function cartTotal(lines: readonly CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.costGp, 0);
}

/** How many lots a cart holds in all. */
export function cartCount(cart: Record<string, number>): number {
  return Object.values(cart).reduce((sum, lots) => sum + lots, 0);
}

/**
 * The `item_ids` that `purchase_equipment` takes: one entry for each lot, so two lots of torches repeat the ID.
 *
 * @param lines - The cart's lines.
 */
export function purchaseItemIds(lines: readonly CartLine[]): string[] {
  return lines.flatMap((line) => Array.from({ length: line.lots }, () => line.item.summary.id));
}
