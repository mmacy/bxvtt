/**
 * The character wizard: one character of each class, an ability trade, extra languages, an arcane caster's first
 * spell, shopping with the rolled gold, a refusal for overspending, and a draft that survives closing the dialog.
 */
import { expect, test } from './support/fixtures';
import {
  ROLL_SEEDS,
  UNQUALIFIED_HALFLING_SEED,
  addToCart,
  cart,
  chooseClass,
  classLabelText,
  createFromReview,
  fillIdentity,
  next,
  openWizard,
  rollFor,
  wizard,
  type WizardClass,
} from './support/wizard';

/** A weapon each class may wield, so every character leaves the shop with something. */
const WEAPONS: Record<WizardClass, string> = {
  cleric: 'Mace',
  dwarf: 'War hammer',
  elf: 'Sword',
  fighter: 'Sword',
  halfling: 'Short sword',
  magic_user: 'Dagger',
  thief: 'Dagger',
};

const NAMES: Record<WizardClass, string> = {
  cleric: 'Clarence',
  dwarf: 'Doke',
  elf: 'Elfy',
  fighter: 'Flarg',
  halfling: 'Huge',
  magic_user: 'Mazpar',
  thief: 'Tinks',
};

const ARCANE: WizardClass[] = ['magic_user', 'elf'];

test.describe('character wizard', () => {
  for (const classId of Object.keys(ROLL_SEEDS) as WizardClass[]) {
    test(`creates ${/^[AEIOU]/.test(classLabelText(classId)) ? 'an' : 'a'} ${classLabelText(classId).toLowerCase()} and adds it to the party`, async ({
      crew,
    }) => {
      const sam = await crew.person('Sam');
      const table = await sam.client.createTable({ name: `Wizard ${classId}` });
      // The halfling's first roll has too little Dexterity, so the player rolls again.
      await sam.seedAbilityRolls(
        classId === 'halfling' ? [UNQUALIFIED_HALFLING_SEED, ROLL_SEEDS.halfling] : [ROLL_SEEDS[classId]],
      );
      await sam.page.goto(`/tables/${table.id}`);
      const dialog = await openWizard(sam.page);

      const rolls = await rollFor(dialog, classId);
      expect(rolls).toBe(classId === 'halfling' ? 2 : 1);
      await next(dialog);
      await chooseClass(dialog, classId);
      await dialog.getByRole('button', { name: 'Skip this step' }).click();

      await fillIdentity(dialog, NAMES[classId]);
      if (ARCANE.includes(classId)) {
        await dialog
          .getByRole('region', { name: 'First spell' })
          .getByRole('button', { name: /^Sleep / })
          .click();
        await expect(dialog.getByText('1 of 1 chosen')).toBeVisible();
      }
      await next(dialog);

      await expect(dialog.getByRole('heading', { name: 'Outfit', level: 3 })).toBeVisible();
      await expect(cart(dialog)).toContainText(/0 gp spent, \d+ gp left/);
      await addToCart(dialog, [WEAPONS[classId]]);
      await expect(cart(dialog)).toContainText('Your character can afford and use this equipment.');
      await next(dialog);
      await createFromReview(sam.page, dialog, NAMES[classId]);

      // The new character joins the party in the lobby.
      const order = sam.page.getByRole('list', { name: 'Party in marching order' });
      await expect(order.getByRole('listitem').filter({ hasText: NAMES[classId] })).toBeVisible({
        timeout: 20_000,
      });
      const stored = (await sam.client.listCharacters()).items.find((item) => item.name === NAMES[classId]);
      expect(stored?.class_id).toBe(classId);
      expect((await sam.client.getTable(table.id)).roster.map((entry) => entry.name)).toEqual([
        NAMES[classId],
      ]);
    });
  }

  test('a fighter trades Intelligence for Strength, is refused for overspending, and shops within the gold', async ({
    crew,
  }) => {
    const sam = await crew.person('Sam');
    const table = await sam.client.createTable({ name: 'Trade and shop' });
    await sam.seedAbilityRolls([ROLL_SEEDS.fighter]);
    await sam.page.goto(`/tables/${table.id}`);
    const dialog = await openWizard(sam.page);
    // While the dice tumble, the step shows neither the qualifying classes nor Continue (R-113).
    await dialog.getByRole('button', { name: 'Roll ability scores' }).click();
    const qualifies = dialog.getByRole('region', { name: 'Classes this roll qualifies for' });
    await expect(qualifies).toHaveCount(0);
    await expect(qualifies).toBeVisible();
    await expect(qualifies.getByRole('listitem').filter({ hasText: /^Fighter/ })).not.toContainText(/needs/i);
    await next(dialog);
    // Class features are in sentence case (R-112).
    await expect(dialog).toContainText('Detect construction tricks');
    await expect(dialog).not.toContainText('Detect Construction Tricks');
    await chooseClass(dialog, 'fighter');

    // Two points of Intelligence buy one point of Strength, the fighter's prime requisite.
    await dialog.getByRole('button', { name: 'Lower Intelligence' }).click();
    await dialog.getByRole('button', { name: 'Lower Intelligence' }).click();
    await dialog.getByRole('button', { name: 'Raise Strength' }).click();
    await expect(dialog.getByRole('group', { name: /^Strength after the trade 16/ })).toBeVisible();
    await expect(dialog.getByRole('group', { name: /^Intelligence after the trade 12/ })).toBeVisible();
    await next(dialog);

    await fillIdentity(dialog, 'Flarg');
    await next(dialog);

    // Two suits of plate mail cost more than the 110 gp this roll gives a fighter.
    const shop = cart(dialog);
    await expect(shop).toContainText('110 gp');
    // The coin is drawn, not written as a letter in the text (R-108).
    await expect(shop).not.toContainText(/gold\s*g\s*\d/);
    await addToCart(dialog, ['Plate mail']);
    await shop.getByRole('button', { name: 'Add one suit of plate mail' }).click();
    await expect(shop.getByRole('alert')).toContainText("you don't have enough gold");
    await expect(dialog.getByRole('contentinfo').getByRole('button', { name: 'Continue' })).toBeDisabled();

    await shop.getByRole('button', { name: 'Remove Plate mail from the cart' }).click();
    await addToCart(dialog, ['Plate mail', 'Sword', 'Shield', 'Torches (6)']);
    await expect(shop).toContainText('81 gp spent, 29 gp left');
    // The first armour, shield, and weapon the class can use go on as they're added (D-101). Each checkbox's name is
    // its visible label (R-102).
    await expect(shop.getByRole('checkbox', { name: 'Wear the plate mail', exact: true })).toBeChecked();
    await expect(shop.getByRole('checkbox', { name: 'Wear the shield', exact: true })).toBeChecked();
    await expect(shop.getByRole('checkbox', { name: 'Wield the sword', exact: true })).toBeChecked();
    await expect(shop.getByText('Wear the plate mail', { exact: true })).toBeVisible();
    await expect(shop).toContainText('Your character can afford and use this equipment.');
    await next(dialog);

    const review = dialog;
    await expect(review.getByRole('group', { name: /^Strength 16/ })).toBeVisible();
    await expect(review.getByRole('region', { name: 'Equipment' })).toContainText('Plate mail');
    await createFromReview(sam.page, dialog, 'Flarg');
    await expect(
      sam.page
        .getByRole('list', { name: 'Party in marching order' })
        .getByRole('listitem')
        .filter({ hasText: 'Flarg' }),
    ).toBeVisible({ timeout: 20_000 });

    const summary = (await sam.client.listCharacters()).items.find((item) => item.name === 'Flarg');
    if (summary === undefined) throw new Error('Flarg was not stored.');
    const flarg = await sam.client.getCharacter(summary.id);
    const sheet = flarg.character;
    expect(sheet.scores).toMatchObject({ str: 16, int: 12 });
    expect(sheet.inventory?.purse.gp).toBe(29);
    expect(sheet.inventory?.worn_armour).toBeTruthy();
    expect(sheet.inventory?.shield).toBeTruthy();
    expect(sheet.inventory?.wielded.length).toBe(1);
  });

  test('a halfling finishes a trade across two prime requisites, guided step by step', async ({ crew }) => {
    const sam = await crew.person('Sam');
    const table = await sam.client.createTable({ name: 'Two primes' });
    await sam.seedAbilityRolls([ROLL_SEEDS.halfling]);
    await sam.page.goto(`/tables/${table.id}`);
    const dialog = await openWizard(sam.page);
    await rollFor(dialog, 'halfling');
    await next(dialog);
    await chooseClass(dialog, 'halfling');

    const lower = dialog.getByRole('button', { name: 'Lower Wisdom' });
    const guidance = dialog.getByText("Your ability trade isn't finished");
    const warning = dialog.getByRole('alert');
    const footer = dialog.getByRole('contentinfo');

    // One click on minus lowers Wisdom by 1, which isn't an even amount yet. That's guidance, not a refusal.
    await lower.focus();
    await sam.page.keyboard.press('Enter');
    await expect(guidance).toBeVisible();
    await expect(dialog).toContainText(
      "You've lowered Wisdom by 1. Lower a score by an even amount to gain points.",
    );
    await expect(warning).toHaveCount(0);
    await expect(dialog).not.toContainText("This ability trade isn't allowed");

    // The second click gives points to spend.
    await sam.page.keyboard.press('Enter');
    await expect(dialog).toContainText(
      "You've gained 1 point from lowering scores. Raise a prime requisite to finish the trade.",
    );
    await expect(warning).toHaveCount(0);

    // Continue stays on the step, says why, and puts focus on the note a screen reader reads.
    const cont = footer.getByRole('button', { name: 'Continue' });
    await expect(cont).toBeEnabled();
    await cont.click();
    await expect(dialog.getByRole('heading', { name: 'Adjust scores', level: 3 })).toBeVisible();
    const note = dialog.getByText('Finish the trade, or reset to your rolled scores, before you continue.');
    await expect(note).toBeVisible();
    await expect(note).toBeFocused();

    // Two more clicks make 4 points of Wisdom, which buys 2 points of prime requisites. Spend one, then the other.
    await lower.click();
    await lower.click();
    await dialog.getByRole('button', { name: 'Raise Strength' }).click();
    await expect(dialog).toContainText(
      "You've gained 2 points from lowering scores and spent 1. Raise a prime requisite to spend the rest.",
    );
    await expect(warning).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Raise Dexterity' }).click();
    await expect(dialog.getByText('Valid ability trade')).toBeVisible();
    // The note about finishing the trade goes away with the trade in progress.
    await expect(note).toHaveCount(0);
    await expect(dialog.getByRole('group', { name: /^Strength after the trade 17/ })).toBeVisible();
    await expect(dialog.getByRole('group', { name: /^Dexterity after the trade 17/ })).toBeVisible();
    await expect(dialog.getByRole('group', { name: /^Wisdom after the trade 10/ })).toBeVisible();
    await next(dialog);
    await expect(dialog.getByRole('heading', { name: 'Identity', level: 3 })).toBeVisible();
  });

  test('a wrong ability trade is a warning, and resetting clears it', async ({ crew }) => {
    const sam = await crew.person('Sam');
    const table = await sam.client.createTable({ name: 'Wrong trade' });
    await sam.seedAbilityRolls([ROLL_SEEDS.halfling]);
    await sam.page.goto(`/tables/${table.id}`);
    const dialog = await openWizard(sam.page);
    await rollFor(dialog, 'halfling');
    await next(dialog);
    await chooseClass(dialog, 'halfling');

    await dialog.getByRole('button', { name: 'Lower Constitution' }).click();
    await expect(dialog.getByRole('alert')).toContainText("This ability trade isn't allowed");
    await expect(dialog).toContainText("Constitution can't be lowered.");
    await expect(dialog.getByText("Your ability trade isn't finished")).toHaveCount(0);
    await expect(dialog.getByRole('contentinfo').getByRole('button', { name: 'Continue' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Reset to rolled scores' }).click();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Skip this step' })).toBeEnabled();
  });

  test('a magic-user learns two extra languages and picks a first spell', async ({ crew }) => {
    const sam = await crew.person('Sam');
    const table = await sam.client.createTable({ name: 'Languages' });
    await sam.seedAbilityRolls([ROLL_SEEDS.magic_user]);
    await sam.page.goto(`/tables/${table.id}`);
    const dialog = await openWizard(sam.page);
    await rollFor(dialog, 'magic_user');
    await next(dialog);
    await chooseClass(dialog, 'magic_user');
    // Dexterity can't be traded at all, so the refusal gives that one reason (R-105).
    await dialog.getByRole('button', { name: 'Lower Dexterity' }).click();
    await expect(dialog).toContainText(
      "Dexterity can't be lowered. Only Strength, Intelligence, and Wisdom can be traded for points.",
    );
    await expect(dialog).not.toContainText('steps of 2');
    await dialog.getByRole('button', { name: 'Reset to rolled scores' }).click();
    await dialog.getByRole('button', { name: 'Skip this step' }).click();
    await fillIdentity(dialog, 'Mazpar', 'Neutral');

    const languages = dialog.getByRole('region', { name: 'Languages' });
    await expect(languages).toContainText(
      'With Intelligence 16, you can learn 2 extra languages. Chosen: 0 of 2.',
    );
    await languages.getByRole('checkbox', { name: 'Elvish', exact: true }).check();
    await languages.getByRole('checkbox', { name: 'Goblin', exact: true }).check();
    await expect(languages).toContainText('Chosen: 2 of 2.');
    // A third language is more than the Intelligence allows.
    await expect(languages.getByRole('checkbox', { name: 'Dwarvish', exact: true })).toBeDisabled();

    const spells = dialog.getByRole('region', { name: 'First spell' });
    await expect(spells).toContainText('0 of 1 chosen');
    // Every range is written one way (R-509).
    await expect(spells.getByRole('button', { name: /^Charm Person / })).toContainText('Range: 120’');
    await expect(spells.getByRole('button', { name: /^Shield / })).toContainText('Range: the caster');
    // Continuing without a spell isn't possible for an arcane caster.
    await spells.getByRole('button', { name: /^Magic Missile / }).click();
    await expect(spells).toContainText('1 of 1 chosen');
    await next(dialog);

    // The class decides what the character may wear. The wizard puts the chainmail on, the rules engine refuses,
    // and the wizard takes it off again with a note.
    const shop = cart(dialog);
    await addToCart(dialog, ['Chainmail']);
    await expect(dialog.getByRole('region', { name: 'Equipment' })).toContainText(
      "Magic-users can't wear armour. Moved the suit of chainmail to your pack.",
    );
    const wear = shop.getByRole('checkbox', { name: 'Wear the chainmail', exact: true });
    await expect(wear).not.toBeChecked();
    // Putting it on by hand gets the refusal in the cart.
    await wear.check();
    await expect(shop.getByRole('alert')).toContainText("Magic-users can't wear armour.");
    await expect(dialog.getByRole('contentinfo').getByRole('button', { name: 'Continue' })).toBeDisabled();
    await shop.getByRole('button', { name: 'Remove Chainmail from the cart' }).click();
    await addToCart(dialog, ['Dagger']);
    await next(dialog);

    const review = dialog.getByRole('region', { name: 'Languages and spells' });
    await expect(review).toContainText('Elvish');
    await expect(review).toContainText('Goblin');
    await expect(review).toContainText('Magic Missile');
    // A weapon alone reads as wielding only (R-110).
    await expect(dialog.getByRole('region', { name: 'Combat' })).toContainText(
      'You set out wielding a dagger.',
    );
    await createFromReview(sam.page, dialog, 'Mazpar');
    await expect(
      sam.page
        .getByRole('list', { name: 'Party in marching order' })
        .getByRole('listitem')
        .filter({ hasText: 'Mazpar' }),
    ).toBeVisible({ timeout: 20_000 });

    const summary = (await sam.client.listCharacters()).items.find((item) => item.name === 'Mazpar');
    if (summary === undefined) throw new Error('Mazpar was not stored.');
    const mazpar = (await sam.client.getCharacter(summary.id)).character;
    expect(mazpar.extra_languages.length).toBe(2);
    expect(mazpar.alignment).toBe('neutral');
    expect(JSON.stringify(mazpar.spell_book)).toContain('magic_missile');
  });

  test('a draft survives closing the dialog and reloading the page', async ({ crew }) => {
    const sam = await crew.person('Sam');
    const table = await sam.client.createTable({ name: 'Draft' });
    await sam.seedAbilityRolls([ROLL_SEEDS.thief]);
    await sam.page.goto(`/tables/${table.id}`);
    let dialog = await openWizard(sam.page);
    await rollFor(dialog, 'thief');
    await next(dialog);
    await chooseClass(dialog, 'thief');
    await dialog.getByRole('button', { name: 'Skip this step' }).click();
    await fillIdentity(dialog, 'Tinks', 'Chaotic');

    await dialog.getByRole('banner').getByRole('button', { name: 'Close' }).click();
    await expect(wizard(sam.page)).toHaveCount(0);

    dialog = await openWizard(sam.page);
    await expect(dialog.getByRole('heading', { name: 'Identity', level: 3 })).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue('Tinks');
    await expect(dialog.getByRole('radio', { name: 'Chaotic' })).toBeChecked();

    await sam.page.reload();
    dialog = await openWizard(sam.page);
    await expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue('Tinks');
    await expect(dialog.getByRole('button', { name: /^Choose a class \(complete\) Thief/ })).toBeVisible();

    // Starting over clears the draft after a confirmation.
    await dialog.getByRole('button', { name: 'Start over' }).click();
    await sam.page
      .getByRole('alertdialog')
      .getByRole('button', { name: /Start over/ })
      .click();
    await expect(dialog.getByRole('button', { name: 'Roll ability scores' })).toBeVisible();
  });
});
