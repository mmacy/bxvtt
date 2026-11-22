/**
 * The whole-game smoke test: a referee and two players play The Toll at Crookback Bridge from table creation to
 * victory through the interface alone, as a group would. Nothing here calls the SDK.
 *
 * The ability rolls and the session use fixed seeds (added to the requests the interface sends), so every run
 * rolls the same dice. The route is the one a careful group takes: talk at the toll gate and let the referee
 * settle the toll, put the counting room to sleep, climb to the captain's loft and sleep the captain, then walk
 * into the east gatehouse to raise the portcullis. Tamsin dies in the captain's ambush on every run.
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
const ROLLS = { Brenna: 56, Osric: 34, Tamsin: 27, Wren: 9 } as const;
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
  await wizard.getByRole('button', { name: /^Fill with the .* kit$/ }).click();
  await expect(wizard.getByText('The shop and your class accept this outfit.')).toBeVisible({
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

/** Opens the door on one side of the party's cell from the scene panel. */
async function openDoor(page: Page, side: 'east' | 'south' | 'north' | 'west', mode = 'exploring') {
  const row = page
    .getByRole('region', { name: 'Where the party stands' })
    .getByRole('listitem')
    .filter({ hasText: `A door to the ${side}` });
  // D-020: the client drops a click silently while it paces commands, which happens on the fast production
  // build right after a run of moves. A player would click again, so the helper does too.
  await expect(async () => {
    await row.getByRole('button', { name: 'Door' }).click();
    await page.getByRole('menuitem', { name: 'Open it' }).click();
    await expect(row).toContainText(/open/, { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByRole('banner').getByText(new RegExp(mode, 'i'))).toBeVisible();
}

/** Opens one member's declaration choices on the battle board, unless the board already opened them. */
async function choicesFor(page: Page, name: string): Promise<Locator> {
  const composer = page.getByRole('region', { name: `Declare for ${name}` });
  // After a declaration, the board opens the next member's choices by itself, a moment later.
  await composer.waitFor({ timeout: 1500 }).catch(() => undefined);
  if ((await composer.count()) === 0) {
    await declarationRow(page, name)
      .getByRole('button', { name: /^(More choices|Change|Declare for)/ })
      .click();
  }
  await expect(composer).toBeVisible();
  return composer;
}

/** Declares a move toward a group, through the Move tab. */
async function closeIn(page: Page, name: string, group: string) {
  const composer = await choicesFor(page, name);
  await composer.getByRole('radio', { name: 'Move' }).click();
  await declaring(page, () =>
    composer.getByRole('button', { name: new RegExp(`^Close in on ${group}`) }).click(),
  );
}

/** Declares a melee attack on a group, through the Attack tab. */
async function attack(page: Page, name: string, group: string) {
  const composer = await choicesFor(page, name);
  await composer.getByRole('radio', { name: 'Attack' }).click();
  await declaring(page, () =>
    composer.getByRole('button', { name: new RegExp(`^Attack: ${group},`) }).click(),
  );
}

/** Declares *sleep* by Hit Dice at a group, through the Cast tab. */
async function castSleep(page: Page, name: string, group: string) {
  const composer = await choicesFor(page, name);
  await composer.getByRole('radio', { name: 'Cast' }).click();
  await composer
    .getByRole('radiogroup', { name: 'How to cast Sleep' })
    .getByRole('radio', { name: 'By Hit Dice' })
    .click();
  await declaring(page, () => composer.getByRole('button', { name: `Cast Sleep at ${group}` }).click());
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
  // Known defects that `combat.spec.ts` covers with `fixme` tests, allowed here so the whole game still runs:
  // D-310, the battle composer asks for a rules entry by monster family, which 404s for the captain's family.
  crew.allowIssues(/404 \(Not Found\) \(\/api\/rules\/monsters\//);
  // D-311, the referee's "They came to terms" dialog nests block elements inside a paragraph.
  crew.allowIssues(/cannot be a descendant of|cannot contain a nested/);
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
      await actor.page.getByRole('button', { name: 'Join the table' }).click();
      await expect(actor.page.getByRole('heading', { name: 'Crookback night', level: 1 })).toBeVisible();
    }
    await expect(ruth.page.getByText('3 of 3 online')).toBeVisible();
  });

  await test.step('each player creates two characters with the wizard', async () => {
    await createWithWizard(sam, { name: 'Brenna', className: /^Fighter/ });
    await createWithWizard(sam, { name: 'Osric', className: /^Cleric/ });
    await createWithWizard(ann, { name: 'Tamsin', className: /^Magic-User/, spell: /^Sleep Range/ });
    await createWithWizard(ann, { name: 'Wren', className: /^Elf/, spell: /^Sleep Range/ });
    const order = ruth.page.getByRole('list', { name: 'Party in marching order' }).getByRole('listitem');
    await expect(order).toHaveCount(4);
    for (const [index, name] of ['Brenna', 'Osric', 'Tamsin', 'Wren'].entries()) {
      await expect(order.nth(index)).toContainText(name);
    }
  });

  await test.step('the referee chooses the adventure and starts the game', async () => {
    await ruth.seedGameStart(SESSION_SEED);
    await ruth.page
      .getByRole('radiogroup', { name: 'Adventure' })
      .getByRole('radio', { name: /^The Toll at Crookback Bridge/ })
      .click();
    await ruth.page.getByRole('button', { name: 'Start the game' }).click();
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
    for (const name of ['Tamsin', 'Wren']) {
      await ann.page.getByRole('button', { name: `Open ${name}'s sheet` }).click();
      const sheet = ann.page.getByRole('dialog', { name });
      await sheet.getByRole('tab', { name: 'Spells' }).click();
      await sheet.getByRole('button', { name: 'Prepare spells' }).click();
      const prepare = ann.page.getByRole('dialog', { name: `Prepare ${name}'s spells` });
      await prepare.getByRole('button', { name: 'Increase Copies of Sleep' }).click();
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
      .getByRole('region', { name: 'The road out of town' })
      .getByRole('button', { name: 'Set out' })
      .click();
    const confirm = sam.page.getByRole('dialog', { name: 'Set out for Crookback Bridge?' });
    await expect(confirm).toContainText('The party carries a light, a tinder box, rations, and rope.');
    await confirm.getByRole('button', { name: 'Set out' }).click();
    for (const page of everyone) {
      await expect(
        page
          .getByRole('region', { name: 'Where the party stands' })
          .getByRole('heading', { name: 'The Kingsway' }),
      ).toBeVisible({ timeout: 30_000 });
    }
  });

  await test.step('at the toll gate, the caller talks and the referee settles the toll', async () => {
    await stepParty(sam.page, 'ArrowRight', [2, 6]);
    await stepParty(sam.page, 'ArrowRight', [3, 6]);
    for (const page of everyone) {
      await expect(
        encounterPanel(page).getByRole('heading', { name: 'The party meets 4 bandits' }),
      ).toBeVisible();
    }
    await shot(ann.page, 'toll-gate');
    await encounterPanel(sam.page).getByRole('button', { name: 'Talk' }).click();
    await sam.page
      .getByRole('dialog')
      .filter({ hasText: 'Who speaks for the party?' })
      .getByRole('button')
      .first()
      .click();
    await expect(await openFeed(sam.page)).toContainText('Talk to the monsters');

    const tools = encounterPanel(ruth.page);
    await tools.getByText('Monsters and referee tools').click();
    await tools.getByRole('button', { name: 'They came to terms' }).click();
    const settle = ruth.page.getByRole('alertdialog', { name: 'The monsters and the party came to terms' });
    await settle.getByRole('checkbox', { name: "Keep this area's monsters peaceful" }).click();
    await settle.getByRole('button', { name: 'End the encounter' }).click();
    for (const page of everyone) await expect(encounterPanel(page)).toHaveCount(0);
  });

  await test.step('the party crosses the gate and walks the bridge to the counting room', async () => {
    await stepParty(sam.page, 'ArrowRight', [4, 6]);
    await stepParty(sam.page, 'ArrowRight', [5, 6]);
    await openDoor(sam.page, 'east');
    for (let x = 6; x <= 12; x += 1) await stepParty(sam.page, 'ArrowRight', [x, 6]);
    await stepParty(sam.page, 'ArrowUp', [12, 5]);
    await openDoor(sam.page, 'north');
    await stepParty(sam.page, 'ArrowUp', [12, 4]);
    for (const page of everyone) {
      await expect(encounterPanel(page).getByRole('heading', { name: /^The party meets/ })).toBeVisible();
    }
  });

  await test.step('the party fights in the counting room, and Tamsin puts the medium to sleep', async () => {
    await encounterPanel(sam.page).getByRole('button', { name: 'Fight' }).click();
    await newRound(players);
    await closeIn(sam.page, 'Brenna', 'Bandit');
    await closeIn(sam.page, 'Osric', 'Bandit');
    await closeIn(ann.page, 'Wren', 'Bandit');
    await castSleep(ann.page, 'Tamsin', 'Medium');
    await newRound(players);
    await shot(sam.page, 'counting-room-round-2');
    for (const [page, name] of [
      [sam.page, 'Brenna'],
      [sam.page, 'Osric'],
      [ann.page, 'Tamsin'],
      [ann.page, 'Wren'],
    ] as const) {
      await attack(page, name, 'Medium');
    }
    await newRound(players);
    for (const [page, name] of [
      [sam.page, 'Brenna'],
      [sam.page, 'Osric'],
      [ann.page, 'Tamsin'],
      [ann.page, 'Wren'],
    ] as const) {
      await attack(page, name, 'Bandit');
    }
    for (const page of everyone) {
      await expect(battleBoard(page)).toHaveCount(0, { timeout: 30_000 });
      await expect(page.getByRole('banner').getByText('Exploring')).toBeVisible();
    }
  });

  await test.step('the party climbs to the captain’s loft, where the captain ambushes it', async () => {
    await stepParty(sam.page, 'ArrowUp', [12, 3]);
    await stepParty(sam.page, 'ArrowUp', [12, 2]);
    await stepParty(sam.page, 'ArrowLeft', [11, 2]);
    await sam.page
      .getByRole('toolbar', { name: 'Party actions' })
      .getByRole('button', { name: /^Climb the stairs/ })
      .click();
    for (const page of everyone) {
      await expect(battleBoard(page)).toBeVisible({ timeout: 30_000 });
    }
    // The captain's first blow kills Tamsin before anyone can act.
    await expect(declarationRow(ann.page, 'Tamsin')).toContainText(/Down|Dead/i);
    await shot(ann.page, 'captains-loft');
  });

  await test.step('Wren puts Mag Corrie to sleep, and the party beats her and her bodyguard', async () => {
    await newRound(players);
    await castSleep(ann.page, 'Wren', 'Veteran');
    await attack(sam.page, 'Brenna', 'Berserker');
    await attack(sam.page, 'Osric', 'Berserker');
    await newRound(players);
    await attack(sam.page, 'Brenna', 'Veteran');
    await attack(sam.page, 'Osric', 'Veteran');
    await attack(ann.page, 'Wren', 'Veteran');
    for (const page of everyone) await expect(battleBoard(page)).toHaveCount(0, { timeout: 30_000 });
    await ann.page
      .getByRole('tablist', { name: 'Table panels' })
      .getByRole('tab', { name: 'Journal' })
      .click();
    await expect(ann.page.getByRole('tabpanel', { name: 'Journal' })).toContainText(/Mag Corrie/);
  });

  await test.step('the party walks to the east gatehouse, the portcullis rises, and the table wins', async () => {
    await sam.page
      .getByRole('toolbar', { name: 'Party actions' })
      .getByRole('button', { name: /^Go down the stairs/ })
      .click();
    await expect(sam.page.getByText(/The party is at 11, 2, facing/)).toBeAttached({ timeout: 30_000 });
    await stepParty(sam.page, 'ArrowRight', [12, 2]);
    await stepParty(sam.page, 'ArrowDown', [12, 3]);
    await stepParty(sam.page, 'ArrowDown', [12, 4]);
    await openDoor(sam.page, 'south');
    await stepParty(sam.page, 'ArrowDown', [12, 5]);
    for (let x = 13; x <= 18; x += 1) await stepParty(sam.page, 'ArrowRight', [x, 5]);
    await stepParty(sam.page, 'ArrowDown', [18, 6]);
    await stepParty(sam.page, 'ArrowRight', [19, 6]);
    // The last step ends the game, so the map goes away. Press again only if the step didn't register.
    const won = sam.page.getByRole('heading', { name: 'Victory', level: 1 });
    for (let attempt = 0; attempt < 3 && !(await won.isVisible()); attempt += 1) {
      await sam.page.getByRole('application', { name: /^Dungeon map/ }).focus();
      await sam.page.keyboard.press('ArrowRight');
      await won.waitFor({ timeout: 3000 }).catch(() => undefined);
    }

    for (const page of everyone) {
      await expect(page.getByRole('heading', { name: 'Victory', level: 1 })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('list', { name: 'The party' }).getByRole('listitem')).toHaveCount(4);
    }
    await expect(ann.page.getByText('The referee decides what comes next')).toBeVisible();
    await expect(ruth.page.getByRole('button', { name: /lobby/i }).first()).toBeVisible();
    await shot(sam.page, 'victory');
  });
});
