/**
 * Town: outfitting the party, a purchase that reaches the other players, the temple, selling treasure, resting,
 * and setting out. Ruth referees, Sam plays Flarg and Tinks and is the caller, and Alice plays Clarence.
 */
import type { Page } from '@playwright/test';
import { expect, readFeedLines, test } from './support/fixtures';
import { stagedTable } from './support/states';
import { openTable } from './support/table';
import { AFTER_DELVE, purseOf, returnToTown, townTable } from './support/town';

/** Matches a coins list that holds this many gold pieces. The coin icon adds a letter to the text. */
function gold(gp: number): RegExp {
  return new RegExp(`(^|\\D)${gp}\\s*gp \\(gold\\)`);
}

/** The town's tab list. */
async function openTownTab(page: Page, name: string): Promise<void> {
  await page.getByRole('tablist', { name: 'Town locations' }).getByRole('tab', { name }).click();
  await expect(page.getByRole('tabpanel', { name })).toBeVisible();
}

/** The coins line for a member on the town square's party list. */
function squareMember(page: Page, name: string) {
  return page
    .getByRole('tabpanel', { name: 'Town square' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name, level: 3 }) });
}

/** A member's name button in the Party panel's marching order. Its description gives the hit points. */
function marchingRow(page: Page, name: string) {
  return page
    .getByRole('tabpanel', { name: 'Party' })
    .getByRole('list', { name: 'Marching order' })
    .getByRole('button', { name, exact: true });
}

test.describe('town', () => {
  test('players outfit their own members, and a purchase reaches the rest of the table', async ({ crew }) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const alice = await crew.person('Alice');
    const table = await townTable(ruth, sam, alice);
    for (const actor of [ruth, sam, alice]) await openTable(actor.page, table.path);

    // Before anyone shops, nobody has a tinder box.
    await expect(alice.page.getByText(/Tinder box\s*:\s*missing/)).toBeVisible();

    await openTownTab(sam.page, 'Outfitter');
    const shoppingFor = sam.page.getByRole('group', { name: 'Shopping for' });
    // Sam shops only for the members in his seats.
    await expect(shoppingFor.getByRole('button')).toHaveText([/^Flarg/, /^Tinks/]);
    await shoppingFor.getByRole('button', { name: /^Tinks/ }).click();
    await sam.page.getByRole('button', { name: 'Add Tinder box (flint & steel) to the cart' }).click();
    await sam.page.getByRole('button', { name: 'Add Rope (50’) to the cart' }).click();
    await sam.page.getByRole('button', { name: 'Buy for Tinks' }).click();

    // Tinks paid 4 gp of her 74. Alice and Ruth see it without a reload.
    for (const page of [alice.page, ruth.page]) {
      await expect(squareMember(page, 'Tinks').getByRole('list', { name: 'Coins' })).toHaveText(gold(70));
      await expect(page.getByText(/Tinder box\s*:\s*carried/)).toBeVisible();
    }
    await expect(
      alice.page
        .getByRole('tabpanel', { name: 'Town square' })
        .getByText('Tinks buys a 50’ coil of rope and a tinder box.'),
    ).toBeVisible();

    // Alice outfits Clarence. She can't shop for Sam's members.
    await openTownTab(alice.page, 'Outfitter');
    await expect(alice.page.getByRole('group', { name: 'Shopping for' }).getByRole('button')).toHaveText([
      /^Clarence/,
    ]);
    await alice.page.getByRole('button', { name: 'Add Rations (standard, 7 days) to the cart' }).click();
    await alice.page.getByRole('button', { name: 'Buy for Clarence' }).click();
    await expect(squareMember(ruth.page, 'Clarence').getByRole('list', { name: 'Coins' })).toHaveText(
      gold(15),
    );
  });

  test('a purchase the member can’t afford is refused with the reason', async ({ crew }) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const alice = await crew.person('Alice');
    const table = await townTable(ruth, sam, alice);
    await openTable(sam.page, table.path);
    await openTownTab(sam.page, 'Outfitter');
    // Flarg has 19 gp, and plate mail costs 60 gp.
    await sam.page.getByRole('button', { name: 'Add Plate mail to the cart' }).click();
    await sam.page.getByRole('button', { name: 'Buy for Flarg' }).click();
    await expect(sam.page.getByText(/enough|afford/i).first()).toBeVisible();
    await expect.poll(async () => purseOf(await sam.client.getGame(table.table.id), 'Flarg')).toBe(19);
  });

  test('the temple heals a wounded member, and the party pays the fee', async ({ crew }) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const alice = await crew.person('Alice');
    const table = await townTable(ruth, sam, alice);
    await returnToTown(table);
    for (const actor of [sam, alice]) await openTable(actor.page, table.path);

    await openTownTab(sam.page, 'Temple');
    const patients = sam.page.getByRole('group', { name: 'Patient' });
    await expect(patients.getByRole('button', { name: /^Flarg, 7 of 10 hp/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Raise dead for a living member costs more than the party carries, so the temple refuses.
    await sam.page.getByRole('button', { name: 'Buy raise dead for Flarg' }).click();
    const refusal = sam.page.getByRole('tabpanel', { name: 'Temple' }).getByText("Couldn't treat Flarg");
    await expect(refusal).toBeVisible();
    await expect(refusal.locator('xpath=..')).toContainText("you don't have enough gold");

    // Cure light wounds costs 20 gp: Flarg's 19 gp and 1 gp from Tinks.
    await sam.page.getByRole('button', { name: 'Buy cure light wounds for Flarg' }).click();
    await expect(marchingRow(alice.page, 'Flarg')).toHaveAccessibleDescription(/, (8|9|10) of 10 hit points/);
    const game = await sam.client.getGame(table.table.id);
    expect(purseOf(game, 'Flarg')).toBe(0);
    expect(purseOf(game, 'Tinks')).toBe(AFTER_DELVE.purses.Tinks - 1);
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

    // Sell Flarg's candlestick alone first, then everything that's left.
    await buyers.getByRole('checkbox', { name: 'Silver altar candlestick' }).first().check();
    await sale.getByRole('button', { name: 'Sell selected' }).click();
    await expect(squareMember(alice.page, 'Flarg').getByRole('list', { name: 'Coins' })).toHaveText(gold(79));
    await expect(buyers.getByRole('checkbox', { name: 'Silver altar candlestick' })).toHaveCount(1);
    await sale.getByRole('button', { name: 'Sell everything' }).click();
    await expect(squareMember(alice.page, 'Tinks').getByRole('list', { name: 'Coins' })).toHaveText(
      gold(134),
    );
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
    await sam.page.getByRole('button', { name: 'Rest for a full day' }).click();
    await expect(clock(alice.page)).not.toHaveText(before ?? '');
    // A full day of rest heals Flarg's wounds a little.
    await expect(marchingRow(alice.page, 'Flarg')).toHaveAccessibleDescription(/, (8|9|10) of 10 hit points/);
    // "Recently in town" leads with the rest itself (R-506).
    await expect(
      alice.page
        .getByRole('tabpanel', { name: 'Town square' })
        .getByRole('listitem')
        .filter({ hasText: 'The party rests for a full day.' })
        .first(),
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
    // The day's rest reads in a few lines: one for the rations, none for members who regain nothing (R-505).
    await alice.page.getByRole('tab', { name: /^Feed/ }).click();
    await expect(alice.page.getByRole('region', { name: 'Feed entries' })).toBeVisible();
    const lines = (await readFeedLines(alice.page)).join('\n');
    expect(lines).toContain("The party eats and drinks the day's rations.");
    expect(lines).not.toContain('regains no hit points');
    expect(lines).not.toContain("eats the day's food");
  });

  test('a caster’s button on the rest page opens the sheet at its Spells tab', async ({ crew }) => {
    // Mazpar is a magic-user with Sleep in her spell book. Clarence is a first-level cleric: bxapi lists spell
    // levels for him with no slots yet, so he counts as a caster. Flarg casts nothing.
    const staged = await stagedTable(crew, 'town');
    const { page } = staged.ruth;
    await openTable(page, staged.path);
    await openTownTab(page, 'Rest and prepare');
    const rest = page.getByRole('tabpanel', { name: 'Rest and prepare' });
    await expect(rest.getByRole('button', { name: "Open Flarg's sheet" })).toBeVisible();
    await expect(rest.getByText('Level 1 Magic-User, 1 in spell book, none memorized')).toBeVisible();
    await rest.getByRole('button', { name: "Open Clarence's spells" }).click();
    const clarence = page.getByRole('dialog', { name: 'Clarence' });
    await expect(clarence.getByRole('tab', { name: 'Spells' })).toHaveAttribute('aria-selected', 'true');
    await expect(clarence.getByRole('tabpanel', { name: 'Spells' })).toContainText('No spell slots yet');
    await clarence.getByRole('button', { name: 'Close' }).click();
    await expect(clarence).toHaveCount(0);
    await rest.getByRole('button', { name: "Open Mazpar's spells" }).click();
    const sheet = page.getByRole('dialog', { name: 'Mazpar' });
    await expect(sheet.getByRole('tab', { name: 'Spells' })).toHaveAttribute('aria-selected', 'true');
    await expect(sheet.getByRole('tabpanel', { name: 'Spells' })).toContainText('Sleep');
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toHaveCount(0);
  });
});
