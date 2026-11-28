/**
 * The play screen's shell: the table menu, keyboard shortcuts, the command palette, renaming yourself, leaving a
 * table, and the referee returning the table to its lobby.
 */
import { expect, test } from './support/fixtures';
import { expectSiteInfo } from './support/site-info';
import { stagedTable } from './support/states';
import { openTable, placeParty } from './support/table';

test.describe('play screen shell', () => {
  test('the shortcuts dialog and the command palette open from the keyboard', async ({ crew }) => {
    const staged = await stagedTable(crew, 'exploring');
    const { page } = staged.sam;
    await openTable(page, staged.path);
    await expect(page.getByRole('application', { name: /^Dungeon map/ })).toBeVisible();
    await expectSiteInfo(page);

    await page.keyboard.press('?');
    const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(help).toBeVisible();
    await expect(help.getByRole('term').filter({ hasText: 'Search' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();

    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.getByRole('dialog').filter({ has: page.getByRole('combobox') });
    await expect(palette).toBeVisible();
    await palette.getByRole('combobox').fill('search');
    await expect(palette.getByRole('option', { name: /Search/ }).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();

    // The table menu lists the same tools.
    await page.getByRole('button', { name: 'Table menu' }).click();
    const menu = page.getByRole('menu', { name: 'Table menu' });
    await expect(menu.getByRole('menuitem', { name: /^Keyboard shortcuts/ })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Return to lobby' })).toHaveCount(0);
    await menu.getByRole('menuitem', { name: /^Keyboard shortcuts/ }).click();
    await expect(help).toBeVisible();
  });

  test('a renamed player appears under the new name for the referee', async ({ crew }) => {
    const staged = await stagedTable(crew, 'lobby');
    const { ruth, sam } = staged;
    await openTable(ruth.page, staged.path);
    await sam.page.goto('/');
    // The name has no stray space before the comma (R-101).
    await sam.page.getByRole('button', { name: 'Sam, your profile', exact: true }).click();
    const field = sam.page.getByRole('textbox', { name: 'Name', exact: true });
    await field.fill('Samwise');
    await field.press('Enter');
    await expect(sam.page.getByRole('button', { name: 'Samwise, your profile', exact: true })).toBeVisible();
    const people = ruth.page.getByRole('heading', { name: 'People at the table' }).locator('xpath=../..');
    await expect(people).toContainText('Samwise');
  });

  test('a player leaves the table and the referee sees them go', async ({ crew }) => {
    const staged = await stagedTable(crew, 'town');
    const { ruth, sam } = staged;
    await openTable(ruth.page, staged.path);
    await openTable(sam.page, staged.path);
    await expect(ruth.page.getByRole('group', { name: '2 at the table' })).toBeVisible();

    await sam.page.getByRole('button', { name: 'Table menu' }).click();
    await sam.page.getByRole('menuitem', { name: 'Leave table' }).click();
    const confirm = sam.page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: /leave/i }).click();
    await expect(sam.page).toHaveURL(/\/$/);
    await expect(sam.page.getByRole('link', { name: /The bell tolls/ })).toHaveCount(0);
    await expect(ruth.page.getByRole('group', { name: '1 at the table' })).toBeVisible();
  });

  test('the referee returns the table to its lobby and everyone follows', async ({ crew }) => {
    const staged = await stagedTable(crew, 'exploring');
    const { ruth, sam } = staged;
    await openTable(ruth.page, staged.path);
    await openTable(sam.page, staged.path);
    await ruth.page.getByRole('button', { name: 'Table menu' }).click();
    await ruth.page.getByRole('menuitem', { name: 'Return to lobby' }).click();
    const confirm = ruth.page.getByRole('alertdialog', { name: 'Return to lobby?' });
    await confirm.getByRole('button', { name: /lobby/i }).click();
    for (const page of [ruth.page, sam.page]) {
      await expect(page.getByRole('heading', { name: 'Party', level: 2 })).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('application', { name: /^Dungeon map/ })).toHaveCount(0);
    }
    // The party is back on the roster, ready for another game.
    await expect(
      sam.page.getByRole('list', { name: 'Party in marching order' }).getByRole('listitem'),
    ).toHaveCount(4);
  });

  // D-020
  test('an action clicked while a move is on its way is sent or explained, never dropped silently', async ({
    crew,
  }) => {
    const staged = await stagedTable(crew, 'exploring');
    const { page } = staged.sam;
    // A wide corridor, so the move east always succeeds.
    await placeParty(staged.ruth.client, staged.tableId, {
      dungeon: 'priory',
      level: 1,
      x: 9,
      y: 15,
      facing: 'east',
    });
    await openTable(page, staged.path);
    const map = page.getByRole('application', { name: /^Dungeon map/ });
    await expect(map).toBeVisible();

    // Hold the move in flight for two seconds, as a slow connection would.
    const sent: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/game/commands')) {
        sent.push(
          String((request.postDataJSON() as { command?: { command_type?: string } }).command?.command_type),
        );
      }
    });
    await page.route('**/game/commands', async (route) => {
      const body = route.request().postDataJSON() as { command?: { command_type?: string } };
      if (body.command?.command_type === 'move_party')
        await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });
    await map.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => sent).toContain('move_party');
    await page.getByRole('toolbar', { name: 'Party actions' }).getByRole('button', { name: 'Rest' }).click();
    const restEntry = page.getByRole('menuitem').first();
    if (await restEntry.isVisible().catch(() => false)) await restEntry.click();

    // The player should either see the rest go out once the move lands, or be told it didn't.
    const told = page
      .getByRole('region', { name: 'Notifications' })
      .getByText(/on its way|wait|catching up/i);
    await expect
      .poll(async () => sent.includes('rest') || (await told.count()) > 0, { timeout: 6000 })
      .toBe(true);
  });

  // #65: the party's light and food left, from the player view's supplies.
  test('the top bar shows light and food left, and a phone shows them in the party panel', async ({
    crew,
  }) => {
    const staged = await stagedTable(crew, 'exploring');
    const { page, client } = staged.sam;
    const supplies = (await client.getGame(staged.table.id)).view.supplies;
    expect(supplies?.rations).toBe(0);
    await openTable(page, staged.path);
    const bar = page.getByRole('banner');
    await expect(bar.getByText(/^Light left: /)).toBeVisible();
    await expect(bar.getByText('Food left: No food')).toBeVisible();
    await bar.getByText('Food left: No food').hover();
    await expect(page.getByRole('tooltip')).toContainText('No one in the party carries rations');

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(bar.getByText(/^Food left: /)).toBeHidden();
    await page
      .getByRole('button', { name: /table panels/i })
      .first()
      .click();
    await page.getByRole('tab', { name: 'Party' }).click();
    await expect(page.getByText('Supplies', { exact: true })).toBeVisible();
    await expect(page.getByText('Food left: No food').last()).toBeVisible();
  });
});
