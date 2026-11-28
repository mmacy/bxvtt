/**
 * The table's rules: a referee changes them in the lobby and in the play screen's table settings, and a player
 * reads them without changing them. A player rolls ability scores under the table's reroll limit until it runs
 * out, discards a sub-par roll, and builds a character under the creation house rules. The referee's roster marks
 * a character rolled at another table or under other rules, and a player's roster doesn't.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { createCharacter, openTable, setupTable } from './support/table';
import {
  ROLL_SEEDS,
  chooseAlignment,
  chooseClass,
  createFromReview,
  next,
  openWizard,
} from './support/wizard';

/** A seed whose 3d6 roll bxapi calls sub-par (STR 4, INT 5), but that still qualifies for a fighter. */
const SUB_PAR_SEED = 6;

/** A seed whose 4d6 drop lowest roll qualifies for every class, with Constitution 14. */
const HOUSE_RULES_SEED = 5;

/** The lobby's Table rules panel, which names the starting rules in a badge. */
function rulesPanel(page: Page) {
  return page.getByRole('heading', { name: 'Table rules' }).locator('xpath=ancestor::section[1]');
}

/** The scores the wizard shows for the six abilities, read from each score's accessible name. */
async function shownScores(page: Page): Promise<Record<string, number>> {
  const names = {
    str: 'Strength',
    int: 'Intelligence',
    wis: 'Wisdom',
    dex: 'Dexterity',
    con: 'Constitution',
    cha: 'Charisma',
  };
  const scores: Record<string, number> = {};
  for (const [key, name] of Object.entries(names)) {
    const group = page.getByRole('group', { name: new RegExp(`^${name} \\d+`) });
    const label = (await group.getAttribute('aria-label')) ?? '';
    scores[key] = Number(new RegExp(`^${name} (\\d+)`).exec(label)?.[1]);
  }
  return scores;
}

test.describe('table rules', () => {
  test('the referee changes the rules in the lobby, and a player reads them without changing them', async ({
    crew,
  }) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const table = await ruth.client.createTable({ name: 'House rules' });
    await sam.client.joinTable(table.invite_code);
    await openTable(ruth.page, `/tables/${table.id}`);
    await openTable(sam.page, `/tables/${table.id}`);

    // A new table plays standard B/X, which the panel's badge names. Both see the summary, not the form.
    await expect(rulesPanel(ruth.page).getByText('Standard B/X', { exact: true })).toBeVisible();
    await expect(rulesPanel(sam.page).getByText('Standard B/X', { exact: true })).toBeVisible();
    await expect(sam.page.getByText('Roll 3d6', { exact: true })).toBeVisible();
    await expect(ruth.page.getByRole('combobox', { name: 'Starting rules' })).toHaveCount(0);

    await ruth.page.getByRole('button', { name: 'Change rules' }).click();
    const starting = ruth.page.getByRole('combobox', { name: 'Starting rules' });
    await expect(starting).toBeFocused();
    await expect(starting).toHaveText('Standard B/X');
    await starting.click();
    await ruth.page.getByRole('option', { name: 'Creation house rules' }).click();
    await expect(ruth.page.getByRole('switch', { name: '4d6 drop lowest' })).toBeChecked();
    await expect(ruth.page.getByRole('switch', { name: 'Maximum hit points' })).toBeChecked();
    await expect(starting).toHaveText('Creation house rules');
    await expect(rulesPanel(sam.page).getByText('Creation house rules', { exact: true })).toBeVisible();
    await expect(sam.page.getByText('Roll 4d6, drop the lowest', { exact: true })).toBeVisible();
    await expect(sam.page.getByText('Maximum', { exact: true })).toBeVisible();

    // A rule for play the starting rules don't set makes the table's rules custom.
    await ruth.page.getByRole('switch', { name: 'Individual initiative' }).click();
    await expect(ruth.page.getByRole('switch', { name: 'Individual initiative' })).toBeChecked();
    await expect(starting).toHaveText('Custom');

    // The player reads the same rules, with no control that looks barred, and can tap a rule for its meaning.
    const samRules = rulesPanel(sam.page);
    await expect(samRules.getByText('Custom', { exact: true })).toBeVisible();
    await expect(samRules.getByRole('switch')).toHaveCount(0);
    await expect(samRules.getByRole('combobox')).toHaveCount(0);
    await samRules.getByRole('button', { name: 'Individual initiative' }).click();
    await expect(sam.page.getByRole('dialog', { name: 'Individual initiative' })).toContainText(
      'Every combatant rolls their own initiative',
    );
    await sam.page.keyboard.press('Escape');
    expect((await sam.client.getTable(table.id)).settings.ruleset.ability_score_method).toBe(
      '4d6_drop_lowest',
    );

    // Leaving custom rules discards the referee's changes, so it asks first.
    await starting.click();
    await ruth.page.getByRole('option', { name: 'Standard B/X' }).click();
    const confirm = ruth.page.getByRole('alertdialog', { name: 'Use standard B/X rules?' });
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Use standard B/X' }).click();
    await expect(starting).toHaveText('Standard B/X');
    await expect(samRules.getByText('Standard B/X', { exact: true })).toBeVisible();
    await expect(sam.page.getByText('Roll 3d6', { exact: true })).toBeVisible();
    await expect(samRules.getByRole('button', { name: 'Individual initiative' })).toHaveCount(0);

    // Done returns the referee to the summary and puts focus back on the button that opened the form.
    await ruth.page.getByRole('button', { name: 'Done' }).click();
    await expect(ruth.page.getByRole('button', { name: 'Change rules' })).toBeFocused();
    await expect(starting).toHaveCount(0);
  });

  test('the referee changes a rule for play in the table settings, and the player sees it in theirs', async ({
    crew,
  }) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const setup = await setupTable({
      name: 'Rules in play',
      referee: ruth,
      players: [sam],
      party: [{ owner: sam, name: 'Flarg', classId: 'fighter' }],
    });
    await openTable(ruth.page, setup.path);
    await openTable(sam.page, setup.path);

    const openRules = async (page: Page) => {
      await page.getByRole('button', { name: 'Table menu' }).click();
      await page.getByRole('menuitem', { name: 'Table settings' }).click();
      const dialog = page.getByRole('dialog', { name: 'Table settings' });
      await dialog.getByRole('tab', { name: 'Rules' }).click();
      return dialog;
    };
    const ruthRules = await openRules(ruth.page);
    // During a game, a change waits for the next one.
    await expect(ruthRules.getByText('Changes apply to the next new game.')).toBeVisible();
    await ruthRules.getByRole('switch', { name: 'Weapon reload' }).click();
    await expect(ruthRules.getByRole('switch', { name: 'Weapon reload' })).toBeChecked();

    // A player's menu has the table's rules to read, and no settings or invite link.
    await sam.page.getByRole('button', { name: 'Table menu' }).click();
    await expect(sam.page.getByRole('menuitem', { name: 'Table settings' })).toHaveCount(0);
    await expect(sam.page.getByRole('menuitem', { name: 'Copy invite link' })).toHaveCount(0);
    await sam.page.getByRole('menuitem', { name: 'Table rules' }).click();
    const samRules = sam.page.getByRole('dialog', { name: 'Table rules' });
    await expect(samRules.getByText('Changes apply to the next new game.')).toHaveCount(0);
    await expect(samRules.getByRole('switch')).toHaveCount(0);
    const reload = samRules.getByRole('button', { name: 'Weapon reload' });
    await expect(reload).toBeVisible();

    // The referee turns it off again, and the player's open dialog follows.
    await ruthRules.getByRole('switch', { name: 'Weapon reload' }).click();
    await expect(reload).toHaveCount(0);
  });

  test('a player rerolls until the table’s limit runs out, and a higher limit lets them roll again', async ({
    crew,
  }) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const table = await ruth.client.createTable({ name: 'Reroll limit' });
    await sam.client.joinTable(table.invite_code);
    await ruth.client.updateTable(table.id, { settings: { ability_score_rerolls: 1 } });
    await sam.seedAbilityRolls([ROLL_SEEDS.cleric, ROLL_SEEDS.fighter, ROLL_SEEDS.thief]);
    await openTable(sam.page, `/tables/${table.id}`);
    const dialog = await openWizard(sam.page);

    await dialog.getByRole('button', { name: 'Roll ability scores' }).click();
    await expect(dialog.getByRole('region', { name: 'Classes this roll qualifies for' })).toBeVisible();
    const again = dialog.getByRole('button', { name: 'Roll again' });
    await expect(again).toBeEnabled();
    await expect(dialog.getByText('1 left', { exact: true })).toBeVisible();
    const first = await shownScores(sam.page);

    await again.click();
    await expect.poll(() => shownScores(sam.page)).not.toEqual(first);
    // The last reroll is spent, so the button stays and says why it's unavailable.
    await expect(again).toBeDisabled();
    await expect(dialog.getByText('1 left', { exact: true })).toHaveCount(0);
    await again.hover();
    await expect(sam.page.getByRole('tooltip')).toContainText(
      "You've used all the rerolls your table allows.",
    );
    expect((await sam.client.getTable(table.id)).settings.ability_score_rerolls).toBe(1);

    // The referee allows one more reroll, and the open wizard offers it at once.
    await ruth.client.updateTable(table.id, { settings: { ability_score_rerolls: 2 } });
    await expect(again).toBeEnabled();
    await expect(dialog.getByText('1 left', { exact: true })).toBeVisible();
    const second = await shownScores(sam.page);
    await again.click();
    await expect.poll(() => shownScores(sam.page)).not.toEqual(second);
    await expect(again).toBeDisabled();
  });

  test('a sub-par roll offers Start again, and starting again spends no reroll', async ({ crew }) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const table = await ruth.client.createTable({ name: 'Sub-par' });
    await sam.client.joinTable(table.invite_code);
    await ruth.client.updateTable(table.id, { settings: { sub_par_restart: true } });
    await sam.seedAbilityRolls([SUB_PAR_SEED, ROLL_SEEDS.fighter]);
    await openTable(sam.page, `/tables/${table.id}`);
    const dialog = await openWizard(sam.page);

    await dialog.getByRole('button', { name: 'Roll ability scores' }).click();
    await expect(dialog.getByRole('group', { name: /^Strength 4\b/ })).toBeVisible();
    const startAgain = dialog.getByRole('button', { name: 'Start again' });
    await expect(startAgain).toBeVisible();
    await expect(dialog.getByText('Sub-par', { exact: true })).toBeVisible();
    // The table allows no rerolls, so a sub-par roll is the only way to new scores.
    await expect(dialog.getByRole('button', { name: 'Roll again' })).toHaveCount(0);

    await startAgain.click();
    await expect(dialog.getByRole('group', { name: /^Strength 15\b/ })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Start again' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Roll again' })).toHaveCount(0);
    await expect(dialog.getByText('Sub-par', { exact: true })).toHaveCount(0);
    await next(dialog);
    await chooseClass(dialog, 'fighter');
  });

  test('a character built under the creation house rules rolls 4d6 and takes the maximum hit points', async ({
    crew,
  }) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const table = await ruth.client.createTable({ name: 'Four dice' });
    await sam.client.joinTable(table.invite_code);
    await ruth.client.updateTable(table.id, {
      settings: { ruleset: { ability_score_method: '4d6_drop_lowest', max_hp_at_first_level: true } },
    });
    await sam.seedAbilityRolls([HOUSE_RULES_SEED]);
    await openTable(sam.page, `/tables/${table.id}`);
    const dialog = await openWizard(sam.page);

    await dialog.getByRole('button', { name: 'Roll ability scores' }).click();
    await expect(dialog.getByRole('region', { name: 'Classes this roll qualifies for' })).toBeVisible();
    // The scores on screen are the ones bxapi rolled with four dice, dropping the lowest.
    const roll = await sam.client.getCurrentAbilityRoll(table.id);
    if (roll === null) throw new Error('Sam has no open roll after rolling.');
    expect(roll.ability_score_method).toBe('4d6_drop_lowest');
    expect(Object.keys(roll.rolls.dropped)).toHaveLength(6);
    expect(await shownScores(sam.page)).toEqual(roll.scores);

    await next(dialog);
    await chooseClass(dialog, 'fighter');
    await dialog.getByRole('button', { name: 'Skip this step' }).click();
    await chooseAlignment(dialog);
    await next(dialog);

    // Under the house rule, the hit die isn't rolled.
    await expect(dialog.getByRole('heading', { name: 'Hit points and gold', level: 3 })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Roll hit points' })).toHaveCount(0);
    await expect(dialog).toContainText('Taking the maximum fixes your class as a fighter');
    await dialog.getByRole('button', { name: 'Take the maximum' }).click();
    await expect(dialog.getByRole('group', { name: 'Maximum hit die' })).toBeVisible();
    const hp = dialog.getByText(/You start with (\d+) hit points?\./);
    const hitPoints = Number(/(\d+) hit point/.exec((await hp.textContent()) ?? '')?.[1]);
    await dialog.getByRole('button', { name: 'Roll starting gold' }).click();
    await expect(dialog.getByText(/You start with \d+ gold pieces? to spend on equipment\./)).toBeVisible();
    await next(dialog);
    await dialog.getByRole('button', { name: 'Add Sword to the cart' }).click();
    await next(dialog);
    // The review step says the table gave the maximum, and names no rolled face.
    const combat = dialog.getByRole('region', { name: 'Combat' });
    await expect(combat).toContainText('Your table gives the maximum on 1d8');
    await expect(combat).not.toContainText(/You rolled \d+ on 1d/);
    await createFromReview(sam.page, dialog, 'Flarg');

    const stored = (await sam.client.listCharacters()).items.find((item) => item.name === 'Flarg');
    expect(stored?.max_hp).toBe(hitPoints);
    // The roster records the house rules the character was built under.
    await expect
      .poll(async () => (await sam.client.getTable(table.id)).roster[0]?.creation_rules)
      .toMatchObject({ ability_score_method: '4d6_drop_lowest', max_hp_at_first_level: true });
  });

  test('the referee’s roster marks a character rolled at another table, and the player’s roster doesn’t', async ({
    crew,
  }) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const table = await ruth.client.createTable({ name: 'Marks' });
    await sam.client.joinTable(table.invite_code);
    const elsewhere = await sam.client.createTable({ name: 'Sam alone' });
    const flarg = await createCharacter(sam.client, { name: 'Flarg', classId: 'fighter' }, elsewhere.id);
    const tinks = await createCharacter(sam.client, { name: 'Tinks', classId: 'thief' }, table.id);
    await sam.client.addToRoster(table.id, flarg.id);
    await sam.client.addToRoster(table.id, tinks.id);
    await openTable(ruth.page, `/tables/${table.id}`);
    await openTable(sam.page, `/tables/${table.id}`);

    const card = (page: Page, name: string) =>
      page
        .getByRole('list', { name: 'Party in marching order' })
        .getByRole('listitem')
        .filter({ hasText: name });
    await expect(card(ruth.page, 'Tinks')).toBeVisible();
    // Flarg was rolled at Sam's other table, under the same rules. Tinks was rolled here, so it has no mark.
    await card(ruth.page, 'Flarg').getByRole('button', { name: 'Other table: show why' }).click();
    const why = ruth.page.getByRole('dialog', { name: 'Other table' });
    await expect(why).toContainText(
      "Flarg's ability scores were rolled at another table, under the same creation rules as this one.",
    );
    await ruth.page.keyboard.press('Escape');
    await expect(why).toHaveCount(0);
    await expect(card(ruth.page, 'Tinks').getByRole('button', { name: /show why/ })).toHaveCount(0);

    // Once the table's rules change, both characters were built under other rules.
    await ruth.client.updateTable(table.id, { settings: { ruleset: { max_hp_at_first_level: true } } });
    await card(ruth.page, 'Tinks').getByRole('button', { name: 'Different rules: show why' }).click();
    const different = ruth.page.getByRole('dialog', { name: 'Different rules' });
    await expect(different).toContainText('Tinks was created with:');
    await expect(different).toContainText('Maximum hit points: Off');
    await ruth.page.keyboard.press('Escape');
    await card(ruth.page, 'Flarg').getByRole('button', { name: 'Other table: show why' }).click();
    await expect(ruth.page.getByRole('dialog', { name: 'Other table' })).toContainText(
      'Maximum hit points: Off',
    );

    // The player sees the same party without the referee's marks.
    await expect(card(sam.page, 'Flarg')).toBeVisible();
    await expect(card(sam.page, 'Tinks')).toBeVisible();
    await expect(sam.page.getByRole('button', { name: /show why/ })).toHaveCount(0);
    await expect(sam.page.getByText(/^(Other table|Different rules|Rules unknown)$/)).toHaveCount(0);
  });
});
