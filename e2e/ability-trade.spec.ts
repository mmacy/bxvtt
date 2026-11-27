/**
 * The ability trade step, driven by the limits bxapi states for the roll and the class: a full trade with
 * Continue, lowering before raising, the stop at the most points a trade buys, a roll with no trade, an elf that
 * hasn't chosen a spell yet, and an axe check of the step.
 */
import type { Locator } from '@playwright/test';
import { describeViolations, seriousViolations } from './support/a11y';
import { expect, test, type Actor } from './support/fixtures';
import { chooseClass, next, openWizard, rollFor, type WizardClass } from './support/wizard';

/** STR 16, INT 13, WIS 12: Strength has room for 2 points, which two steps off Intelligence buy. */
const CONTRACT_FIGHTER_SEED = 515;
/** STR 18: the fighter's prime requisite has no room, so no trade is possible. */
const CAPPED_FIGHTER_SEED = 191;
/** STR 15, INT 16, WIS 11: an elf can buy 1 point, for either prime requisite. */
const ELF_SEED = 1832;

/** Opens the wizard at a new table and goes to the trade step with a seeded roll. */
async function tradeStep(sam: Actor, seed: number, classId: WizardClass): Promise<Locator> {
  const table = await sam.client.createTable({ name: `Trade ${seed}` });
  await sam.seedAbilityRolls([seed]);
  await sam.page.goto(`/tables/${table.id}`);
  const dialog = await openWizard(sam.page);
  await rollFor(dialog, classId);
  await next(dialog);
  await chooseClass(dialog, classId);
  return dialog;
}

const control = (dialog: Locator, name: string) => dialog.getByRole('button', { name, exact: true });
const footerButton = (dialog: Locator, name: string) =>
  dialog.getByRole('contentinfo').getByRole('button', { name, exact: true });

test.describe('ability trade', () => {
  test('a fighter lowers first, stops at the points Strength can take, and continues with a full trade', async ({
    crew,
  }) => {
    const sam = await crew.person('Sam');
    const dialog = await tradeStep(sam, CONTRACT_FIGHTER_SEED, 'fighter');
    await expect(dialog.getByText('Lowering a score by 2 raises a prime requisite by 1.')).toBeVisible();

    // A raise spends a point that a lowering bought, so Strength waits for one.
    const raiseStrength = control(dialog, 'Raise Strength');
    await expect(raiseStrength).toHaveAttribute('aria-disabled', 'true');
    await expect(raiseStrength).toHaveAccessibleDescription('Lower a score first to gain a point.');

    // Two steps off Intelligence buy both points Strength can take, so Wisdom stops there.
    await control(dialog, 'Lower Intelligence').click();
    await expect(dialog.getByText('1 point to spend')).toBeVisible();
    await expect(footerButton(dialog, 'Continue')).toHaveAccessibleDescription(
      'Spend your points on a prime requisite, or reset your scores.',
    );
    await control(dialog, 'Lower Intelligence').click();
    await expect(dialog.getByText('2 points to spend')).toBeVisible();
    const lowerWisdom = control(dialog, 'Lower Wisdom');
    await expect(lowerWisdom).toHaveAttribute('aria-disabled', 'true');
    await expect(lowerWisdom).toHaveAccessibleDescription('Strength can rise only 2 points in a trade.');
    await expect(control(dialog, 'Lower Intelligence')).toHaveAccessibleDescription(
      "Intelligence can't go below 9 in a trade.",
    );

    await raiseStrength.click();
    await raiseStrength.click();
    await expect(dialog.getByText('Trade complete')).toBeVisible();
    await expect(raiseStrength).toHaveAccessibleDescription("Strength can't go above 18 in a trade.");
    await expect(dialog.getByRole('group', { name: /^Strength after the trade 18/ })).toBeVisible();
    await expect(dialog.getByRole('group', { name: /^Intelligence after the trade 9/ })).toBeVisible();
    await next(dialog);
    await expect(dialog.getByRole('heading', { name: 'Alignment and languages', level: 3 })).toBeVisible();
  });

  test('a fighter with Strength 18 reads why no trade is possible and continues', async ({ crew }) => {
    const sam = await crew.person('Sam');
    const dialog = await tradeStep(sam, CAPPED_FIGHTER_SEED, 'fighter');
    await expect(dialog.getByText('Strength is already as high as a trade can take it.')).toBeVisible();
    await expect(control(dialog, 'Raise Strength')).toHaveAccessibleDescription(
      "Strength can't go above 18 in a trade.",
    );
    await expect(footerButton(dialog, 'Skip this step')).toHaveCount(0);
    await footerButton(dialog, 'Continue').click();
    await expect(dialog.getByRole('heading', { name: 'Alignment and languages', level: 3 })).toBeVisible();
  });

  test('an elf trades before choosing a first spell, and the one point goes to either prime requisite', async ({
    crew,
  }) => {
    const sam = await crew.person('Sam');
    const dialog = await tradeStep(sam, ELF_SEED, 'elf');
    await expect(dialog.getByText('Lowering a score by 2 raises a prime requisite by 1.')).toBeVisible();
    await expect(dialog.getByText('Prime requisite', { exact: true })).toHaveCount(2);

    await control(dialog, 'Lower Wisdom').click();
    await expect(control(dialog, 'Lower Wisdom')).toHaveAccessibleDescription(
      "Wisdom can't go below 9 in a trade.",
    );
    await control(dialog, 'Raise Intelligence').click();
    await expect(dialog.getByText('Trade complete')).toBeVisible();
    // The one point is bought and spent, and no score can go lower, so Strength waits on the points limit.
    await expect(control(dialog, 'Raise Strength')).toHaveAccessibleDescription(
      'Lowering your other scores buys only 1 point.',
    );
    await expect(control(dialog, 'Raise Intelligence')).toHaveAccessibleDescription(
      'Lowering your other scores buys only 1 point.',
    );
    await next(dialog);
    await expect(dialog.getByRole('heading', { name: 'Alignment and languages', level: 3 })).toBeVisible();
  });

  test('the trade step passes axe with a trade in progress', async ({ crew }, testInfo) => {
    const sam = await crew.person('Sam');
    const dialog = await tradeStep(sam, CONTRACT_FIGHTER_SEED, 'fighter');
    await expect(dialog.getByText('Lowering a score by 2 raises a prime requisite by 1.')).toBeVisible();
    await control(dialog, 'Lower Intelligence').click();
    await expect(dialog.getByText('1 point to spend')).toBeVisible();
    const violations = await seriousViolations(sam.page, testInfo, 'ability-trade', '[role="dialog"]');
    expect(describeViolations(violations)).toEqual([]);
  });
});
