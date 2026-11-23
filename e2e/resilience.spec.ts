/**
 * Resilience: reloads on every screen, the back button, two tabs for one user, two people acting at the same
 * moment, a member removed during play, and a referee demoted while their play screen is open. The server restart
 * test is in `restart.spec.ts`, because it stops the server that every other spec shares.
 */
import type { Page } from '@playwright/test';
import { expect, test, type Crew } from './support/fixtures';
import { moveWithKey } from './support/party-actions';
import { openRefereeSection } from './support/referee';
import {
  createCharacter,
  enterDungeon,
  openTable,
  placeParty,
  send,
  setupTable,
  waitForGame,
} from './support/table';

function modeBadge(page: Page, mode: string | RegExp) {
  return page.getByRole('banner').getByText(mode, { exact: typeof mode === 'string' });
}

/** Reloads a page and waits until the table is open again. */
async function reload(page: Page): Promise<void> {
  await page.reload();
  await expect(page.getByRole('banner')).toBeVisible();
  await expect(page.getByText(/Opening the table|Trying again/)).toHaveCount(0, { timeout: 20_000 });
}

async function bellParty(crew: Crew, extra: Partial<Parameters<typeof setupTable>[0]> = {}) {
  const ruth = await crew.person('Ruth');
  const sam = await crew.person('Sam');
  const setup = await setupTable({
    referee: ruth,
    players: [sam],
    party: [
      { owner: sam, name: 'Flarg', classId: 'fighter' },
      { owner: sam, name: 'Tinks', classId: 'thief' },
      { owner: ruth, name: 'Clarence', classId: 'cleric' },
    ],
    ...extra,
  });
  return { ruth, sam, ...setup, tableId: setup.table.id };
}

test.describe('resilience', () => {
  test('a reload on every screen brings the same screen back', async ({ crew }) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const setup = await setupTable({ referee: ruth, players: [sam], name: 'Reloads' });
    const tableId = setup.table.id;

    // Home.
    await sam.page.goto('/');
    await expect(sam.page.getByRole('link', { name: /Reloads/ })).toBeVisible();
    await reload(sam.page);
    await expect(sam.page.getByRole('link', { name: /Reloads/ })).toBeVisible();

    // Lobby.
    await openTable(sam.page, setup.path);
    await expect(sam.page.getByRole('heading', { name: 'Reloads', level: 1 })).toBeVisible();
    await reload(sam.page);
    await expect(sam.page.getByRole('heading', { name: 'Party', level: 2 })).toBeVisible();

    // Town.
    const flarg = await createCharacter(sam.client, { name: 'Flarg', classId: 'fighter' });
    const clarence = await createCharacter(ruth.client, { name: 'Clarence', classId: 'cleric' });
    await sam.client.addToRoster(tableId, flarg.id);
    await ruth.client.addToRoster(tableId, clarence.id);
    await ruth.client.startGame(tableId, { adventure_id: 'sample:the-drowned-bell', seed: 1981 });
    await expect(sam.page.getByRole('heading', { name: 'Hollin Ferry', level: 2 })).toBeVisible({
      timeout: 20_000,
    });
    await sam.page.getByRole('tab', { name: 'Outfitter' }).click();
    await reload(sam.page);
    await expect(sam.page.getByRole('heading', { name: 'Hollin Ferry', level: 2 })).toBeVisible();
    await expect(modeBadge(sam.page, 'In town')).toBeVisible();

    // Exploring.
    await enterDungeon(sam.client, tableId, 'priory');
    await expect(modeBadge(sam.page, 'Exploring')).toBeVisible();
    await reload(sam.page);
    await expect(modeBadge(sam.page, 'Exploring')).toBeVisible();
    await expect(sam.page.getByRole('region', { name: 'Current location' })).toContainText('Gatehouse stair');

    // An encounter, then a battle with a declaration saved.
    await placeParty(ruth.client, tableId, { dungeon: 'priory', level: 1, x: 14, y: 21 });
    let game = await send(sam.client, tableId, { command_type: 'move_party', direction: 'north' });
    if (game.mode === 'encounter') {
      await expect(sam.page.getByRole('region', { name: 'Encounter' })).toBeVisible();
      await reload(sam.page);
      await expect(sam.page.getByRole('region', { name: 'Encounter' })).toBeVisible();
      game = await send(sam.client, tableId, { command_type: 'engage_battle' });
    }
    expect(game.mode).toBe('battle');
    await sam.client.declare(tableId, 'character-0001', { action: 'hold' });
    const board = sam.page.getByRole('region', { name: /^Battle, round \d+$/ });
    await expect(board).toBeVisible();
    await reload(sam.page);
    await expect(board).toBeVisible();
    const declarations = sam.page.getByRole('list', { name: 'Declarations this round' });
    await expect(declarations.getByRole('listitem').filter({ hasText: 'Flarg' })).toContainText(/hold/i);
  });

  test('the back button leaves the table and returns to it', async ({ crew }) => {
    const { sam, path } = await bellParty(crew);
    await sam.page.goto('/');
    await sam.page.getByRole('link', { name: /Test table/ }).click();
    await expect(modeBadge(sam.page, 'In town')).toBeVisible();
    await sam.page.goBack();
    await expect(sam.page.getByRole('heading', { name: 'Your tables', level: 1 })).toBeVisible();
    await sam.page.goForward();
    await expect(sam.page).toHaveURL(new RegExp(`${path}$`));
    await expect(modeBadge(sam.page, 'In town')).toBeVisible();
    await expect(sam.page.getByRole('heading', { name: 'Hollin Ferry', level: 2 })).toBeVisible();
  });

  test('two tabs for one user stay in step and count as one person', async ({ crew }) => {
    const { ruth, sam, path, tableId } = await bellParty(crew);
    await enterDungeon(sam.client, tableId, 'priory');
    await openTable(ruth.page, path);
    await openTable(sam.page, path);
    const second = await sam.newTab();
    await openTable(second, path);

    await expect(ruth.page.getByRole('group', { name: '2 at the table' })).toBeVisible();
    // The caller moves the party in one tab, and the other tab follows.
    await expect(second.getByText('The party is at 14, 23')).toBeAttached();
    await moveWithKey(sam.page, 'ArrowUp');
    await expect(sam.page.getByText('The party is at 14, 22')).toBeAttached();
    await expect(second.getByText('The party is at 14, 22')).toBeAttached();
    await expect(ruth.page.getByText('The party is at 14, 22')).toBeAttached();

    // Closing one tab leaves Sam online.
    await second.close();
    await expect(ruth.page.getByRole('img', { name: 'Sam, online' })).toBeVisible();
  });

  test('when two people act at once, the slower one sees the new state and a notice', async ({ crew }) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const pat = await crew.person('Pat');
    const setup = await setupTable({
      referee: ruth,
      players: [sam, pat],
      settings: { party_control: 'anyone' },
      party: [
        { owner: sam, name: 'Flarg', classId: 'fighter' },
        { owner: pat, name: 'Tinks', classId: 'thief' },
      ],
    });
    const tableId = setup.table.id;
    await enterDungeon(sam.client, tableId, 'priory');
    await openTable(sam.page, setup.path);
    await openTable(pat.page, setup.path);

    // Hold Pat's command in the browser until Sam's command has changed the game.
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let heldOnce = false;
    await pat.page.route(/\/api\/tables\/[^/]+\/game\/commands$/, async (route) => {
      if (!heldOnce) {
        heldOnce = true;
        await held;
      }
      await route.continue();
    });
    crew.allowIssues(/409|Conflict/);
    const revision = (await sam.client.getGame(tableId)).revision;

    await moveWithKey(pat.page, 'ArrowUp');
    await moveWithKey(sam.page, 'ArrowUp');
    await waitForGame(sam.client, tableId, (game) => game.revision > revision, "Sam's move");
    const afterSam = (await sam.client.getGame(tableId)).revision;
    release();

    await expect(pat.page.getByText('The table changed').first()).toBeVisible();
    // Pat's move went nowhere: the party moved one cell, and Pat's map shows where.
    await expect.poll(async () => (await pat.client.getGame(tableId)).revision).toBe(afterSam);
    await expect(pat.page.getByText('The party is at 14, 22')).toBeAttached();
  });

  test('a member removed during play sees why, and the referee takes their seats', async ({ crew }) => {
    const { ruth, sam, path, tableId } = await bellParty(crew);
    await enterDungeon(sam.client, tableId, 'priory');
    await openTable(ruth.page, path);
    await openTable(sam.page, path);
    await expect(sam.page.getByText('You are the caller')).toBeVisible();

    await ruth.client.removeMember(tableId, sam.id);
    await expect(sam.page.getByText('The referee removed you from this table')).toBeVisible();
    await expect(sam.page.getByRole('link', { name: 'Go to your tables' })).toBeVisible();
    await expect(ruth.page.getByRole('img', { name: /^Sam/ })).toHaveCount(0);
    const seats = (await ruth.client.getGame(tableId)).seats;
    expect(seats.filter((seat) => seat.user_id === sam.id)).toEqual([]);

    // A reload doesn't bring Sam back in.
    await sam.page.reload();
    await expect(sam.page.getByText("You aren't at this table")).toBeVisible();
    await sam.page.getByRole('link', { name: 'Go to your tables' }).click();
    await expect(sam.page.getByRole('link', { name: /Test table/ })).toHaveCount(0);
  });

  test('a referee demoted while the play screen is open loses the referee tools at once', async ({
    crew,
  }) => {
    const { ruth, sam, path, tableId } = await bellParty(crew);
    const pat = await crew.person('Pat');
    await pat.client.joinTable((await ruth.client.getTable(tableId)).invite_code);
    await ruth.client.setMemberRole(tableId, pat.id, 'referee');
    await enterDungeon(sam.client, tableId, 'priory');
    await openTable(pat.page, path);
    await openRefereeSection(pat.page, 'now');
    await expect(pat.page.getByText('Referee map')).toBeVisible();

    await ruth.client.setMemberRole(tableId, pat.id, 'player');
    await expect(pat.page.getByRole('tab', { name: 'Referee', exact: true })).toHaveCount(0);
    await expect(pat.page.getByRole('switch', { name: 'Referee lens' })).toHaveCount(0);
    await expect(pat.page.getByText('Referee map')).toHaveCount(0);
    await expect(pat.page.getByRole('region', { name: 'Current location' })).toContainText('Gatehouse stair');
    // Nothing referee-only stays on screen from before.
    await expect(pat.page.getByText(/The Drain Folk kobolds are hungry/)).toHaveCount(0);
    await reload(pat.page);
    await expect(pat.page.getByRole('tab', { name: 'Referee', exact: true })).toHaveCount(0);
  });
});
