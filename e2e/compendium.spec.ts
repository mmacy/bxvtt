/**
 * The rules reference: opening it from the keyboard and the rail, searching, reading an entry, moving back and
 * forward, and closing it again.
 */
import { SCREENS_DIR } from './support/env';
import { expect, test } from './support/fixtures';
import { stagedTable } from './support/states';
import { openTable } from './support/table';

test.describe('rules reference', () => {
  test('a player searches for a spell, reads it, and goes back', async ({ crew }) => {
    const staged = await stagedTable(crew, 'exploring');
    const { page } = staged.sam;
    await openTable(page, staged.path);
    await expect(page.getByRole('application', { name: /^Dungeon map/ })).toBeVisible();

    await page.keyboard.press('b');
    const book = page.getByRole('dialog', { name: 'Rules reference' });
    await expect(book).toBeVisible();
    await expect(book.getByRole('tab', { name: 'Contents' })).toHaveAttribute('aria-selected', 'true');

    const search = book.getByRole('combobox', { name: 'Search the rules' });
    await search.fill('sleep');
    const result = book.getByRole('option', { name: /^Sleep/ }).first();
    await expect(result).toBeVisible();
    await result.click();
    await expect(book.getByRole('heading', { name: 'Sleep' }).first()).toBeVisible();
    await page.screenshot({ path: `${SCREENS_DIR}/compendium-sleep.png` });
    // The entry reads as prose, not as raw catalog fields.
    await expect(book).not.toContainText(/undefined|\[object Object\]|_id\b/);

    await book.getByRole('button', { name: 'Back' }).click();
    await expect(book.getByRole('heading', { name: 'Sleep' })).toHaveCount(0);
    await book.getByRole('button', { name: 'Forward' }).click();
    await expect(book.getByRole('heading', { name: 'Sleep' }).first()).toBeVisible();

    await book.getByRole('button', { name: 'Close' }).click();
    await expect(book).toBeHidden();
    // The rail's book button opens it again at its first page.
    await page.getByRole('button', { name: 'Rules reference' }).click();
    await expect(book.getByRole('tab', { name: 'Contents' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Escape');
    await expect(book).toBeHidden();
  });

  test('each section of the book lists its entries', async ({ crew }) => {
    const staged = await stagedTable(crew, 'town');
    const { page } = staged.sam;
    await openTable(page, staged.path);
    // The play screen loads in parts, so wait for the town before pressing its shortcut.
    await expect(page.getByRole('heading', { name: 'Hollin Ferry', level: 2 })).toBeVisible();
    await page.keyboard.press('b');
    const book = page.getByRole('dialog', { name: 'Rules reference' });
    await expect(book).toBeVisible();
    for (const section of [
      'Classes',
      'Spells',
      'Monsters',
      'Equipment',
      'Magic items',
      'Languages',
      'Tables',
      'Actions',
    ]) {
      await book.getByRole('tab', { name: section }).click();
      const panel = book.getByRole('tabpanel', { name: section });
      await expect(panel).toBeVisible();
      await expect(panel).not.toContainText(/undefined|\[object Object\]|NaN/);
    }
    await book.getByRole('tab', { name: 'Classes' }).click();
    await expect(book.getByRole('tabpanel', { name: 'Classes' })).toContainText('Halfling');
  });

  test('the rules reference opens from the home page and from the lobby', async ({ crew }) => {
    const staged = await stagedTable(crew, 'lobby');
    const { ruth, sam } = staged;
    const book = (page: typeof ruth.page) => page.getByRole('dialog', { name: 'Rules reference' });

    // On the home page, outside any table, the header's button opens the book and an entry reads in full.
    await ruth.page.goto('/');
    await expect(ruth.page.getByRole('heading', { name: 'Your tables', level: 1 })).toBeVisible();
    await ruth.page.getByRole('button', { name: 'Rules reference' }).click();
    await expect(book(ruth.page)).toBeVisible();
    await book(ruth.page).getByRole('combobox', { name: 'Search the rules' }).fill('goblin');
    await book(ruth.page)
      .getByRole('option', { name: /^Goblin/ })
      .first()
      .click();
    await expect(book(ruth.page).getByRole('heading', { name: 'Goblin' }).first()).toBeVisible();
    await expect(book(ruth.page)).not.toContainText(/undefined|\[object Object\]|_id\b/);
    await ruth.page.screenshot({ path: `${SCREENS_DIR}/compendium-home.png` });
    await book(ruth.page).getByRole('button', { name: 'Close' }).click();
    await expect(book(ruth.page)).toBeHidden();
    // The B key opens it there too.
    await ruth.page.keyboard.press('b');
    await expect(book(ruth.page)).toBeVisible();
    await ruth.page.keyboard.press('Escape');
    await expect(book(ruth.page)).toBeHidden();

    // In the lobby, a player opens it from the header and reads a class before bringing a character.
    await openTable(sam.page, staged.path);
    await expect(sam.page.getByRole('heading', { name: 'Party', level: 2 })).toBeVisible();
    await sam.page.getByRole('button', { name: 'Rules reference' }).click();
    await expect(book(sam.page)).toBeVisible();
    await book(sam.page).getByRole('tab', { name: 'Classes' }).click();
    await expect(book(sam.page).getByRole('tabpanel', { name: 'Classes' })).toContainText('Halfling');
    // A demihuman class reads "Demihuman" under its name, not the class name again (R-106).
    await expect(book(sam.page).getByRole('tabpanel', { name: 'Classes' })).toContainText(
      /Dwarf\s*Demihuman/,
    );
    await expect(book(sam.page).getByRole('tabpanel', { name: 'Classes' })).not.toContainText(
      /Dwarf\s*Dwarf/,
    );
    await sam.page.screenshot({ path: `${SCREENS_DIR}/compendium-lobby.png` });
    await sam.page.keyboard.press('b');
    await expect(book(sam.page)).toBeHidden();
  });
});
