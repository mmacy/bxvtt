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
});
