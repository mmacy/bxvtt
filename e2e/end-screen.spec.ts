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
import { expectSiteInfo } from './support/site-info';
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
      { owner: sam, name: 'Flarg', classId: 'fighter' },
      { owner: sam, name: 'Mazpar', classId: 'magic_user' },
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
    await expectSiteInfo(page);
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

  await ruth.page
    .getByRole('region', { name: 'Continue from a save' })
    .getByRole('button', { name: 'Restore On the Kingsway' })
    .click();
  const confirm = ruth.page.getByRole('alertdialog', { name: 'Restore On the Kingsway?' });
  await confirm.getByRole('button', { name: 'Restore save' }).click();
  for (const actor of [ruth, sam]) {
    await expect(actor.page.getByRole('heading', { name: 'Victory' })).toHaveCount(0, { timeout: 20_000 });
    await expect(actor.page.getByRole('banner').getByText('Exploring', { exact: true })).toBeVisible();
    await expect(actor.page.getByRole('application', { name: /^Dungeon map/ })).toBeVisible();
  }
});

test('after a total party kill, the end screen names the fallen and the referee restores the autosave from when the party met the goblins', async ({
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
    await expect(await fact(page, 'Fallen')).toHaveText('Flarg and Mazpar');
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

  // Walking into the guardroom meets the goblins, which autosaves as a meeting. "Before the battle" is only for a
  // battle that opens straight from exploring, which this one doesn't.
  const saves = endSaves(ruth.page);
  const met = "Autosave: Met 2 goblins in the priory on Corvane's Holm, level 1";
  await expect(saves.filter({ hasText: met })).toHaveCount(1);
  await expect(saves.filter({ hasText: /Before the battle/ })).toHaveCount(0);
  await expect(saves.filter({ hasText: /^Autosave: Entered the priory/ })).toHaveCount(1);
  await shot(ruth.page, 'party-fallen-referee');

  // Each restore button names its save (R-301), and the confirmation shows the label as written (R-302).
  await ruth.page
    .getByRole('region', { name: 'Continue from a save' })
    .getByRole('button', { name: `Restore ${met}` })
    .click();
  await ruth.page
    .getByRole('alertdialog', { name: `Restore ${met}?` })
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

// R-303: the victory screen tells the ending in the adventure's own words.
test('after a victory, the end screen tells how the adventure ends in its own words', async ({ crew }) => {
  const ruth = await crew.person('Ruth');
  const sam = await crew.person('Sam');
  const setup = await setupTable({
    referee: ruth,
    players: [sam],
    party: [{ owner: sam, name: 'Flarg', classId: 'fighter' }],
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

// R-301: each save row's button names its save. R-302: the confirmation shows the save's label as written.
test('the end screen names each save in its restore button and its confirmation as written', async ({
  crew,
}) => {
  const ruth = await crew.person('Ruth');
  const sam = await crew.person('Sam');
  const setup = await setupTable({
    referee: ruth,
    players: [sam],
    party: [{ owner: sam, name: 'Flarg', classId: 'fighter' }],
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

// R-528: the end screen counted every quest in the table's feed, including the previous adventure's.
test('a victory in the table’s second adventure counts only that game’s quests', async ({ crew }) => {
  const ruth = await crew.person('Ruth');
  const sam = await crew.person('Sam');
  const setup = await setupTable({
    referee: ruth,
    players: [sam],
    party: [{ owner: sam, name: 'Flarg', classId: 'fighter' }],
    adventure: ADVENTURES.toll,
  });
  const tableId = setup.table.id;
  await enterDungeon(sam.client, tableId, 'bridge');
  await send(ruth.client, tableId, { command_type: 'complete_quest', quest_id: 'open_the_kingsway' });
  await waitForGame(ruth.client, tableId, (game) => game.mode === 'victory', 'the victory');

  // The referee returns the table to its lobby, and the confirmation says what that does to the characters.
  await openTable(ruth.page, setup.path);
  await ruth.page.getByRole('button', { name: 'Return to lobby' }).click();
  const back = ruth.page.getByRole('alertdialog', { name: 'Return to lobby?' });
  await expect(back).toContainText('A new game starts the characters from their first sheets');
  await back.getByRole('button', { name: 'Return to lobby' }).click();
  await expect(ruth.page.getByRole('heading', { name: 'Victory' })).toHaveCount(0);

  await ruth.client.startGame(tableId, { adventure_id: ADVENTURES.bell, seed: 1981 });
  await enterDungeon(sam.client, tableId, 'priory');
  await send(ruth.client, tableId, { command_type: 'complete_quest', quest_id: 'silence_the_bell' });
  await openTable(sam.page, setup.path);
  await expect(sam.page.getByRole('heading', { name: 'Victory', level: 2 })).toBeVisible();
  await expect(sam.page.getByRole('main')).toContainText('The Drowned Bell');
  await expect(await fact(sam.page, 'Quests completed')).toHaveText('Silence the drowned bell');
});

// R-529: after a total party kill, the referee could complete the quest that ends the adventure without a word.
test('after a total party kill, a referee command that changes the story asks first', async ({ crew }) => {
  const table = await combatTable(crew, { party: 'weak' });
  const { sam, ruth, tableId } = table;
  await walkIntoGuardroom(sam.client, tableId);
  await send(sam.client, tableId, { command_type: 'engage_battle' });
  expect((await fightThroughSdk(table)).mode).toBe('game_over');
  await openTable(ruth.page, table.path);
  await ruth.page
    .getByRole('tablist', { name: 'Table panels' })
    .getByRole('tab', { name: 'Referee' })
    .click();
  await ruth.page.getByRole('tab', { name: 'Quests, flags, and triggers' }).click();
  await ruth.page.getByRole('button', { name: 'Complete quest' }).first().click();
  const guard = ruth.page.getByRole('alertdialog', { name: 'The game is over' });
  await expect(guard).toContainText('The party has fallen, so the game is over.');
  await expect(guard).toContainText('Restore a save to continue playing.');
  await shot(ruth.page, 'story-guard');
  await guard.getByRole('button', { name: 'Cancel' }).click();
  await expect(guard).toHaveCount(0);
  // Nothing changed: the end screen still lists no quests.
  await expect(await fact(ruth.page, 'Quests completed')).toHaveText('None');
});
