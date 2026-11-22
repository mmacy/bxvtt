/** Helpers for the action bar of the play screen. */
import { expect, type Page } from '@playwright/test';

/**
 * Searches the party's area from the action bar's Search menu, as the caller. The menu lists what to search for,
 * and each entry opens a submenu of the member who searches.
 *
 * @param page - The caller's page.
 * @param kind - What to search for, such as "secret doors" or "room traps".
 * @param who - The member who searches.
 */
export async function searchFor(page: Page, kind = 'secret doors', who = 'Brenna'): Promise<void> {
  await page.getByRole('toolbar', { name: 'Party actions' }).getByRole('button', { name: 'Search' }).click();
  const entry = page.getByRole('menuitem', { name: `Search for ${kind}` });
  await expect(entry).toBeVisible();
  await entry.click();
  const member = page.getByRole('menuitem', { name: who, exact: true });
  await expect(member).toBeVisible();
  await member.click();
}

/**
 * Moves the party one cell with an arrow key on the focused dungeon map, as the caller.
 *
 * @param page - The caller's page.
 * @param key - The arrow key.
 */
export async function moveWithKey(
  page: Page,
  key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' = 'ArrowUp',
): Promise<void> {
  const map = page.getByRole('application', { name: /^Dungeon map/ });
  await map.focus();
  await map.press(key);
}
