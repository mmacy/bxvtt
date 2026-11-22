/**
 * Town: outfitting the party, a purchase that reaches the other players, the temple, selling treasure, resting,
 * and setting out. Ruth referees, Sam plays Brenna and Wren and is the caller, and Alice plays Osric.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { openTable } from './support/table';
import { AFTER_DELVE, purseOf, returnToTown, townTable } from './support/town';

/** Matches a coins list that holds this many gold pieces. The coin icon adds a letter to the text. */
function gold(gp: number): RegExp {
  return new RegExp(`(^|\\D)${gp}\\s*gp \\(gold\\)`);
}

/** The town's tab list. */
async function openTownTab(page: Page, name: string): Promise<void> {
  await page.getByRole('tablist', { name: 'Parts of town' }).getByRole('tab', { name }).click();
  await expect(page.getByRole('tabpanel', { name })).toBeVisible();
}

/** The coins line for a member on the town square's party list. */
function squareMember(page: Page, name: string) {
  return page
    .getByRole('tabpanel', { name: 'Town square' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name, level: 3 }) });
}

test.describe('town', () => {
  test('players outfit their own members, and a purchase reaches the rest of the table', async ({ crew }) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const alice = await crew.person('Alice');
    const table = await townTable(ruth, sam, alice);
    for (const actor of [ruth, sam, alice]) await openTable(actor.page, table.path);

    // Before anyone shops, nobody has a tinder box.
    await expect(alice.page.getByText(/A tinder box to light it\s*:\s*nobody has it yet/)).toBeVisible();

    await openTownTab(sam.page, 'Outfitter');
    const shoppingFor = sam.page.getByRole('group', { name: 'Shopping for' });
    // Sam shops only for the members in his seats.
    await expect(shoppingFor.getByRole('button')).toHaveText([/^Brenna/, /^Wren/]);
    await shoppingFor.getByRole('button', { name: /^Wren/ }).click();
    await sam.page.getByRole('button', { name: 'Add Tinder box (flint & steel) to the cart' }).click();
    await sam.page.getByRole('button', { name: 'Add Rope (50’) to the cart' }).click();
    await sam.page.getByRole('button', { name: 'Buy for Wren' }).click();

    // Wren paid 4 gp of her 74. Alice and Ruth see it without a reload.
    for (const page of [alice.page, ruth.page]) {
      await expect(squareMember(page, 'Wren').getByRole('list', { name: 'Coins' })).toHaveText(gold(70));
      await expect(page.getByText(/A tinder box to light it\s*:\s*the party has it/)).toBeVisible();
    }
    await expect(
      alice.page
        .getByRole('tabpanel', { name: 'Town square' })
        .getByText('Wren buys a 50-foot rope and a tinder box.'),
    ).toBeVisible();

    // Alice outfits Osric. She can't shop for Sam's members.
    await openTownTab(alice.page, 'Outfitter');
    await expect(alice.page.getByRole('group', { name: 'Shopping for' }).getByRole('button')).toHaveText([
      /^Osric/,
    ]);
    await alice.page.getByRole('button', { name: 'Add Rations (standard, 7 days) to the cart' }).click();
    await alice.page.getByRole('button', { name: 'Buy for Osric' }).click();
    await expect(squareMember(ruth.page, 'Osric').getByRole('list', { name: 'Coins' })).toHaveText(gold(15));
  });

  test('a purchase the member can’t afford is refused with the reason', async ({ crew }) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const alice = await crew.person('Alice');
    const table = await townTable(ruth, sam, alice);
    await openTable(sam.page, table.path);
    await openTownTab(sam.page, 'Outfitter');
    // Brenna has 19 gp, and plate mail costs 60 gp.
    await sam.page.getByRole('button', { name: 'Add Plate mail to the cart' }).click();
    await sam.page.getByRole('button', { name: 'Buy for Brenna' }).click();
    await expect(sam.page.getByText(/enough|afford/i).first()).toBeVisible();
    await expect.poll(async () => purseOf(await sam.client.getGame(table.table.id), 'Brenna')).toBe(19);
  });

  test('the temple heals a wounded member, and the party pays the fee', async ({ crew }) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const alice = await crew.person('Alice');
    const table = await townTable(ruth, sam, alice);
    await returnToTown(table);
    for (const actor of [sam, alice]) await openTable(actor.page, table.path);

    await openTownTab(sam.page, 'Temple');
    const patients = sam.page.getByRole('group', { name: 'Who is treated' });
    await expect(patients.getByRole('button', { name: /^Brenna 7 of 10 hp/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Raise dead for a living member costs more than the party carries, so the temple refuses.
    await sam.page.getByRole('button', { name: 'Buy raise dead for Brenna' }).click();
    const refusal = sam.page
      .getByRole('tabpanel', { name: 'Temple' })
      .getByText("The temple can't do that for Brenna");
    await expect(refusal).toBeVisible();
    await expect(refusal.locator('xpath=..')).toContainText("there isn't enough gold");

    // Cure light wounds costs 20 gp: Brenna's 19 gp and 1 gp from Wren.
    await sam.page.getByRole('button', { name: 'Buy cure light wounds for Brenna' }).click();
    const brenna = alice.page.getByRole('button', { name: /^Brenna, level 1 fighter, \d+ of 10 hit points/ });
    await expect(brenna).not.toHaveAccessibleName(/^Brenna, level 1 fighter, 7 of 10/);
    const game = await sam.client.getGame(table.table.id);
    expect(purseOf(game, 'Brenna')).toBe(0);
    expect(purseOf(game, 'Wren')).toBe(AFTER_DELVE.purses.Wren - 1);
  });

  test('selling treasure pays each member who carried it', async ({ crew }) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const alice = await crew.person('Alice');
    const table = await townTable(ruth, sam, alice);
    await returnToTown(table);
    for (const actor of [sam, alice]) await openTable(actor.page, table.path);

    await openTownTab(sam.page, 'Treasure buyers');
    const buyers = sam.page.getByRole('tabpanel', { name: 'Treasure buyers' });
    await expect(buyers.getByRole('checkbox', { name: 'Silver altar candlestick' })).toHaveCount(2);
    const sale = buyers.getByRole('complementary', { name: 'Sale' });
    await expect(sale.getByRole('button', { name: 'Sell selected' })).toBeDisabled();

    // Sell Brenna's candlestick alone first, then everything that's left.
    await buyers.getByRole('checkbox', { name: 'Silver altar candlestick' }).first().check();
    await sale.getByRole('button', { name: 'Sell selected' }).click();
    await expect(squareMember(alice.page, 'Brenna').getByRole('list', { name: 'Coins' })).toHaveText(
      gold(79),
    );
    await expect(buyers.getByRole('checkbox', { name: 'Silver altar candlestick' })).toHaveCount(1);
    await sale.getByRole('button', { name: 'Sell everything' }).click();
    await expect(squareMember(alice.page, 'Wren').getByRole('list', { name: 'Coins' })).toHaveText(gold(134));
    await expect(buyers.getByRole('checkbox')).toHaveCount(0);
  });

  test('the party rests, the clock moves for everyone, and the caller sets out', async ({ crew }) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const alice = await crew.person('Alice');
    const table = await townTable(ruth, sam, alice);
    await returnToTown(table);
    for (const actor of [ruth, sam, alice]) await openTable(actor.page, table.path);
    const clock = (page: Page) => page.getByRole('banner').getByText(/^Day \d+, \d\d:\d\d$/);
    const before = await clock(alice.page).textContent();

    await openTownTab(sam.page, 'Rest and prepare');
    await sam.page.getByRole('button', { name: 'Rest a full day' }).click();
    await expect(clock(alice.page)).not.toHaveText(before ?? '');
    // A full day of rest heals Brenna's wounds a little.
    await expect(
      alice.page.getByRole('button', { name: /^Brenna, level 1 fighter, (8|9|10) of 10 hit points/ }),
    ).toBeVisible();

    // Only the caller sets out.
    const aliceSetOut = alice.page
      .getByRole('toolbar', { name: 'Party actions' })
      .getByRole('button', { name: /^Set out/ });
    await expect(aliceSetOut).toBeDisabled();
    await sam.page
      .getByRole('toolbar', { name: 'Party actions' })
      .getByRole('button', { name: /^Set out/ })
      .click();
    const destination = sam.page.getByRole('dialog').or(sam.page.getByRole('menu'));
    if (await destination.count()) {
      await destination
        .getByRole('button', { name: /Set out|priory/i })
        .or(destination.getByRole('menuitem', { name: /priory/i }))
        .first()
        .click();
    }
    for (const page of [ruth.page, sam.page, alice.page]) {
      await expect(page.getByRole('banner').getByText('Exploring')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole('application', { name: /^Dungeon map/ })).toBeVisible();
    }
  });
});
