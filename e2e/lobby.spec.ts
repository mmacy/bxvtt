/**
 * First run and the lobby: picking a name, creating a table, inviting a player, presence, roles, the roster and
 * marching order, the adventure choice, the table settings, and starting the game.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT } from './support/env';
import { expect, test } from './support/fixtures';
import { stagedTable } from './support/states';
import { createCharacter, openTable, placeParty } from './support/table';

test.describe('first run and lobby', () => {
  test('a new visitor picks a name and creates a table', async ({ crew }) => {
    const ruth = await crew.person('Ruth', { signedIn: false });
    const { page } = ruth;
    await page.goto('/');
    const form = page.getByRole('form', { name: 'Pick your name' });
    await expect(form).toBeVisible();

    // An empty name can't continue.
    await form.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('textbox', { name: 'Your name' })).toHaveAttribute('aria-invalid', 'true');

    await page.getByRole('textbox', { name: 'Your name' }).fill('Ruth');
    await form.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Your tables', level: 1 })).toBeVisible();
    // The name has no stray space before the comma (R-101).
    await expect(page.getByRole('button', { name: 'Ruth, your profile', exact: true })).toBeVisible();

    await page.getByRole('textbox', { name: 'Table name' }).fill('Thursday at the bell');
    await page.getByRole('button', { name: 'Create table' }).click();
    await expect(page).toHaveURL(/\/tables\/tbl_/);
    await expect(page.getByRole('heading', { name: 'Thursday at the bell', level: 1 })).toBeVisible();
    await expect(page.getByText('1 of 1 online')).toBeVisible();

    // The name survives a reload, and the table is on the home page.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Thursday at the bell', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'Your tables' }).click();
    await expect(page.getByRole('link', { name: /Thursday at the bell/ })).toBeVisible();
  });

  test('the lobby fits a phone-width screen', async ({ crew }) => {
    // R-104: the header used to push the lobby wider than the screen.
    const ruth = await crew.person('Ruth', { viewport: { width: 390, height: 844 } });
    const table = await ruth.client.createTable({ name: 'Phone width' });
    await openTable(ruth.page, `/tables/${table.id}`);
    await expect(ruth.page.getByRole('heading', { name: 'Phone width', level: 1 })).toBeVisible();
    expect(await ruth.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('a player joins with the invite link and both see each other', async ({ crew }) => {
    const ruth = await crew.person('Ruth');
    const table = await ruth.client.createTable({ name: 'Invite test' });
    await ruth.page.goto(`/tables/${table.id}`);
    const invite = ruth.page.getByRole('textbox', { name: 'Invite link' });
    await expect(invite).toHaveValue(new RegExp(`/join/${table.invite_code}$`));
    const link = await invite.inputValue();

    const sam = await crew.person('Sam', { signedIn: false });
    await sam.page.goto(link);
    await expect(sam.page.getByRole('form', { name: "You're invited to a table" })).toBeVisible();
    await sam.page.getByRole('textbox', { name: 'Your name' }).fill('Sam');
    await sam.page.getByRole('button', { name: 'Join the table' }).click();
    await expect(sam.page).toHaveURL(new RegExp(`/tables/${table.id}$`));
    await expect(sam.page.getByRole('heading', { name: 'Invite test', level: 1 })).toBeVisible();

    // Presence reaches both without a reload.
    await expect(ruth.page.getByText('2 of 2 online')).toBeVisible();
    await expect(sam.page.getByText('2 of 2 online')).toBeVisible();
    const ruthsList = ruth.page.getByRole('heading', { name: 'People at the table' }).locator('xpath=../..');
    await expect(ruthsList.getByRole('listitem').filter({ hasText: 'Sam' })).toContainText('Player');

    // A player sees no invite controls and no member actions.
    await expect(sam.page.getByRole('button', { name: 'Make a new link' })).toHaveCount(0);
    await expect(sam.page.getByRole('button', { name: /Actions for/ })).toHaveCount(0);

    // When Sam closes the tab, Ruth sees him go away.
    await sam.page.close();
    await expect(ruth.page.getByText('1 of 2 online')).toBeVisible();
  });

  test('a stale invite link stops working after the referee makes a new one', async ({ crew }) => {
    const ruth = await crew.person('Ruth');
    const table = await ruth.client.createTable({ name: 'New link' });
    await ruth.page.goto(`/tables/${table.id}`);
    await ruth.page.getByRole('button', { name: 'Make a new link' }).click();
    const confirm = ruth.page.getByRole('alertdialog', { name: 'Make a new invite link?' });
    await confirm.getByRole('button', { name: 'Make a new link' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(ruth.page.getByRole('textbox', { name: 'Invite link' })).not.toHaveValue(
      new RegExp(table.invite_code),
    );

    const sam = await crew.person('Sam');
    crew.allowIssues(/404|Not Found/);
    await sam.page.goto(`/join/${table.invite_code}`);
    await expect(
      sam.page
        .getByRole('alert')
        .or(sam.page.getByText(/doesn't work|no longer|isn't valid/i))
        .first(),
    ).toBeVisible();
  });

  test('the referee promotes and demotes a member, and the player sees the change', async ({ crew }) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const table = await ruth.client.createTable({ name: 'Roles' });
    await sam.client.joinTable(table.invite_code);
    await ruth.page.goto(`/tables/${table.id}`);
    await sam.page.goto(`/tables/${table.id}`);
    await expect(sam.page.getByRole('button', { name: 'Start the game' })).toHaveCount(0);

    await ruth.page.getByRole('button', { name: 'Actions for Sam' }).click();
    await ruth.page.getByRole('menuitem', { name: 'Make a referee' }).click();
    // Sam now sees the referee's controls without a reload.
    await expect(sam.page.getByRole('button', { name: 'Make a new link' })).toBeVisible();
    await expect(sam.page.getByRole('button', { name: 'Actions for Ruth' })).toBeVisible();

    await ruth.page.getByRole('button', { name: 'Actions for Sam' }).click();
    await ruth.page.getByRole('menuitem', { name: 'Make a player' }).click();
    await expect(sam.page.getByRole('button', { name: 'Make a new link' })).toHaveCount(0);

    // The last referee can't step down.
    await ruth.page.getByRole('button', { name: 'Actions for Ruth' }).click();
    await expect(ruth.page.getByRole('menuitem', { name: 'Make a player' })).toBeDisabled();
    await ruth.page.keyboard.press('Escape');
  });

  test('players bring characters, the referee orders the party, and the order reaches everyone', async ({
    crew,
  }) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const table = await ruth.client.createTable({ name: 'Marching order' });
    await sam.client.joinTable(table.invite_code);
    await createCharacter(sam.client, { name: 'Brenna', classId: 'fighter' });
    await createCharacter(sam.client, { name: 'Wren', classId: 'thief' });
    await createCharacter(ruth.client, { name: 'Osric', classId: 'cleric' });

    await ruth.page.goto(`/tables/${table.id}`);
    await sam.page.goto(`/tables/${table.id}`);

    const mine = sam.page.getByRole('region', { name: 'Your characters' });
    await mine
      .getByRole('listitem')
      .filter({ hasText: 'Brenna' })
      .getByRole('button', { name: 'Add to party' })
      .click();
    await mine
      .getByRole('listitem')
      .filter({ hasText: 'Wren' })
      .getByRole('button', { name: 'Add to party' })
      .click();
    await ruth.page
      .getByRole('region', { name: 'Your characters' })
      .getByRole('listitem')
      .filter({ hasText: 'Osric' })
      .getByRole('button', { name: 'Add to party' })
      .click();

    const order = (page: typeof ruth.page) =>
      page.getByRole('list', { name: 'Party in marching order' }).getByRole('listitem');
    await expect(order(ruth.page)).toHaveCount(3);
    await expect(order(sam.page)).toHaveCount(3);
    await expect(order(ruth.page).nth(0)).toContainText('Brenna');
    await expect(sam.page.getByText('3 in marching order')).toBeVisible();

    // The referee moves Osric to the front. Sam sees the new order.
    await ruth.page.getByRole('button', { name: 'Move Osric forward' }).click();
    await ruth.page.getByRole('button', { name: 'Move Osric forward' }).click();
    await expect(order(ruth.page).nth(0)).toContainText('Osric');
    await expect(order(sam.page).nth(0)).toContainText('Osric');
    await expect(order(sam.page).nth(2)).toContainText('Wren');

    // A player can take their own character out, but can't reorder.
    await expect(sam.page.getByRole('button', { name: /Move .* forward/ })).toHaveCount(0);
    await sam.page.getByRole('button', { name: 'Take Wren out of the party' }).click();
    await expect(order(ruth.page)).toHaveCount(2);
    await expect(mine.getByRole('listitem').filter({ hasText: 'Wren' })).toBeVisible();
  });

  test('the referee chooses each adventure and changes the settings', async ({ crew }) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const table = await ruth.client.createTable({ name: 'Settings' });
    await sam.client.joinTable(table.invite_code);
    await ruth.page.goto(`/tables/${table.id}`);
    await sam.page.goto(`/tables/${table.id}`);

    const adventures = ruth.page.getByRole('radiogroup', { name: 'Adventure' });
    const start = ruth.page.getByRole('complementary').filter({ hasText: 'Start the game' });
    for (const name of [
      'The Barrow of the Forgotten King',
      'The Toll at Crookback Bridge',
      'The Drowned Bell',
    ]) {
      await adventures.getByRole('radio', { name: new RegExp(`^${name}`) }).check();
      await expect(adventures.getByRole('radio', { name: new RegExp(`^${name}`) })).toBeChecked();
      await expect(start.getByText(name, { exact: true })).toBeVisible();
    }
    // A player never sees the referee's choice before the game starts.
    await expect(sam.page.getByRole('radiogroup', { name: 'Adventure' })).toHaveCount(0);

    // Settings save and reach the player's copy of the table.
    await ruth.page.getByRole('radio', { name: 'Anyone with a character' }).click();
    await expect(ruth.page.getByRole('radio', { name: 'Anyone with a character' })).toBeChecked();
    await ruth.page.getByRole('switch', { name: 'Resolve battle rounds automatically' }).click();
    await expect(
      ruth.page.getByRole('switch', { name: 'Resolve battle rounds automatically' }),
    ).not.toBeChecked();
    await expect
      .poll(async () => (await sam.client.getTable(table.id)).settings)
      .toMatchObject({ party_control: 'anyone', auto_resolve: false });

    // The caller can be any member.
    await ruth.page.getByRole('combobox', { name: 'Caller' }).click();
    await ruth.page.getByRole('option', { name: 'Sam' }).click();
    await expect
      .poll(async () => (await ruth.client.getTable(table.id)).settings.caller_user_id)
      .toBe(sam.id);
    await ruth.page.reload();
    await expect(ruth.page.getByRole('combobox', { name: 'Caller' })).toContainText('Sam');
    await expect(ruth.page.getByRole('radio', { name: 'Anyone with a character' })).toBeChecked();
  });

  test('the referee starts the game and everyone moves to the play screen', async ({ crew }) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const table = await ruth.client.createTable({ name: 'Start' });
    await sam.client.joinTable(table.invite_code);
    const brenna = await createCharacter(sam.client, { name: 'Brenna', classId: 'fighter' });
    const osric = await createCharacter(ruth.client, { name: 'Osric', classId: 'cleric' });
    await sam.client.addToRoster(table.id, brenna.id);
    await ruth.client.addToRoster(table.id, osric.id);
    await ruth.seedGameStart(1981);

    await ruth.page.goto(`/tables/${table.id}`);
    await sam.page.goto(`/tables/${table.id}`);
    const start = ruth.page.getByRole('button', { name: 'Start the game' });
    await expect(start).toBeEnabled();
    await ruth.page
      .getByRole('radiogroup', { name: 'Adventure' })
      .getByRole('radio', { name: /^The Toll at Crookback Bridge/ })
      .check();
    await start.click();

    for (const page of [ruth.page, sam.page]) {
      await expect(page.getByRole('heading', { name: 'Wethercote', level: 2 })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByRole('banner').getByText('In town')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Start the game' })).toHaveCount(0);
    }
    // Sam owns the first seat, so he is the caller.
    await expect.poll(async () => (await sam.client.getGame(table.id)).caller_user_id).toBe(sam.id);
  });

  test('the referee uploads an adventure, and a broken document gets a reason', async ({
    crew,
  }, testInfo) => {
    const ruth = await crew.person('Ruth');
    const table = await ruth.client.createTable({ name: 'Uploads' });
    await ruth.page.goto(`/tables/${table.id}`);

    const broken = testInfo.outputPath('broken.json');
    writeFileSync(
      broken,
      JSON.stringify({ kind: 'adventure', schema_version: 4, payload: { name: 'Half a map' } }),
    );
    const document = JSON.parse(
      readFileSync(resolve(REPO_ROOT, 'adventures/the-toll-bridge.json'), 'utf8'),
    ) as {
      payload: { name: string };
    };
    document.payload.name = 'The Toll, our copy';
    const good = testInfo.outputPath('good.json');
    writeFileSync(good, JSON.stringify(document));

    const choose = async (path: string) => {
      const chooser = ruth.page.waitForEvent('filechooser');
      await ruth.page.getByRole('button', { name: 'Upload an adventure' }).click();
      await (await chooser).setFiles(path);
    };

    await choose(broken);
    await expect(ruth.page.getByText(/broken\.json:/)).toBeVisible();
    await expect(ruth.page.getByText(/broken\.json:/)).not.toContainText(/undefined|\[object Object\]/);

    await choose(good);
    await expect(ruth.page.getByText('The Toll, our copy is a valid adventure')).toBeVisible();
    await ruth.page.getByRole('button', { name: 'Upload', exact: true }).click();
    const radio = ruth.page
      .getByRole('radiogroup', { name: 'Adventure' })
      .getByRole('radio', { name: /^The Toll, our copy/ });
    await expect(radio).toBeVisible();
    await expect(radio).toContainText('Uploaded');
  });

  test('the referee continues from a save, and everyone lands in the saved game', async ({ crew }) => {
    const staged = await stagedTable(crew, 'exploring');
    const { ruth, sam, tableId } = staged;
    await openTable(ruth.page, staged.path);
    await openTable(sam.page, staged.path);

    // Play a little: the party walks into the priory's entrance hall.
    const saved = await placeParty(ruth.client, tableId, { dungeon: 'priory', level: 1, x: 17, y: 12 });
    await expect(ruth.page.getByRole('application', { name: /^Dungeon map/ })).toBeVisible();

    // Ruth saves the game from the table menu.
    await ruth.page.getByRole('button', { name: 'Table menu' }).click();
    await ruth.page.getByRole('menuitem', { name: 'Saves', exact: true }).click();
    const saves = ruth.page.getByRole('dialog', { name: 'Saves' });
    await saves.getByRole('textbox', { name: 'Save the game now' }).fill('In the chapel');
    await saves.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(saves.getByRole('list', { name: 'Saves, newest first' })).toContainText('In the chapel');
    await saves.getByRole('button', { name: 'Close' }).click();

    // The party moves on after the save, so the save and the latest state differ.
    await placeParty(ruth.client, tableId, { dungeon: 'priory', level: 1, x: 14, y: 23 });

    await ruth.page.getByRole('button', { name: 'Table menu' }).click();
    await ruth.page.getByRole('menuitem', { name: 'Return to the lobby' }).click();
    const returning = ruth.page.getByRole('alertdialog', { name: 'Return the table to its lobby?' });
    // The dialog says what returning does to the characters (R-530).
    await expect(returning).toContainText('Characters start each new game as they were created');
    await returning.getByRole('button', { name: /lobby/i }).click();
    for (const page of [ruth.page, sam.page]) {
      await expect(page.getByRole('heading', { name: 'Party', level: 2 })).toBeVisible({ timeout: 20_000 });
    }

    // Sam learns that a new game starts the characters afresh and that the referee can continue. Only Ruth gets
    // the button.
    await expect(
      sam.page.getByText(/from earlier games\. A new game starts every character as they were created/),
    ).toBeVisible();
    await expect(sam.page.getByText(/the referee can continue from a save/)).toBeVisible();
    await expect(sam.page.getByRole('button', { name: 'Continue from a save' })).toHaveCount(0);
    await ruth.page.getByRole('button', { name: 'Continue from a save' }).click();
    const lobbySaves = ruth.page.getByRole('dialog', { name: 'Continue from a save' });
    await expect(lobbySaves.getByRole('textbox', { name: 'Save the game now' })).toHaveCount(0);
    // In the lobby, no save is badged "Earlier game" (R-111), and the autosave note has no dead "Change" button
    // (R-103).
    await expect(lobbySaves.getByText('Earlier game', { exact: true })).toHaveCount(0);
    await expect(lobbySaves.getByRole('button', { name: 'Change', exact: true })).toHaveCount(0);
    await expect(lobbySaves).toContainText('Change it with “Save automatically” in the table settings.');
    await lobbySaves.getByRole('button', { name: 'Restore In the chapel' }).click();
    const confirm = ruth.page.getByRole('alertdialog', { name: 'Restore “In the chapel”?' });
    await expect(confirm).toContainText('The party plays on as it was saved');
    await confirm.getByRole('button', { name: 'Restore' }).click();

    // Both people leave the lobby for the saved moment: exploring the priory, where the party stood.
    for (const page of [ruth.page, sam.page]) {
      await expect(page.getByRole('banner').getByText('Exploring')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('application', { name: /^Dungeon map/ })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Start the game' })).toHaveCount(0);
    }
    const game = await sam.client.getGame(tableId);
    expect(game.mode).toBe('exploring');
    expect(game.view.location).toEqual(saved.view.location);
    expect(game.view.party.map((member) => member.name)).toEqual(['Brenna', 'Wren', 'Osric', 'Tamsin']);
    // Sam still plays his own characters.
    await expect(
      sam.page.getByRole('list', { name: 'Marching order' }).getByRole('button', { name: /^Brenna\b/ }),
    ).toContainText('You');
  });
});
