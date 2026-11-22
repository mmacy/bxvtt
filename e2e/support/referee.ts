/**
 * Helpers for the referee's side of the play screen: the referee tab of the dock, its sections, the quick
 * actions, the kit's select and combobox controls, and picking a cell on the canvas map.
 */
import { join } from 'node:path';
import { expect, type Locator, type Page } from '@playwright/test';
import { SCREENS_DIR } from './env';

/** Saves a screenshot under `.data/screens/e2e/` for the defect report, such as `referee-now.png`. */
export async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(SCREENS_DIR, `${name}.png`) });
}

/** The prompt above the map while the referee picks the cell to place the party on. It names both ways to pick (R-202). */
export const PLACE_PROMPT =
  'Pick the cell to place the party on. Click it, or use the arrow keys and press Enter.';

/** The prompt above the map while the referee picks a door to change. */
export const DOOR_PROMPT =
  'Pick the door to change. Click it, or use the arrow keys, press E to turn to its side, and press Enter.';

/** The section titles of the referee tab, which name its tabs when the dock is narrow. */
export const REFEREE_SECTIONS = {
  now: 'Here and now',
  actions: 'Quick actions',
  story: 'Quests, flags, and triggers',
  key: 'The adventure key',
  tables: 'Generators',
  log: 'The log behind the screen',
  notes: 'Private notes',
  commands: 'Every referee command',
} as const;

/** Opens the referee tab of the dock and one of its sections, and returns the section's panel. */
export async function openRefereeSection(
  page: Page,
  section: keyof typeof REFEREE_SECTIONS,
): Promise<Locator> {
  const title = REFEREE_SECTIONS[section];
  await page.getByRole('tablist', { name: 'Table panels' }).getByRole('tab', { name: 'Referee' }).click();
  await page
    .getByRole('tablist', { name: 'Referee tools' })
    .getByRole('tab', { name: title, exact: true })
    .click();
  const panel = page.getByRole('tabpanel', { name: title, exact: true });
  await expect(panel).toBeVisible();
  return panel;
}

/**
 * Turns the referee panel's "Show IDs" switch on or off. The panel names everything in words, and shows IDs and
 * cell coordinates only while the switch is on.
 */
export async function showIds(page: Page, on: boolean): Promise<void> {
  const toggle = page.getByRole('tabpanel', { name: 'Referee' }).getByRole('switch', { name: 'Show IDs' });
  if ((await toggle.isChecked()) !== on) await toggle.click();
  if (on) await expect(toggle).toBeChecked();
  else await expect(toggle).not.toBeChecked();
}

/** Opens one quick action of the referee tab, such as "Spawn monsters", and returns its region. */
export async function openQuickAction(page: Page, name: string): Promise<Locator> {
  const panel = await openRefereeSection(page, 'actions');
  const trigger = panel.getByRole('button', { name, exact: true });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  const region = panel.getByRole('region', { name, exact: true });
  await expect(region).toBeVisible();
  return region;
}

/** Chooses an option of the kit's `Select`, which opens a listbox of options. */
export async function choose(page: Page, select: Locator, option: string | RegExp): Promise<void> {
  await select.click();
  await page.getByRole('option', { name: option }).first().click();
}

/** Types into the kit's searchable `Combobox` and picks the first matching option. */
export async function search(
  page: Page,
  combobox: Locator,
  text: string,
  option: string | RegExp,
): Promise<void> {
  await combobox.fill(text);
  const listbox = page.getByRole('listbox');
  await listbox.getByRole('option', { name: option }).first().click();
}

/**
 * Clicks a point of the dungeon map, measured in cells from the map's centre. The map follows the party, so with
 * follow mode on, the party stands at the centre.
 *
 * @param page - The page.
 * @param dx - Cells to the right of the centre.
 * @param dy - Cells below the centre.
 * @param cellPx - CSS pixels per cell at the map's zoom.
 */
export async function clickMapOffset(page: Page, dx: number, dy: number, cellPx = 40): Promise<void> {
  const map = page.getByRole('application', { name: /^Dungeon map/ });
  const box = await map.boundingBox();
  if (box === null) throw new Error('The dungeon map is not on screen.');
  await page.mouse.click(box.x + box.width / 2 + dx * cellPx, box.y + box.height / 2 + dy * cellPx);
}

/** Opens a dialog from the table menu, such as "Saves" or "Seats and caller", and returns it. */
export async function openFromTableMenu(page: Page, item: string, dialogName = item): Promise<Locator> {
  await page.getByRole('button', { name: 'Table menu' }).click();
  // An exact match, because a looser one for "Saves" would also pick "Save the game".
  await page.getByRole('menuitem', { name: item, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: dialogName });
  await expect(dialog).toBeVisible();
  return dialog;
}
