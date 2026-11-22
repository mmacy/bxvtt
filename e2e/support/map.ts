/**
 * Helpers for the dungeon map and the exploration interface. The map is a canvas, so a spec targets a square by
 * its offset from the party: the map opens centered on the party at 40 pixels a square and, while "Follow the
 * party" is on, keeps the party at the same point on screen.
 */
import { expect, type Locator, type Page } from '@playwright/test';
import type { Actor, Crew } from './fixtures';
import { enterDungeon, openTable, setupTable, type MemberSpec, type SetupResult } from './table';

/** Pixels a square on a freshly opened map. */
export const SQUARE_PX = 40;

/** The dungeon map canvas. */
export function dungeonMap(page: Page): Locator {
  return page.getByRole('application', { name: /^Dungeon map/ });
}

/**
 * The page coordinates of the center of a square, counted in squares from the party's square.
 *
 * @param page - The page.
 * @param dx - Squares east of the party (negative for west).
 * @param dy - Squares south of the party (negative for north).
 */
export async function squarePoint(page: Page, dx: number, dy: number): Promise<{ x: number; y: number }> {
  const box = await dungeonMap(page).boundingBox();
  if (box === null) throw new Error('The dungeon map is not on screen.');
  return { x: box.x + box.width / 2 + dx * SQUARE_PX, y: box.y + box.height / 2 + dy * SQUARE_PX };
}

/**
 * Clicks a square by its offset from the party. The pointer rests on the square first, because the map ignores a
 * click while the camera is still gliding after the party's last move.
 */
export async function clickSquare(page: Page, dx: number, dy: number): Promise<void> {
  const point = await squarePoint(page, dx, dy);
  await page.mouse.move(point.x, point.y);
  await page.waitForTimeout(600);
  await page.mouse.click(point.x, point.y);
}

/**
 * The party's square and facing, as the map's description for screen readers states them.
 *
 * @returns `{ x, y, facing }`.
 */
export async function partyPosition(page: Page): Promise<{ x: number; y: number; facing: string }> {
  const text = await page
    .getByText(/^The party is at \d+, \d+/)
    .first()
    .textContent();
  const match = /The party is at (\d+), (\d+), facing (\w+)/.exec(text ?? '');
  if (match === null) throw new Error(`The map didn't state the party's position: ${text ?? '(nothing)'}`);
  return { x: Number(match[1]), y: Number(match[2]), facing: match[3] ?? '' };
}

/** Waits until the map states that the party stands on a square. */
export async function expectPartyAt(page: Page, x: number, y: number): Promise<void> {
  await expect(page.getByText(new RegExp(`^The party is at ${x}, ${y},`)).first()).toBeAttached();
}

/** The scene panel: where the party stands and what is there. */
export function scenePanel(page: Page): Locator {
  return page.getByRole('region', { name: 'Where the party stands' });
}

/** The action bar's toolbar of party actions. */
export function partyActions(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Party actions' });
}

/**
 * Opens a menu with a button and picks an entry, following submenus.
 *
 * @param trigger - The button that opens the menu.
 * @param path - The entry names, outermost first. A string matches the whole name, a pattern matches part.
 */
export async function pickFromMenu(trigger: Locator, ...path: Array<string | RegExp>): Promise<void> {
  const page = trigger.page();
  await trigger.click();
  for (const [index, name] of path.entries()) {
    const item = page.getByRole('menuitem', { name, exact: typeof name === 'string' }).last();
    await expect(item).toBeVisible();
    if (index < path.length - 1) {
      // Open the submenu with the keyboard, which works whatever the pointer does.
      await item.focus();
      await page.keyboard.press('ArrowRight');
    } else {
      await item.click();
    }
  }
}

/** The menu entries that a button's menu offers, as their accessible names. */
export async function menuEntries(trigger: Locator): Promise<string[]> {
  const page = trigger.page();
  await trigger.click();
  const menu = page.getByRole('menu').last();
  await expect(menu).toBeVisible();
  const names = await menu.getByRole('menuitem').allTextContents();
  await page.keyboard.press('Escape');
  return names.map((name) => name.trim());
}

/** The four members of the exploration party, with the gear the door and treasure tests need. */
export function explorationParty(sam: Actor, ruth: Actor): MemberSpec[] {
  return [
    {
      owner: sam,
      name: 'Brenna',
      classId: 'fighter',
      buy: ['chainmail', 'shield', 'sword', 'torch', 'tinder_box'],
    },
    { owner: sam, name: 'Wren', classId: 'thief' },
    { owner: ruth, name: 'Osric', classId: 'cleric' },
    { owner: ruth, name: 'Tamsin', classId: 'magic_user', buy: ['dagger', 'torch', 'holy_water'] },
  ];
}

/** A table in The Drowned Bell's undercroft, with both people's pages open on the map. */
export interface DungeonTable extends SetupResult {
  ruth: Actor;
  sam: Actor;
}

/**
 * Sets up The Drowned Bell with Ruth as the referee and Sam as the player and caller, takes the party into the
 * priory, and opens both pages.
 *
 * @param crew - The fixture.
 * @param options - The session seed and whether to emulate reduced motion.
 */
export async function dungeonTable(
  crew: Crew,
  options: { seed?: number; reducedMotion?: boolean } = {},
): Promise<DungeonTable> {
  const reducedMotion = options.reducedMotion ? ('reduce' as const) : undefined;
  const ruth = await crew.person('Ruth', { reducedMotion });
  const sam = await crew.person('Sam', { reducedMotion });
  const setup = await setupTable({
    name: 'Undercroft',
    referee: ruth,
    players: [sam],
    party: explorationParty(sam, ruth),
    seed: options.seed,
  });
  await enterDungeon(sam.client, setup.table.id, 'priory');
  await openTable(sam.page, setup.path);
  await openTable(ruth.page, setup.path);
  await expect(dungeonMap(sam.page)).toBeVisible();
  await expect(dungeonMap(ruth.page)).toBeVisible();
  return { ...setup, ruth, sam };
}

/** The text of the notifications region, where the shell shows toasts. */
export function notifications(page: Page): Locator {
  return page.getByRole('region', { name: 'Notifications' });
}
