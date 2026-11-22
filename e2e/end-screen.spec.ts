/**
 * The end screen: after a victory and after a total party kill, it tells the game's story (how it ended, the game
 * time, who fell, and the quests completed), lists the table's saves for the referee, and lets the referee restore
 * one, which takes every page back into play.
 */
import type { Locator, Page } from '@playwright/test';
import { describeViolations, seriousViolations } from './support/a11y';
import { expect, test } from './support/fixtures';
import { combatTable, fightThroughSdk, openFeed, walkIntoGuardroom } from './support/combat';
import { SCREENS_DIR } from './support/env';
import { ADVENTURES, enterDungeon, openTable, send, setupTable, waitForGame } from './support/table';

const shot = (page: Page, name: string) => page.screenshot({ path: `${SCREENS_DIR}/end-${name}.png` });

/**
 * One of the end screen's facts, such as "Fallen": the definition at the same place in the list as its term. The
 * end screen lists its facts as terms and definitions, in pairs.
 */
async function fact(page: Page, term: string): Promise<Locator> {
  const main = page.getByRole('main');
  await expect(main.getByRole('term').filter({ hasText: term })).toBeVisible();
  const terms = (await main.getByRole('term').allTextContents()).map((text) => text.trim());
  return main.getByRole('definition').nth(terms.indexOf(term));
}

/** The referee's list of saves on the end screen. */
function endSaves(page: Page) {
  return page.getByRole('region', { name: 'Continue from a save' }).getByRole('listitem');
}

test('after a victory, the end screen tells the story and the referee restores a save', async ({ crew }) => {
  const ruth = await crew.person('Ruth');
  const sam = await crew.person('Sam');
  const setup = await setupTable({
    name: 'Crookback night',
    referee: ruth,
    players: [sam],
    party: [
      { owner: sam, name: 'Brenna', classId: 'fighter' },
      { owner: sam, name: 'Tamsin', classId: 'magic_user' },
    ],
    adventure: ADVENTURES.toll,
  });
  const tableId = setup.table.id;
  // Entering the bridge autosaves. The referee then saves by hand, and completes the quest that ends the game.
  await enterDungeon(sam.client, tableId, 'bridge');
  await ruth.client.createSave(tableId, 'On the Kingsway');
  await send(ruth.client, tableId, { command_type: 'complete_quest', quest_id: 'open_the_kingsway' });
  await waitForGame(ruth.client, tableId, (game) => game.mode === 'victory', 'the victory');
  for (const actor of [ruth, sam]) await openTable(actor.page, setup.path);

  for (const actor of [ruth, sam]) {
    const { page } = actor;
    await expect(page.getByRole('heading', { name: 'Victory', level: 2 })).toBeVisible();
    await expect(page.getByRole('main')).toContainText('The Toll at Crookback Bridge');
    await expect(await fact(page, 'Game time')).toContainText(/ending at Day \d+, \d\d:\d\d/);
    await expect(await fact(page, 'Fallen')).toHaveText('Nobody');
    await expect(await fact(page, 'Quests completed')).toHaveText('Open the Kingsway');
    await expect(page.getByRole('list', { name: 'The party' }).getByRole('listitem')).toHaveCount(2);
  }
  await expect(sam.page.getByText('The referee decides what comes next')).toBeVisible();
  await expect(sam.page.getByRole('region', { name: 'Continue from a save' })).toHaveCount(0);

  // The referee sees the newest saves, the hand-made one first.
  const saves = endSaves(ruth.page);
  await expect(saves.first()).toContainText('On the Kingsway');
  await expect(saves.filter({ hasText: 'Autosave: Entered Crookback Bridge' })).toHaveCount(1);
  await shot(ruth.page, 'victory-referee');
  await shot(sam.page, 'victory-player');

  // Every row's button is named only "Restore" (R-301), so find it by its row. The confirmation's title lowercases
  // the save's label (R-302), so its match ignores case.
  await saves
    .filter({ hasText: 'On the Kingsway' })
    .getByRole('button', { name: /^Restore/ })
    .click();
  const confirm = ruth.page.getByRole('alertdialog', { name: /^Restore on the Kingsway\?$/i });
  await confirm.getByRole('button', { name: 'Restore save' }).click();
  for (const actor of [ruth, sam]) {
    await expect(actor.page.getByRole('heading', { name: 'Victory' })).toHaveCount(0, { timeout: 20_000 });
    await expect(actor.page.getByRole('banner').getByText('Exploring', { exact: true })).toBeVisible();
    await expect(actor.page.getByRole('application', { name: /^Dungeon map/ })).toBeVisible();
  }
});

test('after a total party kill, the end screen names the fallen and the referee restores the autosave before the battle', async ({
  crew,
}, testInfo) => {
  const table = await combatTable(crew, { party: 'weak' });
  const { sam, ann, ruth, tableId } = table;
  await walkIntoGuardroom(sam.client, tableId);
  await send(sam.client, tableId, { command_type: 'engage_battle' });
  const game = await fightThroughSdk(table);
  expect(game.mode).toBe('game_over');
  for (const actor of [ruth, sam, ann]) await openTable(actor.page, table.path);

  for (const actor of [ruth, sam, ann]) {
    const { page } = actor;
    await expect(page.getByRole('heading', { name: 'The party has fallen', level: 2 })).toBeVisible();
    await expect(page.getByRole('main')).toContainText('Every party member has fallen');
    await expect(await fact(page, 'Fallen')).toHaveText('Brenna and Tamsin');
    await expect(await fact(page, 'Quests completed')).toHaveText('None');
    const party = page.getByRole('list', { name: 'The party' }).getByRole('listitem');
    await expect(party).toHaveCount(2);
    for (const member of await party.all()) await expect(member).toContainText('Dead');
  }
  // The red "Dead" badges reach the contrast ratio (D-010).
  for (const actor of [ruth, ann]) {
    const violations = await seriousViolations(actor.page, testInfo, `end-screen-${actor.name}`, 'main');
    expect(describeViolations(violations)).toEqual([]);
  }

  const saves = endSaves(ruth.page);
  const beforeBattle = saves.filter({ hasText: /^Autosave: Before the battle/ });
  await expect(beforeBattle).toHaveCount(1);
  await expect(saves.filter({ hasText: 'Autosave: Entered the priory' })).toHaveCount(1);
  await shot(ruth.page, 'party-fallen-referee');

  await beforeBattle.getByRole('button', { name: /^Restore/ }).click();
  await ruth.page
    .getByRole('alertdialog', { name: /^Restore autosave: before the battle/i })
    .getByRole('button', { name: 'Restore save' })
    .click();
  // The saved game is the moment the goblins appeared, so every page is back at the encounter.
  for (const actor of [ruth, sam, ann]) {
    await expect(actor.page.getByRole('heading', { name: 'The party has fallen' })).toHaveCount(0, {
      timeout: 20_000,
    });
    await expect(actor.page.getByRole('banner').getByText(/^(Encounter|Battle)$/)).toBeVisible();
  }
  const restored = await ruth.client.getGame(tableId);
  expect(restored.view.party.every((member) => member.current_hp > 0)).toBe(true);
});

// R-303: the end screen states that the party finished the adventure, but not the adventure's closing text.
test.fixme('after a victory, the end screen tells how the adventure ends in its own words', async ({
  crew,
}) => {
  const ruth = await crew.person('Ruth');
  const sam = await crew.person('Sam');
  const setup = await setupTable({
    referee: ruth,
    players: [sam],
    party: [{ owner: sam, name: 'Brenna', classId: 'fighter' }],
    adventure: ADVENTURES.toll,
  });
  const tableId = setup.table.id;
  await enterDungeon(sam.client, tableId, 'bridge');
  await send(ruth.client, tableId, { command_type: 'complete_quest', quest_id: 'open_the_kingsway' });
  await openTable(sam.page, setup.path);
  await expect(sam.page.getByRole('heading', { name: 'Victory', level: 2 })).toBeVisible();
  const closing = 'By evening the first carts are rolling over Crookback Bridge';
  // The feed has the closing text, from the quest's completion.
  await expect(await openFeed(sam.page)).toContainText(closing);
  await expect(sam.page.getByRole('main')).toContainText(closing);
});

// R-301: every save row's button is named "Restore". R-302: the confirmation lowercases the save's label.
test.fixme('the end screen names each save in its restore button and its confirmation as written', async ({
  crew,
}) => {
  const ruth = await crew.person('Ruth');
  const sam = await crew.person('Sam');
  const setup = await setupTable({
    referee: ruth,
    players: [sam],
    party: [{ owner: sam, name: 'Brenna', classId: 'fighter' }],
    adventure: ADVENTURES.toll,
  });
  const tableId = setup.table.id;
  await enterDungeon(sam.client, tableId, 'bridge');
  await send(ruth.client, tableId, { command_type: 'complete_quest', quest_id: 'open_the_kingsway' });
  await openTable(ruth.page, setup.path);
  const region = ruth.page.getByRole('region', { name: 'Continue from a save' });
  await region.getByRole('button', { name: 'Restore Autosave: Entered Crookback Bridge' }).click();
  await expect(
    ruth.page.getByRole('alertdialog', { name: 'Restore Autosave: Entered Crookback Bridge?' }),
  ).toBeVisible();
});
