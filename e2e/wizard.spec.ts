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
  cleric: 'Osric',
  dwarf: 'Durgan',
  elf: 'Ilsevel',
  fighter: 'Brenna',
  halfling: 'Pip',
  magic_user: 'Tamsin',
  thief: 'Wren',
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
      await expect(cart(dialog)).toContainText('The shop and your class accept this outfit.');
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
    await rollFor(dialog, 'fighter');
    await next(dialog);
    await chooseClass(dialog, 'fighter');

    // Two points of Intelligence buy one point of Strength, the fighter's prime requisite.
    await dialog.getByRole('button', { name: 'Lower Intelligence' }).click();
    await dialog.getByRole('button', { name: 'Lower Intelligence' }).click();
    await dialog.getByRole('button', { name: 'Raise Strength' }).click();
    await expect(dialog.getByRole('group', { name: /^Strength after the trade 16/ })).toBeVisible();
    await expect(dialog.getByRole('group', { name: /^Intelligence after the trade 12/ })).toBeVisible();
    await next(dialog);

    await fillIdentity(dialog, 'Brenna');
    await next(dialog);

    // Two suits of plate mail cost more than the 110 gp this roll gives a fighter.
    const shop = cart(dialog);
    await expect(shop).toContainText('110 gp');
    await addToCart(dialog, ['Plate mail']);
    await shop.getByRole('button', { name: 'Add one suit of plate mail' }).click();
    await expect(shop.getByRole('alert')).toContainText("there isn't enough gold");
    await expect(dialog.getByRole('contentinfo').getByRole('button', { name: 'Continue' })).toBeDisabled();

    await shop.getByRole('button', { name: 'Remove Plate mail from the cart' }).click();
    await addToCart(dialog, ['Plate mail', 'Sword', 'Shield', 'Torches (6)']);
    await expect(shop).toContainText('81 gp spent, 29 gp left');
    // The first armour, shield, and weapon the class can use go on as they're added (D-101).
    await expect(shop.getByRole('checkbox', { name: 'Wear the suit of plate mail' })).toBeChecked();
    await expect(shop.getByRole('checkbox', { name: 'Wear the shield' })).toBeChecked();
    await expect(shop.getByRole('checkbox', { name: 'Wield the sword' })).toBeChecked();
    await expect(shop).toContainText('The shop and your class accept this outfit.');
    await next(dialog);

    const review = dialog;
    await expect(review.getByRole('group', { name: /^Strength 16/ })).toBeVisible();
    await expect(review.getByRole('region', { name: 'Equipment' })).toContainText('A suit of plate mail');
    await createFromReview(sam.page, dialog, 'Brenna');
    await expect(
      sam.page
        .getByRole('list', { name: 'Party in marching order' })
        .getByRole('listitem')
        .filter({ hasText: 'Brenna' }),
    ).toBeVisible({ timeout: 20_000 });

    const summary = (await sam.client.listCharacters()).items.find((item) => item.name === 'Brenna');
    if (summary === undefined) throw new Error('Brenna was not stored.');
    const brenna = await sam.client.getCharacter(summary.id);
    const sheet = brenna.character;
    expect(sheet.scores).toMatchObject({ str: 16, int: 12 });
    expect(sheet.inventory?.purse.gp).toBe(29);
    expect(sheet.inventory?.worn_armour).toBeTruthy();
    expect(sheet.inventory?.shield).toBeTruthy();
    expect(sheet.inventory?.wielded.length).toBe(1);
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
    await dialog.getByRole('button', { name: 'Skip this step' }).click();
    await fillIdentity(dialog, 'Tamsin', 'Neutral');

    const languages = dialog.getByRole('region', { name: 'Languages' });
    await expect(languages).toContainText(
      'An Intelligence of 16 lets you learn 2 more languages. Chosen: 0 of 2.',
    );
    await languages.getByRole('checkbox', { name: 'Elvish', exact: true }).check();
    await languages.getByRole('checkbox', { name: 'Goblin', exact: true }).check();
    await expect(languages).toContainText('Chosen: 2 of 2.');
    // A third language is more than the Intelligence allows.
    await expect(languages.getByRole('checkbox', { name: 'Dwarvish', exact: true })).toBeDisabled();

    const spells = dialog.getByRole('region', { name: 'First spell' });
    await expect(spells).toContainText('0 of 1 chosen');
    // Continuing without a spell isn't possible for an arcane caster.
    await spells.getByRole('button', { name: /^Magic Missile / }).click();
    await expect(spells).toContainText('1 of 1 chosen');
    await next(dialog);

    // The class decides what the character may wear. The wizard puts the chainmail on, the rules engine refuses,
    // and the wizard takes it off again with a note.
    const shop = cart(dialog);
    await addToCart(dialog, ['Chainmail']);
    await expect(dialog.getByRole('region', { name: 'The shelves' })).toContainText(
      "Magic-users can't wear armour. The suit of chainmail stays in the pack.",
    );
    await expect(shop.getByRole('checkbox', { name: 'Wear the suit of chainmail' })).not.toBeChecked();
    // Putting it on by hand gets the refusal in the cart.
    await shop.getByRole('checkbox', { name: 'Wear the suit of chainmail' }).check();
    await expect(shop.getByRole('alert')).toContainText("Magic-users can't wear armour.");
    await expect(dialog.getByRole('contentinfo').getByRole('button', { name: 'Continue' })).toBeDisabled();
    await shop.getByRole('button', { name: 'Remove Chainmail from the cart' }).click();
    await addToCart(dialog, ['Dagger']);
    await next(dialog);

    const review = dialog.getByRole('region', { name: 'Languages and spells' });
    await expect(review).toContainText('Elvish');
    await expect(review).toContainText('Goblin');
    await expect(review).toContainText('Magic Missile');
    await createFromReview(sam.page, dialog, 'Tamsin');
    await expect(
      sam.page
        .getByRole('list', { name: 'Party in marching order' })
        .getByRole('listitem')
        .filter({ hasText: 'Tamsin' }),
    ).toBeVisible({ timeout: 20_000 });

    const summary = (await sam.client.listCharacters()).items.find((item) => item.name === 'Tamsin');
    if (summary === undefined) throw new Error('Tamsin was not stored.');
    const tamsin = (await sam.client.getCharacter(summary.id)).character;
    expect(tamsin.extra_languages.length).toBe(2);
    expect(tamsin.alignment).toBe('neutral');
    expect(JSON.stringify(tamsin.spell_book)).toContain('magic_missile');
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
    await fillIdentity(dialog, 'Wren', 'Chaotic');

    await dialog.getByRole('banner').getByRole('button', { name: 'Close' }).click();
    await expect(wizard(sam.page)).toHaveCount(0);

    dialog = await openWizard(sam.page);
    await expect(dialog.getByRole('heading', { name: 'Identity', level: 3 })).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue('Wren');
    await expect(dialog.getByRole('radio', { name: 'Chaotic' })).toBeChecked();

    await sam.page.reload();
    dialog = await openWizard(sam.page);
    await expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveValue('Wren');
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
