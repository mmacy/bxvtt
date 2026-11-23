/**
 * The whole-game smoke test: a referee and two players play The Toll at Crookback Bridge from table creation to
 * victory through the interface alone, as a group would. Nothing here calls the SDK.
 *
 * The ability rolls and the session use fixed seeds (added to the requests the interface sends), so every run
 * rolls the same dice. The route is the one a first group takes on the rebalanced map: talk at the one-cell toll
 * gate and let the referee settle the toll, light a torch, fight the clerk and his bandit in the counting room and
 * pick up what they drop, climb the stairs from the counting room's door to the captain's loft, sleep the captain,
 * take her chest, then walk into the east gatehouse to raise the portcullis. The torch gives the party away in the
 * loft, and Mag Corrie kills Mazpar before anyone can act, on every run.
 */
import type { Locator, Page } from '@playwright/test';
import { expect, test, type Actor } from './support/fixtures';
import {
  battleBoard,
  declarationRow,
  declaring,
  encounterPanel,
  openFeed,
  stepParty,
} from './support/combat';
import { SCREENS_DIR } from './support/env';

/** The seed for each character's ability roll, chosen so each class qualifies with useful scores. */
const ROLLS = { Flarg: 56, Clarence: 34, Mazpar: 27, Elfy: 9 } as const;
const SESSION_SEED = 1981;

interface WizardChoices {
  name: keyof typeof ROLLS;
  className: RegExp;
  spell?: RegExp;
}

/** Creates a character through the wizard with the class's quick kit, and closes the wizard. */
async function createWithWizard(actor: Actor, choices: WizardChoices): Promise<void> {
  const { page } = actor;
  await actor.seedAbilityRolls([ROLLS[choices.name]]);
  await page.getByRole('button', { name: 'Create a character' }).click();
  const wizard = page.getByRole('dialog', { name: 'Create a character' });
  await wizard.getByRole('button', { name: 'Roll ability scores' }).click();
  await wizard.getByRole('button', { name: 'Continue' }).click();
  await wizard.getByRole('button', { name: choices.className }).click();
  await wizard.getByRole('button', { name: 'Continue' }).click();
  await wizard.getByRole('button', { name: 'Skip this step' }).click();
  await wizard.getByRole('textbox', { name: 'Name' }).fill(choices.name);
  await wizard.getByRole('radiogroup', { name: 'Alignment' }).getByRole('radio', { name: 'Lawful' }).click();
  if (choices.spell) await wizard.getByRole('button', { name: choices.spell }).click();
  await wizard.getByRole('button', { name: 'Continue' }).click();
  await wizard.getByRole('button', { name: 'Roll hit points' }).click();
  await wizard.getByRole('button', { name: 'Roll starting gold' }).click();
  await wizard.getByRole('button', { name: 'Continue' }).click();
  await wizard.getByRole('button', { name: /^Fill with the .* kit$/ }).click();
  await expect(wizard.getByText('Your character can afford and use this equipment.')).toBeVisible({
    timeout: 20_000,
  });
  await wizard.getByRole('button', { name: 'Continue' }).click();
  await wizard.getByRole('button', { name: 'Create character' }).click();
  const ready = page.getByRole('dialog', { name: `${choices.name} is ready` });
  await ready.getByRole('button', { name: 'Done' }).click();
  await expect(ready).toHaveCount(0);
  await expect(
    page
      .getByRole('list', { name: 'Party in marching order' })
      .getByRole('listitem')
      .filter({ hasText: choices.name }),
  ).toBeVisible();
  await page.context().unroute('**/api/ability-rolls');
}

/**
 * Opens the scene panel's description by hand, which pins it open in this browser. The panel folds to its title
 * bar after the first read and on each step within an area, unless the player pinned it.
 */
async function pinScene(page: Page): Promise<void> {
  const scene = page.getByRole('region', { name: 'Current location' });
  const hide = scene.getByRole('button', { name: 'Hide description' });
  // An open card that the player didn't open by hand folds by itself, so fold it first and open it again.
  if (await hide.isVisible()) await hide.click();
  await scene.getByRole('button', { name: 'Show description' }).click();
  await expect(hide).toBeVisible();
}

/**
 * Opens the door on one side of the party's cell from the pinned scene panel. The click comes right after a run
 * of moves, and the client queues it behind the move in flight (D-020), so one click opens the door.
 */
async function openDoor(page: Page, side: 'east' | 'south' | 'north' | 'west') {
  const row = page
    .getByRole('region', { name: 'Current location' })
    .getByRole('listitem')
    .filter({ hasText: `A door to the ${side}` });
  await row.getByRole('button', { name: 'Door' }).click();
  await page.getByRole('menuitem', { name: 'Open door' }).click();
  await expect(row).toContainText(/is open\./);
  await expect(page.getByRole('banner').getByText('Exploring', { exact: true })).toBeVisible();
}

/** Opens one member's declaration choices on the battle board, unless the board already opened them. */
async function choicesFor(page: Page, name: string): Promise<Locator> {
  const composer = page.getByRole('region', { name: `Declare for ${name}` });
  // After a declaration, the board opens the next member's choices by itself, a moment later.
  await composer.waitFor({ timeout: 1500 }).catch(() => undefined);
  if ((await composer.count()) === 0) {
    await declarationRow(page, name)
      .getByRole('button', { name: /^(Actions|Change|Declare for)/ })
      .click();
  }
  await expect(composer).toBeVisible();
  return composer;
}

/**
 * Declares a move toward a group, through the Move tab. A group reads as it does in a sentence: "the bandit", or
 * a named monster by its name alone, such as "Mag Corrie".
 */
async function closeIn(page: Page, name: string, group: string) {
  const composer = await choicesFor(page, name);
  await composer.getByRole('radio', { name: 'Move' }).click();
  await declaring(page, () => composer.getByRole('button', { name: `Close in on ${group}` }).click());
}

/**
 * Declares a melee attack through the Attack tab on the first of the groups that is still standing, closing in
 * first when the group is out of reach.
 */
async function attack(page: Page, name: string, ...groups: string[]) {
  const composer = await choicesFor(page, name);
  await composer.getByRole('radio', { name: 'Attack' }).click();
  for (const group of groups) {
    const button = composer.getByRole('button', {
      name: new RegExp(`^(Attack|Close in and attack): ${group}, \\d+ feet away$`),
    });
    if ((await button.count()) === 0) continue;
    await declaring(page, () => button.click());
    return;
  }
  throw new Error(`${name} can't attack any of ${groups.join(', ')}.`);
}

/** Declares *sleep* by Hit Dice at a group, through the Cast tab. */
async function castSleep(page: Page, name: string, group: string) {
  const composer = await choicesFor(page, name);
  await composer.getByRole('radio', { name: 'Cast' }).click();
  await composer
    .getByRole('radiogroup', { name: 'How to cast Sleep' })
    .getByRole('radio', { name: 'By Hit Dice' })
    .click();
  await declaring(page, () => composer.getByRole('button', { name: `Cast sleep at ${group}` }).click());
}

/** Waits until the board shows a round with nobody declared yet. */
async function newRound(pages: Page[]) {
  for (const page of pages) {
    await expect(battleBoard(page)).toContainText(/(?<!\d)0 of \d declared/, { timeout: 30_000 });
  }
}

const shot = (page: Page, name: string) => page.screenshot({ path: `${SCREENS_DIR}/smoke-${name}.png` });

test('a referee and two players play The Toll at Crookback Bridge from table creation to victory', async ({
  crew,
}) => {
  test.setTimeout(600_000);
  const ruth = await crew.person('Ruth', { signedIn: false });
  const sam = await crew.person('Sam', { signedIn: false });
  const ann = await crew.person('Ann', { signedIn: false });
  const everyone = [ruth.page, sam.page, ann.page];
  const players = [sam.page, ann.page];

  await test.step('the referee picks a name and creates a table', async () => {
    await ruth.page.goto('/');
    await ruth.page.getByRole('textbox', { name: 'Your name' }).fill('Ruth');
    await ruth.page.getByRole('button', { name: 'Continue' }).click();
    await ruth.page.getByRole('textbox', { name: 'Table name' }).fill('Crookback night');
    await ruth.page.getByRole('button', { name: 'Create table' }).click();
    await expect(ruth.page.getByRole('heading', { name: 'Crookback night', level: 1 })).toBeVisible();
  });

  await test.step('two players join with the invite link', async () => {
    const link = await ruth.page.getByRole('textbox', { name: 'Invite link' }).inputValue();
    for (const [actor, name] of [
      [sam, 'Sam'],
      [ann, 'Ann'],
    ] as const) {
      await actor.page.goto(link);
      await actor.page.getByRole('textbox', { name: 'Your name' }).fill(name);
      await actor.page.getByRole('button', { name: 'Join table' }).click();
      await expect(actor.page.getByRole('heading', { name: 'Crookback night', level: 1 })).toBeVisible();
    }
    await expect(ruth.page.getByText('3 of 3 online')).toBeVisible();
  });

  await test.step('each player creates two characters with the wizard', async () => {
    await createWithWizard(sam, { name: 'Flarg', className: /^Fighter/ });
    await createWithWizard(sam, { name: 'Clarence', className: /^Cleric/ });
    await createWithWizard(ann, { name: 'Mazpar', className: /^Magic-User/, spell: /^Sleep Range/ });
    await createWithWizard(ann, { name: 'Elfy', className: /^Elf/, spell: /^Sleep Range/ });
    const order = ruth.page.getByRole('list', { name: 'Party in marching order' }).getByRole('listitem');
    await expect(order).toHaveCount(4);
    for (const [index, name] of ['Flarg', 'Clarence', 'Mazpar', 'Elfy'].entries()) {
      await expect(order.nth(index)).toContainText(name);
    }
  });

  await test.step('the referee chooses the adventure and starts the game', async () => {
    await ruth.seedGameStart(SESSION_SEED);
    await ruth.page
      .getByRole('radiogroup', { name: 'Adventure' })
      .getByRole('radio', { name: /^The Toll at Crookback Bridge/ })
      .click();
    await ruth.page.getByRole('button', { name: 'Start game' }).click();
    for (const page of everyone) {
      await expect(page.getByRole('heading', { name: 'Wethercote', level: 2 })).toBeVisible({
        timeout: 30_000,
      });
    }
    await shot(sam.page, 'town');
  });

  await test.step('in town, the caller rests the party and the casters prepare sleep', async () => {
    await sam.page.getByRole('tab', { name: 'Rest and prepare' }).click();
    await sam.page.getByRole('button', { name: 'Rest a night' }).click();
    await expect(ann.page.getByRole('banner').getByText(/Day 1, 0[89]:/)).toBeVisible();
    await ann.page.getByRole('tab', { name: 'Rest and prepare' }).click();
    for (const name of ['Mazpar', 'Elfy']) {
      // A caster's button opens the sheet at its Spells tab.
      await ann.page.getByRole('button', { name: `Open ${name}'s spells` }).click();
      const sheet = ann.page.getByRole('dialog', { name });
      await expect(sheet.getByRole('tab', { name: 'Spells' })).toHaveAttribute('aria-selected', 'true');
      await sheet.getByRole('button', { name: 'Prepare spells' }).click();
      const prepare = ann.page.getByRole('dialog', { name: `Prepare ${name}'s spells` });
      // The dialog may already choose the spell in the book. Fill the one first-level slot either way.
      if (await prepare.getByText('Slots used: 0 of 1').isVisible()) {
        await prepare.getByRole('button', { name: 'More copies of Sleep' }).click();
      }
      await expect(prepare.getByText('Slots used: 1 of 1')).toBeVisible();
      await prepare.getByRole('button', { name: 'Prepare spells' }).click();
      await expect(prepare).toHaveCount(0);
      await expect(sheet.getByRole('region', { name: 'Memorized spells' })).toContainText(/Sleep/);
      await sheet.getByRole('button', { name: 'Close' }).first().click();
      await expect(sheet).toHaveCount(0);
    }
  });

  await test.step('the party sets out for Crookback Bridge', async () => {
    await sam.page.getByRole('tab', { name: 'Town square' }).click();
    await sam.page
      .getByRole('region', { name: 'Leave town' })
      .getByRole('button', { name: 'Set out' })
      .click();
    const confirm = sam.page.getByRole('dialog', { name: 'Set out for Crookback Bridge?' });
    await expect(confirm).toContainText('Your party carries light, a tinder box, rations, and rope.');
    await confirm.getByRole('button', { name: 'Set out' }).click();
    for (const page of everyone) {
      await expect(
        page.getByRole('region', { name: 'Current location' }).getByRole('heading', { name: 'The Kingsway' }),
      ).toBeVisible({ timeout: 30_000 });
    }
  });

  await test.step('at the toll gate, the caller talks and the referee settles the toll', async () => {
    await stepParty(sam.page, 'ArrowRight', [2, 6]);
    await stepParty(sam.page, 'ArrowRight', [3, 6]);
    await stepParty(sam.page, 'ArrowRight', [4, 6]);
    for (const page of everyone) {
      await expect(
        encounterPanel(page).getByRole('heading', { name: 'The party meets 3 bandits' }),
      ).toBeVisible();
    }
    await shot(ann.page, 'toll-gate');
    await encounterPanel(sam.page).getByRole('button', { name: 'Talk' }).click();
    // The member with the best reaction bonus is first in the list.
    await sam.page.getByRole('dialog', { name: 'Choose a speaker' }).getByRole('option').first().click();
    await expect(await openFeed(sam.page)).toContainText(/talks to the bandits\./);

    const tools = encounterPanel(ruth.page);
    await tools.getByText('Monsters and referee tools').click();
    await tools.getByRole('button', { name: 'End in parley' }).click();
    const settle = ruth.page.getByRole('alertdialog', {
      name: 'End encounter in parley with the bandits?',
    });
    await settle.getByRole('checkbox', { name: 'Mark area encounter resolved' }).click();
    await settle.getByRole('button', { name: 'End encounter' }).click();
    for (const page of everyone) await expect(encounterPanel(page)).toHaveCount(0);
    await shot(sam.page, 'toll-gate-settled');
  });

  await test.step('the caller has Flarg light a torch, and the map and the party panel say so', async () => {
    await expect(sam.page.getByRole('button', { name: 'Light: The party has no light.' })).toBeVisible();
    await sam.page
      .getByRole('toolbar', { name: 'Party actions' })
      .getByRole('button', { name: 'Light' })
      .click();
    await sam.page.getByRole('menuitem', { name: 'Flarg lights a torch' }).click();
    for (const page of everyone) {
      await expect(
        page.getByRole('button', { name: /^Light: Flarg's torch, about \d+ turns left/ }),
      ).toBeVisible();
    }
    await expect(
      ann.page
        .getByRole('list', { name: 'Marching order' })
        .getByRole('listitem')
        .filter({ hasText: 'Flarg' }),
    ).toContainText(/Torch, about \d+ turns left/);
    await shot(ann.page, 'torch-lit');
  });

  await test.step('the party crosses the gate and walks the bridge to the counting room', async () => {
    await pinScene(sam.page);
    await openDoor(sam.page, 'east');
    for (let x = 5; x <= 12; x += 1) await stepParty(sam.page, 'ArrowRight', [x, 6]);
    await stepParty(sam.page, 'ArrowUp', [12, 5]);
    await openDoor(sam.page, 'north');
    await stepParty(sam.page, 'ArrowUp', [12, 4]);
    // A single monster reads without a count (R-523).
    for (const page of everyone) {
      await expect(
        encounterPanel(page).getByRole('heading', {
          name: 'The party meets an ink-stained clerk and a bandit',
        }),
      ).toBeVisible();
    }
    await expect(encounterPanel(sam.page)).not.toContainText('×1');
    await shot(sam.page, 'counting-room');
  });

  await test.step('the party fights in the counting room, and Mazpar puts the clerk to sleep', async () => {
    await encounterPanel(sam.page).getByRole('button', { name: 'Fight' }).click();
    await newRound(players);
    await closeIn(sam.page, 'Flarg', 'the bandit');
    await closeIn(sam.page, 'Clarence', 'the bandit');
    await closeIn(ann.page, 'Elfy', 'the bandit');
    await castSleep(ann.page, 'Mazpar', 'the ink-stained clerk');
    await newRound(players);
    await shot(sam.page, 'counting-room-round-2');
    for (const [page, name] of [
      [sam.page, 'Flarg'],
      [sam.page, 'Clarence'],
      [ann.page, 'Mazpar'],
      [ann.page, 'Elfy'],
    ] as const) {
      await attack(page, name, 'the ink-stained clerk');
    }
    await newRound(players);
    // One slain clerk reads in the singular (R-523).
    await expect(battleBoard(sam.page)).toContainText('The ink-stained clerk, slain');
    for (const [page, name] of [
      [sam.page, 'Flarg'],
      [sam.page, 'Clarence'],
      [ann.page, 'Mazpar'],
      [ann.page, 'Elfy'],
    ] as const) {
      await attack(page, name, 'the bandit');
    }
    for (const page of everyone) {
      await expect(battleBoard(page)).toHaveCount(0, { timeout: 30_000 });
      await expect(page.getByRole('banner').getByText('Exploring')).toBeVisible();
    }
    await shot(sam.page, 'counting-room-won');
  });

  await test.step('the party picks up what the clerk and the bandit dropped, and leaves the trapped strongbox', async () => {
    const scene = sam.page.getByRole('region', { name: 'Current location' });
    await scene.getByRole('button', { name: 'Pick up dropped goods' }).click();
    await expect(scene.getByRole('button', { name: 'Pick up dropped goods' })).toHaveCount(0);
    await shot(sam.page, 'counting-room-pickup');
  });

  await test.step('the party climbs to the captain’s loft, where the captain attacks at once', async () => {
    await sam.page
      .getByRole('toolbar', { name: 'Party actions' })
      .getByRole('button', { name: /^Climb the stairs/ })
      .click();
    for (const page of everyone) {
      await expect(battleBoard(page)).toBeVisible({ timeout: 30_000 });
    }
    // The torch gives the party away, so Mag Corrie isn't surprised, and her first blow kills Mazpar.
    await expect(declarationRow(ann.page, 'Mazpar')).toContainText('Dead');
    // The board names Mag Corrie and her bodyguard by their own labels (D-312).
    for (const label of ['Mag Corrie', "Mag's bodyguard"]) {
      await expect(battleBoard(sam.page)).toContainText(label);
    }
    await expect(battleBoard(sam.page)).not.toContainText(/veteran|berserker/i);
    await shot(ann.page, 'captains-loft');
  });

  await test.step('Elfy puts Mag Corrie to sleep, and the party beats her and her bodyguard', async () => {
    await newRound(players);
    await castSleep(ann.page, 'Elfy', 'Mag Corrie');
    await attack(sam.page, 'Flarg', "Mag's bodyguard");
    await attack(sam.page, 'Clarence', "Mag's bodyguard");
    await shot(sam.page, 'captains-loft-round-2');
    for (let round = 3; round <= 10; round += 1) {
      const fresh = battleBoard(sam.page).getByText(/(?<!\d)0 of \d declared/);
      await expect(
        fresh.or(sam.page.getByRole('banner').getByText('Exploring', { exact: true })),
      ).toBeVisible({
        timeout: 30_000,
      });
      if ((await battleBoard(sam.page).count()) === 0) break;
      await newRound(players);
      if (round === 3) await shot(ann.page, 'captains-loft-round-3');
      // The bodyguard is awake, so the party fights him first, then the sleeping captain.
      await attack(sam.page, 'Flarg', "Mag's bodyguard", 'Mag Corrie');
      await attack(sam.page, 'Clarence', "Mag's bodyguard", 'Mag Corrie');
      await attack(ann.page, 'Elfy', "Mag's bodyguard", 'Mag Corrie');
    }
    for (const page of everyone) await expect(battleBoard(page)).toHaveCount(0, { timeout: 30_000 });
    await shot(sam.page, 'captains-loft-won');
    await ann.page
      .getByRole('tablist', { name: 'Table panels' })
      .getByRole('tab', { name: 'Journal' })
      .click();
    await expect(ann.page.getByRole('tabpanel', { name: 'Journal' })).toContainText(/Mag Corrie/);
  });

  await test.step('the party takes the captain’s chest and finds the miller’s strongbox', async () => {
    const scene = sam.page.getByRole('region', { name: 'Current location' });
    await scene.getByRole('button', { name: 'Treasure', exact: true }).click();
    await sam.page.getByRole('menuitem', { name: 'Take treasure' }).click();
    await expect(await openFeed(ann.page)).toContainText("Miller Aske's strongbox", { timeout: 20_000 });
    const pickUp = scene.getByRole('button', { name: 'Pick up dropped goods' });
    if ((await pickUp.count()) > 0) await pickUp.click();
    await shot(sam.page, 'captains-loft-treasure');
  });

  await test.step('the party walks to the east gatehouse, the portcullis rises, and the table wins', async () => {
    await sam.page
      .getByRole('toolbar', { name: 'Party actions' })
      .getByRole('button', { name: /^Go down the stairs/ })
      .click();
    await expect(sam.page.getByText(/The party is at 12, 4, facing/)).toBeAttached({ timeout: 30_000 });
    await stepParty(sam.page, 'ArrowDown', [12, 5]);
    for (let x = 13; x <= 18; x += 1) await stepParty(sam.page, 'ArrowRight', [x, 5]);
    await stepParty(sam.page, 'ArrowDown', [18, 6]);
    await stepParty(sam.page, 'ArrowRight', [19, 6]);
    // The last step ends the game, so the map goes away. Press again only if the step didn't register.
    const won = sam.page.getByRole('heading', { name: 'Victory', level: 2 });
    for (let attempt = 0; attempt < 3 && !(await won.isVisible()); attempt += 1) {
      await sam.page.getByRole('application', { name: /^Dungeon map/ }).focus();
      await sam.page.keyboard.press('ArrowRight');
      await won.waitFor({ timeout: 3000 }).catch(() => undefined);
    }

    for (const page of everyone) {
      await expect(page.getByRole('heading', { name: 'Victory', level: 2 })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('list', { name: 'The party' }).getByRole('listitem')).toHaveCount(4);
      // The victory screen tells the ending in the adventure's own words (R-303).
      await expect(page.getByRole('main')).toContainText(
        'By evening the first carts are rolling over Crookback Bridge',
      );
      await expect(page.getByRole('main')).toContainText(/Quests completed\s*.*Open the Kingsway/);
      await expect(page.getByRole('main')).toContainText("Miller Aske's strongbox");
      await expect(page.getByRole('main')).toContainText(/Fallen\s*Mazpar/);
    }
    await expect(ann.page.getByText('The referee decides what comes next')).toBeVisible();
    await expect(ruth.page.getByRole('button', { name: /lobby/i }).first()).toBeVisible();
    await shot(sam.page, 'victory');
    await shot(ruth.page, 'victory-referee');
  });
});
