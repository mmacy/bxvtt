/**
 * Referee tools: the lens switch, the key that follows the party, the quick actions (items, coins, monsters,
 * placing the party, doors, ending an encounter), a generator, the full command console, saves, and seats and the
 * caller. Each test has a referee (Ruth) and a player (Sam) in their own browsers.
 */
import type { Page } from '@playwright/test';
import { expect, test, type Actor, type Crew } from './support/fixtures';
import {
  choose,
  clickMapOffset,
  openFromTableMenu,
  openQuickAction,
  openRefereeSection,
  screenshot,
  search,
} from './support/referee';
import {
  enterDungeon,
  openTable,
  placeParty,
  setupTable,
  waitForGame,
  type SetupResult,
} from './support/table';

interface Table extends SetupResult {
  ruth: Actor;
  sam: Actor;
  tableId: string;
}

/** Ruth referees and plays Osric, and Sam plays Brenna and Wren, in The Drowned Bell's first room. */
async function bellTable(crew: Crew): Promise<Table> {
  const ruth = await crew.person('Ruth');
  const sam = await crew.person('Sam');
  const setup = await setupTable({
    referee: ruth,
    players: [sam],
    party: [
      { owner: sam, name: 'Brenna', classId: 'fighter' },
      { owner: sam, name: 'Wren', classId: 'thief' },
      { owner: ruth, name: 'Osric', classId: 'cleric' },
    ],
  });
  const tableId = setup.table.id;
  await enterDungeon(sam.client, tableId, 'priory');
  await openTable(ruth.page, setup.path);
  await openTable(sam.page, setup.path);
  return { ...setup, ruth, sam, tableId };
}

/** Brenna's gold: the first party member's purse, from a player view's party. */
function brennaGold(party: { inventory: Record<string, unknown> }[]): number {
  const purse = party[0]?.inventory.purse as { gp?: number } | undefined;
  return purse?.gp ?? 0;
}

/** The mode badge in the top bar, such as "Exploring". */
function modeBadge(page: Page, mode: string) {
  return page.getByRole('banner').getByText(mode, { exact: true });
}

test.describe('referee tools', () => {
  test('the lens switch hides the referee tools, and the key follows the party', async ({ crew }) => {
    const { ruth, sam, tableId } = await bellTable(crew);
    const now = await openRefereeSection(ruth.page, 'now');
    await expect(now).toContainText('A flight of worn steps');
    await screenshot(ruth.page, 'referee-now');
    const dock = ruth.page.getByRole('tabpanel', { name: 'Referee' });
    await expect(dock).toContainText('Gatehouse stair');
    await expect(ruth.page.getByText('Referee map')).toBeVisible();
    // A player has no referee tab and no referee map.
    await expect(sam.page.getByRole('tab', { name: 'Referee', exact: true })).toHaveCount(0);
    await expect(sam.page.getByText('Referee map')).toHaveCount(0);

    // The party walks to the chapter house, and the key turns to it without a click.
    await placeParty(ruth.client, tableId, { dungeon: 'priory', level: 1, x: 12, y: 12 });
    await expect(dock).toContainText('Chapter house');
    await expect(now).toContainText('An eight-sided hall');
    const key = await openRefereeSection(ruth.page, 'key');
    await expect(key.getByRole('heading', { name: /^Chapter house.*Party/ })).toBeVisible();
    await screenshot(ruth.page, 'referee-key');
    await openRefereeSection(ruth.page, 'story');
    await screenshot(ruth.page, 'referee-story');
    await openRefereeSection(ruth.page, 'log');
    await screenshot(ruth.page, 'referee-log');

    // With the lens off, the referee sees what the players see.
    const lens = ruth.page.getByRole('switch', { name: 'Referee lens' });
    await lens.click();
    await expect(lens).not.toBeChecked();
    await expect(ruth.page.getByRole('tab', { name: 'Referee', exact: true })).toHaveCount(0);
    await expect(ruth.page.getByText('Referee map')).toHaveCount(0);
    // The lens is a display preference, so it survives a reload.
    await ruth.page.reload();
    await expect(ruth.page.getByRole('switch', { name: 'Referee lens' })).not.toBeChecked();
    await ruth.page.getByRole('switch', { name: 'Referee lens' }).click();
    await expect(ruth.page.getByRole('tab', { name: 'Referee', exact: true })).toBeVisible();
  });

  test('the referee gives an item and coins, and the player sees them', async ({ crew }) => {
    const { ruth, sam, tableId } = await bellTable(crew);
    const before = await sam.client.getGame(tableId);
    const goldBefore = brennaGold(before.view.party);

    const items = await openQuickAction(ruth.page, 'Give or take an item');
    await choose(ruth.page, items.getByRole('combobox', { name: 'Receiver' }), 'Brenna');
    await search(ruth.page, items.getByRole('combobox', { name: 'Item' }), 'rope', /^Rope/);
    await items.getByRole('button', { name: 'Grant item' }).click();
    await expect
      .poll(async () => JSON.stringify((await sam.client.getGame(tableId)).view.party[0]?.inventory))
      .toContain('rope');

    const coins = await openQuickAction(ruth.page, 'Give or take coins');
    await choose(ruth.page, coins.getByRole('combobox', { name: 'Receiver' }), 'Brenna');
    await coins.getByRole('spinbutton', { name: 'Gold pieces' }).fill('25');
    await coins.getByRole('button', { name: 'Grant coins' }).click();
    await expect
      .poll(async () => brennaGold((await sam.client.getGame(tableId)).view.party))
      .toBe(goldBefore + 25);

    // Sam reads both on Brenna's sheet.
    await sam.page.getByRole('button', { name: /^Brenna, level 1 fighter/ }).click();
    const sheet = sam.page.getByRole('dialog', { name: /Brenna/ });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('tab', { name: 'Inventory' }).click();
    await expect(sheet.getByRole('tabpanel', { name: 'Inventory' }).getByText(/rope/i).first()).toBeVisible();
  });

  test('the referee spawns monsters, and ends the encounter by coming to terms', async ({ crew }) => {
    const { ruth, sam, tableId } = await bellTable(crew);
    const spawn = await openQuickAction(ruth.page, 'Spawn monsters');
    await search(ruth.page, spawn.getByRole('combobox', { name: 'Monster' }), 'goblin', /^Goblin/);
    await spawn.getByRole('radio', { name: 'Exactly' }).click();
    await spawn.getByRole('spinbutton', { name: 'How many monsters' }).fill('2');
    await spawn.getByRole('button', { name: '120 feet' }).click();
    await spawn.getByRole('button', { name: 'Spawn', exact: true }).click();
    // Goblins may talk or charge, so the table meets them in an encounter or a battle.
    await expect(modeBadge(sam.page, 'Encounter').or(modeBadge(sam.page, 'Battle'))).toBeVisible();
    await expect(modeBadge(ruth.page, 'Encounter').or(modeBadge(ruth.page, 'Battle'))).toBeVisible();
    await expect
      .poll(async () => (await sam.client.getGame(tableId)).view.encounter?.groups.length ?? 0)
      .toBe(1);

    const end = await openQuickAction(ruth.page, 'End the encounter');
    await end.getByRole('radio', { name: 'The monsters and the party came to terms' }).click();
    await end.getByRole('button', { name: 'End the encounter' }).click();
    await expect(modeBadge(sam.page, 'Exploring')).toBeVisible();
    await expect(modeBadge(ruth.page, 'Exploring')).toBeVisible();
  });

  test('the referee places the party by picking a cell, and changes a door', async ({ crew }) => {
    const { ruth, sam, tableId } = await bellTable(crew);
    const place = await openQuickAction(ruth.page, 'Place the party');
    await place.getByRole('radio', { name: 'A cell' }).click();
    await place.getByRole('button', { name: 'Pick a cell on the map' }).click();
    await expect(ruth.page.getByText('Click the cell to place the party on.')).toBeVisible();
    // Two cells north of the party, still in the gatehouse stair.
    await clickMapOffset(ruth.page, 0, -2);
    const picked = place.getByText(/^Level 1, cell \d+, \d+$/);
    await expect(picked).toBeVisible();
    const [, x, y] = /cell (\d+), (\d+)/.exec((await picked.textContent()) ?? '') ?? [];
    await place.getByRole('button', { name: 'Place the party' }).click();
    const moved = await waitForGame(
      sam.client,
      tableId,
      (game) =>
        game.view.location?.kind === 'dungeon' &&
        game.view.location.position?.[0] === Number(x) &&
        game.view.location.position?.[1] === Number(y),
      'the party should stand on the picked cell',
    );
    expect(moved.mode).toBe('exploring');
    await expect(sam.page.getByText(`The party is at ${x}, ${y}`)).toBeAttached();

    // The stuck door between the cloister walk and the chapter house, entered by its cell and side.
    await screenshot(ruth.page, 'referee-place-party');
    const door = await openQuickAction(ruth.page, 'Change a door');
    await choose(ruth.page, door.getByRole('combobox', { name: 'Dungeon' }), /priory/);
    await door.getByRole('spinbutton', { name: 'Level' }).fill('1');
    await door.getByRole('spinbutton', { name: 'Column' }).fill('12');
    await door.getByRole('spinbutton', { name: 'Row' }).fill('9');
    await choose(ruth.page, door.getByRole('combobox', { name: 'Side of the cell' }), 'South');
    await door.getByRole('radiogroup', { name: 'Open' }).getByRole('radio', { name: 'Yes' }).click();
    await door.getByRole('button', { name: 'Set door' }).click();
    await expect
      .poll(async () => JSON.stringify((await ruth.client.getRefereeState(tableId)).dungeon_state.doors))
      .toMatch(/"priory:1:(12,9:south|12,10:north)":\{"open":true/);
  });

  test('the referee rolls on a generator and sends a command from the full console', async ({ crew }) => {
    const { ruth, sam } = await bellTable(crew);
    const tables = await openRefereeSection(ruth.page, 'tables');
    await tables
      .getByRole('radio', { name: 'Treasure' })
      .or(tables.getByRole('button', { name: 'Treasure', exact: true }))
      .click();
    await tables.getByRole('button', { name: 'Roll treasure' }).click();
    await expect(tables.getByText(/^Seed \d+$/)).toBeVisible();
    await screenshot(ruth.page, 'referee-generator');

    const console = await openRefereeSection(ruth.page, 'commands');
    await console.getByRole('searchbox', { name: 'Search commands' }).fill('note');
    await console.getByRole('button', { name: /^Record a note/ }).click();
    const form = console.getByRole('form', { name: 'Record a note' });
    await form.getByRole('textbox').first().fill('The goblins owe the kobolds three eels.');
    await form.getByRole('button', { name: /Record/ }).click();
    const log = await openRefereeSection(ruth.page, 'log');
    await expect(log.getByText(/three eels/)).toBeVisible();
    // A note behind the screen never reaches the player's feed.
    await sam.page.getByRole('tab', { name: /^Feed/ }).click();
    await expect(sam.page.getByRole('region', { name: 'Feed entries' })).not.toContainText('three eels');
  });

  test('the referee creates, renames, exports, and restores a save', async ({ crew }) => {
    const { ruth, sam, tableId } = await bellTable(crew);
    const saves = await openFromTableMenu(ruth.page, 'Saves');
    await saves.getByRole('textbox', { name: 'Save the game now' }).fill('At the gatehouse');
    await saves.getByRole('button', { name: 'Save', exact: true }).click();
    const list = saves.getByRole('list', { name: 'Saves, newest first' });
    const row = list.getByRole('listitem').filter({ hasText: 'At the gatehouse' });
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'More for At the gatehouse' }).click();
    await ruth.page.getByRole('menuitem', { name: 'Rename' }).click();
    await list.getByRole('textbox', { name: 'Save name' }).fill('Before the guardroom');
    await list.getByRole('button', { name: 'Rename' }).click();
    const renamed = list.getByRole('listitem').filter({ hasText: 'Before the guardroom' });
    await expect(renamed).toBeVisible();
    await screenshot(ruth.page, 'referee-saves');
    await expect
      .poll(async () => (await sam.client.listSaves(tableId)).items.map((s) => s.label))
      .toContain('Before the guardroom');

    const download = ruth.page.waitForEvent('download');
    await renamed.getByRole('button', { name: 'More for Before the guardroom' }).click();
    await ruth.page.getByRole('menuitem', { name: 'Export as a file' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.json$/);

    // The party moves on, and the referee takes the table back to the save.
    await ruth.page.keyboard.press('Escape');
    await placeParty(ruth.client, tableId, { dungeon: 'priory', level: 1, x: 12, y: 12 });
    await expect(sam.page.getByText('The party is at 12, 12')).toBeAttached();
    const again = await openFromTableMenu(ruth.page, 'Saves');
    await again
      .getByRole('listitem')
      .filter({ hasText: 'Before the guardroom' })
      .getByRole('button', { name: 'Restore' })
      .click();
    const confirm = ruth.page.getByRole('alertdialog', { name: /Restore/ });
    await confirm.getByRole('button', { name: 'Restore' }).click();
    await expect(confirm).toHaveCount(0);
    await waitForGame(
      sam.client,
      tableId,
      (game) => game.view.location?.kind === 'dungeon' && game.view.location.position?.[1] === 23,
      'the restored game should put the party back on the gatehouse stair',
    );
    // Sam's open page follows the table to the restored game.
    await expect(sam.page.getByText('The party is at 14, 23')).toBeAttached();
    await expect(sam.page.getByRole('region', { name: 'Where the party stands' })).toContainText(
      'Gatehouse stair',
    );
  });

  test('a seat and the caller change for the player at once', async ({ crew }) => {
    const { ruth, sam } = await bellTable(crew);
    await expect(sam.page.getByText('You are the caller')).toBeVisible();
    const actions = sam.page.getByRole('toolbar', { name: 'Party actions' });
    await expect(actions.getByRole('button', { name: 'Search' })).toBeEnabled();

    const seats = await openFromTableMenu(ruth.page, 'Seats and caller');
    await choose(ruth.page, seats.getByRole('combobox', { name: 'Who plays Wren' }), /^Ruth/);
    await choose(ruth.page, seats.getByRole('combobox', { name: 'Caller' }), 'Ruth');
    await screenshot(ruth.page, 'referee-seats');

    // Sam's screen changes without a reload: Ruth calls, and Wren is hers.
    await expect(sam.page.getByText('Ruth is the caller').first()).toBeVisible();
    await expect(actions.getByRole('button', { name: 'Search' })).toBeDisabled();
    const order = sam.page.getByRole('list', { name: 'Marching order' });
    await expect(order.getByRole('listitem').filter({ hasText: 'Wren' })).toContainText('Ruth');
    await expect(order.getByRole('listitem').filter({ hasText: 'Brenna' })).toContainText('You');
  });
});
