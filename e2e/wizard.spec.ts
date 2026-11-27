/**
 * The character wizard: one character of each class, an ability trade, extra languages, an arcane caster's first
 * spell, rolling hit points and gold, shopping with the rolled gold, a refusal for overspending, naming the
 * character on the review step, an unfinished character that survives closing the dialog, rolls that survive a
 * reload, and a class that rolling hit points fixes.
 */
import { expect, test } from './support/fixtures';
import {
  CLASS_CARDS,
  ROLL_SEEDS,
  UNQUALIFIED_HALFLING_SEED,
  addToCart,
  cart,
  chooseClass,
  classLabelText,
  createFromReview,
  chooseAlignment,
  next,
  openWizard,
  reachOutfit,
  rollFor,
  rollHitPointsAndGold,
  wizard,
  wizardButton,
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

/** The seeded rolls with no score a trade can lower, so the trade step offers Continue instead of a skip. */
const NO_TRADE: WizardClass[] = ['dwarf', 'magic_user'];

test.describe('character wizard', () => {
  for (const classId of Object.keys(ROLL_SEEDS) as WizardClass[]) {
    test(`creates ${/^[AEIOU]/.test(classLabelText(classId)) ? 'an' : 'a'} ${classLabelText(classId).toLowerCase()} and adds it to the party`, async ({
      crew,
    }) => {
      const sam = await crew.person('Sam');
      const table = await sam.client.createTable({ name: `Wizard ${classId}` });
      // The halfling's first roll has too little Dexterity, so the player rolls again, which the table allows.
      if (classId === 'halfling') {
        await sam.client.updateTable(table.id, { settings: { ability_score_rerolls: 1 } });
      }
      await sam.seedAbilityRolls(
        classId === 'halfling' ? [UNQUALIFIED_HALFLING_SEED, ROLL_SEEDS.halfling] : [ROLL_SEEDS[classId]],
      );
      await sam.page.goto(`/tables/${table.id}`);
      const dialog = await openWizard(sam.page);

      const rolls = await rollFor(dialog, classId);
      expect(rolls).toBe(classId === 'halfling' ? 2 : 1);
      await next(dialog);
      await chooseClass(dialog, classId);
      await dialog
        .getByRole('contentinfo')
        .getByRole('button', { name: NO_TRADE.includes(classId) ? 'Continue' : 'Skip this step' })
        .click();

      await chooseAlignment(dialog);
      if (ARCANE.includes(classId)) {
        await dialog
          .getByRole('region', { name: 'First spell' })
          .getByRole('button', { name: /^Sleep / })
          .click();
        await expect(dialog.getByText('1 of 1 chosen')).toBeVisible();
      }
      await next(dialog);

      const rolled = await rollHitPointsAndGold(dialog);
      await expect(cart(dialog)).toContainText(`0 gp spent, ${rolled.gold} gp left`);
      await addToCart(dialog, [WEAPONS[classId]]);
      await next(dialog);
      await createFromReview(sam.page, dialog, NAMES[classId]);

      // The new character joins the party in the lobby.
      const order = sam.page.getByRole('list', { name: 'Party in marching order' });
      await expect(order.getByRole('listitem').filter({ hasText: NAMES[classId] })).toBeVisible({
        timeout: 20_000,
      });
      const stored = (await sam.client.listCharacters()).items.find((item) => item.name === NAMES[classId]);
      expect(stored?.class_id).toBe(classId);
      // The character keeps the hit points the player rolled.
      expect(stored?.max_hp).toBe(rolled.hitPoints);
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
    await dialog.getByRole('button', { name: 'Raise Strength' }).click();
    await expect(dialog.getByRole('group', { name: /^Strength after the trade 16/ })).toBeVisible();
    await expect(dialog.getByRole('group', { name: /^Intelligence after the trade 12/ })).toBeVisible();
    await next(dialog);

    await chooseAlignment(dialog);
    await next(dialog);
    expect((await rollHitPointsAndGold(dialog)).gold).toBe(110);

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
    // Continue waits for the cart check, so once it's enabled the check has answered without a refusal.
    await expect(dialog.getByRole('contentinfo').getByRole('button', { name: 'Continue' })).toBeEnabled({
      timeout: 15_000,
    });
    await expect(shop.getByRole('alert')).toHaveCount(0);
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

  test('a halfling finishes a trade across two prime requisites, one point at a time', async ({ crew }) => {
    const sam = await crew.person('Sam');
    const table = await sam.client.createTable({ name: 'Two primes' });
    await sam.seedAbilityRolls([ROLL_SEEDS.halfling]);
    await sam.page.goto(`/tables/${table.id}`);
    const dialog = await openWizard(sam.page);
    await rollFor(dialog, 'halfling');
    await next(dialog);
    await chooseClass(dialog, 'halfling');

    const lower = dialog.getByRole('button', { name: 'Lower Wisdom' });
    const footer = dialog.getByRole('contentinfo');

    // Each click lowers Wisdom by 2 and buys a point. The keyboard works the control once the limits load.
    await expect(lower).toBeEnabled();
    await lower.focus();
    await sam.page.keyboard.press('Enter');
    await expect(dialog.getByText('1 point to spend')).toBeVisible();
    await sam.page.keyboard.press('Enter');
    await expect(dialog.getByText('2 points to spend')).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    const cont = footer.getByRole('button', { name: 'Continue' });
    await expect(cont).toHaveAttribute('aria-disabled', 'true');

    await dialog.getByRole('button', { name: 'Raise Strength' }).click();
    await expect(dialog.getByText('1 point to spend')).toBeVisible();
    await dialog.getByRole('button', { name: 'Raise Dexterity' }).click();
    await expect(dialog.getByText('Trade complete')).toBeVisible();
    await expect(dialog.getByRole('group', { name: /^Strength after the trade 17/ })).toBeVisible();
    await expect(dialog.getByRole('group', { name: /^Dexterity after the trade 17/ })).toBeVisible();
    await expect(dialog.getByRole('group', { name: /^Wisdom after the trade 10/ })).toBeVisible();
    await next(dialog);
    await expect(dialog.getByRole('heading', { name: 'Alignment and languages', level: 3 })).toBeVisible();
  });

  test("a score the class can't lower has a disabled control that says why", async ({ crew }) => {
    const sam = await crew.person('Sam');
    const table = await sam.client.createTable({ name: 'Wrong trade' });
    await sam.seedAbilityRolls([ROLL_SEEDS.halfling]);
    await sam.page.goto(`/tables/${table.id}`);
    const dialog = await openWizard(sam.page);
    await rollFor(dialog, 'halfling');
    await next(dialog);
    await chooseClass(dialog, 'halfling');

    const lower = dialog.getByRole('button', { name: 'Lower Constitution' });
    await expect(lower).toHaveAttribute('aria-disabled', 'true');
    await expect(lower).toHaveAccessibleDescription("Constitution can't be lowered.");
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
    // Dexterity can't be traded at all, so its control gives that one reason (R-105).
    await expect(dialog.getByRole('button', { name: 'Lower Dexterity' })).toHaveAccessibleDescription(
      "Dexterity can't be lowered.",
    );
    // Strength and Wisdom are 10, too low to lower, so no trade is possible and the step offers Continue.
    await next(dialog);
    await chooseAlignment(dialog, 'Neutral');

    const languages = dialog.getByRole('region', { name: 'Languages' });
    await expect(languages).toContainText('A magic-user speaks Common and the alignment tongue.');
    await expect(languages).toContainText('0 of 2 chosen');
    const extra = languages.getByRole('group', { name: 'Extra languages' });
    await extra.getByRole('checkbox', { name: 'Elvish', exact: true }).check();
    await extra.getByRole('checkbox', { name: 'Goblin', exact: true }).check();
    await expect(languages).toContainText('2 of 2 chosen');
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
    await rollHitPointsAndGold(dialog);

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

  test('names the character on the review step and closes onto the party', async ({ crew }) => {
    const sam = await crew.person('Sam');
    const table = await sam.client.createTable({ name: 'Naming' });
    await sam.seedAbilityRolls([ROLL_SEEDS.fighter]);
    await sam.page.goto(`/tables/${table.id}`);
    const dialog = await openWizard(sam.page);
    await rollFor(dialog, 'fighter');
    await next(dialog);
    await chooseClass(dialog, 'fighter');
    await dialog.getByRole('button', { name: 'Skip this step' }).click();
    await chooseAlignment(dialog);
    // The name waits for the last step.
    await expect(dialog.getByRole('textbox', { name: 'Name' })).toHaveCount(0);
    await next(dialog);
    await rollHitPointsAndGold(dialog);
    await addToCart(dialog, ['Sword']);
    await next(dialog);

    // The review step opens on the empty name field.
    await expect(dialog.getByRole('heading', { name: 'Review', level: 3 })).toBeVisible();
    const name = dialog.getByRole('textbox', { name: 'Name' });
    await expect(name).toBeFocused();

    // A click outside the dialog doesn't end the wizard. The top-left corner of the page is the overlay.
    await sam.page.mouse.click(4, 4);
    await expect(dialog).toBeVisible();

    // Reopened on the review step without a name, the wizard starts on the name field again.
    await sam.page.keyboard.press('Escape');
    await expect(wizard(sam.page)).toHaveCount(0);
    await openWizard(sam.page, 'Resume character');
    await expect(name).toBeFocused();

    // Create character without a name goes back to the field and stores nothing.
    const create = dialog.getByRole('contentinfo').getByRole('button', { name: 'Create character' });
    await create.click();
    await expect(name).toBeFocused();
    await expect(name).toHaveAccessibleDescription('Enter a name.');
    await expect(dialog).toBeVisible();
    // A tab in the name is caught before the server sees it, in the wizard's own words.
    await name.fill('Wren\tVale');
    await create.click();
    await expect(name).toHaveAccessibleDescription('Remove tabs and other invisible marks from the name.');
    expect((await sam.client.listCharacters()).items.some((item) => item.name === 'Flarg')).toBe(false);

    await dialog.getByRole('button', { name: 'Suggest a name' }).click();
    await expect(name).not.toHaveValue('');
    await name.fill('Flarg');
    await create.click();
    await expect(wizard(sam.page)).toHaveCount(0, { timeout: 20_000 });

    // The wizard closes onto the lobby, with the new character in the party and focus back on the button.
    const order = sam.page.getByRole('list', { name: 'Party in marching order' });
    await expect(order.getByRole('listitem').filter({ hasText: 'Flarg' })).toBeVisible({ timeout: 20_000 });
    await expect(wizardButton(sam.page, 'Create a character')).toBeFocused();
    await expect(sam.page.getByRole('status').filter({ hasText: 'Flarg joined the party.' })).toHaveCount(1);
  });

  test('on a phone the equipment is a list with an Add button on each row', async ({ crew }) => {
    const sam = await crew.person('Sam', { viewport: { width: 390, height: 844 } });
    const table = await sam.client.createTable({ name: 'Phone shop' });
    const dialog = await reachOutfit(sam, table.id);

    // The list takes the table's place, and nothing scrolls sideways.
    const list = dialog.getByRole('list', { name: 'Equipment for sale' });
    await expect(list).toBeVisible();
    await expect(dialog.getByRole('table')).toHaveCount(0);
    const add = list.getByRole('button', { name: 'Add Sword to the cart' });
    await add.scrollIntoViewIfNeeded();
    await expect(add).toBeInViewport();
    expect(
      await sam.page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await expect(list.getByRole('listitem').filter({ hasText: 'Sword' }).first()).toContainText(
      /\d+ gp · \d+ cn/,
    );

    // Add puts the item in the cart, and focus moves to the stepper that replaces the button.
    await list.getByRole('button', { name: 'Add Sword to the cart' }).click();
    await expect(cart(dialog)).toContainText('Sword');
    await expect(list.getByRole('button', { name: 'Add one sword' })).toBeFocused();
    // The cart sits under the list, so the Equipment heading row shows the gold left, the same amount as the purse.
    const purse = cart(dialog).getByText(/^\d+ gp spent, \d+ gp left$/);
    const left = /(\d+) gp left/.exec((await purse.textContent()) ?? '')?.[1] ?? '';
    const headingRow = dialog.getByRole('heading', { name: 'Equipment', level: 3 }).locator('..');
    await expect(headingRow.getByText(`${left} gp left`, { exact: true })).toBeVisible();
    await list.getByRole('button', { name: 'Remove one sword' }).click();
    await expect(list.getByRole('button', { name: 'Add Sword to the cart' })).toBeFocused();
    await expect(cart(dialog)).not.toContainText('Sword');
  });

  test('a draft survives closing the dialog and reloading the page', async ({ crew }) => {
    const sam = await crew.person('Sam');
    const table = await sam.client.createTable({ name: 'Draft' });
    // Start over rolls new ability scores, so the table allows a reroll.
    await sam.client.updateTable(table.id, { settings: { ability_score_rerolls: 1 } });
    await sam.seedAbilityRolls([ROLL_SEEDS.thief]);
    await sam.page.goto(`/tables/${table.id}`);
    let dialog = await openWizard(sam.page);
    await rollFor(dialog, 'thief');
    await next(dialog);
    await chooseClass(dialog, 'thief');
    await dialog.getByRole('button', { name: 'Skip this step' }).click();
    await chooseAlignment(dialog, 'Chaotic');

    // Closing midway keeps the unfinished character, and the lobby button says so.
    await dialog.getByRole('banner').getByRole('button', { name: 'Close' }).click();
    await expect(wizard(sam.page)).toHaveCount(0);
    await expect(wizardButton(sam.page, 'Resume character')).toBeFocused();

    dialog = await openWizard(sam.page, 'Resume character');
    await expect(dialog.getByRole('heading', { name: 'Alignment and languages', level: 3 })).toBeVisible();
    await expect(dialog.getByRole('radio', { name: 'Chaotic' })).toBeChecked();

    // Escape closes the wizard too.
    await sam.page.keyboard.press('Escape');
    await expect(wizard(sam.page)).toHaveCount(0);
    await expect(wizardButton(sam.page, 'Resume character')).toBeFocused();

    await sam.page.reload();
    dialog = await openWizard(sam.page, 'Resume character');
    await expect(dialog.getByRole('radio', { name: 'Chaotic' })).toBeChecked();
    await expect(dialog.getByRole('button', { name: /^Choose a class \(complete\) Thief/ })).toBeVisible();

    // Starting over clears the draft after a confirmation.
    await dialog.getByRole('button', { name: 'Start over' }).click();
    await sam.page
      .getByRole('alertdialog')
      .getByRole('button', { name: /Start over/ })
      .click();
    await expect(dialog.getByRole('button', { name: 'Roll ability scores' })).toBeVisible();
    await dialog.getByRole('banner').getByRole('button', { name: 'Close' }).click();
    await expect(wizardButton(sam.page, 'Create a character')).toBeVisible();
  });

  test('the rolled hit points and gold survive a reload, and the wizard never offers them again', async ({
    crew,
  }) => {
    const sam = await crew.person('Sam');
    const table = await sam.client.createTable({ name: 'Rolls' });
    await sam.seedAbilityRolls([ROLL_SEEDS.thief]);
    await sam.page.goto(`/tables/${table.id}`);
    let dialog = await openWizard(sam.page);
    await rollFor(dialog, 'thief');
    await next(dialog);
    await chooseClass(dialog, 'thief');
    await dialog.getByRole('button', { name: 'Skip this step' }).click();
    await chooseAlignment(dialog, 'Chaotic');
    await next(dialog);

    const rollHitPoints = dialog.getByRole('button', { name: 'Roll hit points' });
    const rollGold = dialog.getByRole('button', { name: 'Roll starting gold' });
    // Gold waits for the hit points, and Continue waits for both.
    await expect(rollGold).toBeDisabled();
    await expect(dialog.getByRole('contentinfo').getByRole('button', { name: 'Continue' })).toHaveCount(0);
    await rollHitPoints.click();
    const hp = dialog.getByText(/You start with \d+ hit points?\./);
    await expect(hp).toBeVisible();
    await rollGold.click();
    const gold = dialog.getByText(/You start with \d+ gold pieces? to spend on equipment\./);
    await expect(gold).toBeVisible();
    const hpText = (await hp.textContent()) ?? '';
    const goldText = (await gold.textContent()) ?? '';

    await sam.page.reload();
    dialog = await openWizard(sam.page, 'Resume character');
    await expect(dialog.getByRole('heading', { name: 'Hit points and gold', level: 3 })).toBeVisible();
    await expect(dialog.getByText(hpText)).toBeVisible();
    await expect(dialog.getByText(goldText)).toBeVisible();
    await expect(rollHitPoints).toHaveCount(0);
    await expect(rollGold).toHaveCount(0);

    await next(dialog);
    const gp = /(\d+) gold piece/.exec(goldText)?.[1] ?? '';
    await expect(cart(dialog)).toContainText(`0 gp spent, ${gp} gp left`);
  });

  test('rolling hit points fixes the class, and going back shows why it can’t change', async ({ crew }) => {
    const sam = await crew.person('Sam');
    const table = await sam.client.createTable({ name: 'Fixed class' });
    await sam.seedAbilityRolls([ROLL_SEEDS.fighter]);
    await sam.page.goto(`/tables/${table.id}`);
    const dialog = await openWizard(sam.page);
    await rollFor(dialog, 'fighter');
    await next(dialog);
    await chooseClass(dialog, 'fighter');
    await dialog.getByRole('button', { name: 'Skip this step' }).click();
    await chooseAlignment(dialog);
    await next(dialog);

    // Before the roll, the step says what rolling fixes.
    await expect(dialog).toContainText('Rolling hit points fixes your class as a fighter');
    await dialog.getByRole('button', { name: 'Roll hit points' }).click();
    const hp = dialog.getByText(/You start with \d+ hit points?\./);
    const hpText = (await hp.textContent()) ?? '';

    await dialog.getByRole('button', { name: /^Choose a class \(complete\)/ }).click();
    await expect(dialog.getByText('Your class is fixed as a fighter')).toBeVisible();
    await expect(dialog).toContainText('You rolled hit points for these ability scores.');
    // A new table allows no rerolls, so nothing offers new ability scores for another class.
    await expect(dialog).not.toContainText('Start over');
    await expect(dialog.getByRole('button', { name: 'Start over' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: CLASS_CARDS.cleric, exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: CLASS_CARDS.fighter, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // The other choices stay free, and the hit points wait where the player left them.
    await next(dialog);
    await dialog.getByRole('button', { name: 'Skip this step' }).click();
    await chooseAlignment(dialog);
    await next(dialog);
    await expect(dialog.getByText(hpText)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Roll hit points' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Roll starting gold' })).toBeEnabled();
  });
});
