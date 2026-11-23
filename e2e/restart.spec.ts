/**
 * The server restarts in the middle of play. Every open page shows that it lost the connection, reconnects by
 * itself when the server is back, and shows the same game, feed, and notes as before. A request to come back in
 * lives in the server's memory, so a restart ends it, and the waiting player can ask again. This spec stops the
 * server that every other spec shares, so Playwright runs it alone in the `restart` project after the rest.
 */
import { expect, test } from './support/fixtures';
import { moveWithKey } from './support/party-actions';
import { screenshot } from './support/referee';
import { restartServer } from './support/server';
import { enterDungeon, openTable, setupTable } from './support/table';

/** Problems a page reports while the server is down. That is the point of these tests. */
const SERVER_DOWN =
  /WebSocket|ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|50[234]|Failed to load resource|fetch/i;

test('the table reconnects after the server restarts, with its state intact', async ({ crew }) => {
  test.slow();
  const ruth = await crew.person('Ruth');
  const sam = await crew.person('Sam');
  const { table, path } = await setupTable({
    referee: ruth,
    players: [sam],
    party: [
      { owner: sam, name: 'Flarg', classId: 'fighter' },
      { owner: ruth, name: 'Clarence', classId: 'cleric' },
    ],
  });
  const tableId = table.id;
  await enterDungeon(sam.client, tableId, 'priory');
  await sam.client.postFeed(tableId, { text: 'Hold the torch higher, Clarence.' });
  const notes = await sam.client.getNotes(tableId, 'party');
  await sam.client.updateNotes(tableId, 'party', 'The bell tolls under the floor.', notes.version);
  await openTable(ruth.page, path);
  await openTable(sam.page, path);
  await moveWithKey(sam.page, 'ArrowUp');
  await expect(ruth.page.getByText('The party is at 14, 22')).toBeAttached();

  // While the server is down, requests and the socket fail. That is the point of the test.
  crew.allowIssues(SERVER_DOWN);
  const restarted = restartServer(4000);
  for (const page of [ruth.page, sam.page]) {
    await expect(page.getByText(/Connection lost\. Reconnecting to the table\./)).toBeVisible({
      timeout: 15_000,
    });
  }
  await screenshot(sam.page, 'restart-reconnecting');
  await restarted;

  for (const page of [ruth.page, sam.page]) {
    await expect(page.getByText(/Connection lost/)).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText('The party is at 14, 22')).toBeAttached();
    await expect(page.getByRole('banner').getByText('Exploring', { exact: true })).toBeVisible();
  }
  await sam.page.getByRole('tablist', { name: 'Table panels' }).getByRole('tab', { name: /^Feed/ }).click();
  await expect(sam.page.getByRole('region', { name: 'Feed entries' })).toContainText(
    'Hold the torch higher, Clarence.',
  );
  await sam.page.getByRole('tablist', { name: 'Table panels' }).getByRole('tab', { name: 'Journal' }).click();
  const journal = sam.page.getByRole('tabpanel', { name: 'Journal' });
  await journal
    .getByRole('radiogroup', { name: 'Journal section' })
    .getByRole('radio', { name: 'Notes' })
    .click();
  await expect(journal.getByRole('region', { name: 'Party notes' }).getByRole('textbox').first()).toHaveValue(
    'The bell tolls under the floor.',
  );

  // Play goes on: the caller moves again, and the referee sees it.
  await moveWithKey(sam.page, 'ArrowUp');
  await expect(ruth.page.getByText('The party is at 14, 21')).toBeAttached();
  await expect(ruth.page.getByRole('img', { name: 'Sam, online' })).toBeVisible();
});

test('a waiting request to come back in ends with the restart, and the player can ask again', async ({
  crew,
}) => {
  test.slow();
  const ruth = await crew.person('Ruth');
  const sam = await crew.person('Sam');
  const { table, path } = await setupTable({
    referee: ruth,
    players: [sam],
    party: [{ owner: sam, name: 'Flarg', classId: 'fighter' }],
  });
  await openTable(ruth.page, path);
  // Sam's browser lost its sign-in, so he opens the invite link in a new one and asks to come back in.
  const visitor = await crew.person('Sam in a new browser', { signedIn: false });
  const page = visitor.page;
  await page.goto(`/join/${table.invite_code}`);
  const ask = page
    .getByRole('list', { name: 'Members who can rejoin' })
    .getByRole('button', { name: 'Rejoin as Sam' });
  await ask.click();
  const waiting = page.getByRole('heading', { name: 'Waiting to rejoin as Sam' });
  await expect(waiting).toBeVisible();
  const prompt = ruth.page.getByRole('region', { name: 'Rejoin requests' });
  await expect(prompt).toContainText('Someone asked to rejoin as Sam');

  crew.allowIssues(SERVER_DOWN);
  crew.allowIssues(/404|Not Found/);
  await restartServer(4000);
  await expect(ruth.page.getByText(/Connection lost/)).toHaveCount(0, { timeout: 30_000 });
  // The restart dropped the request: the referee's prompt is gone, and the player is told and can ask again.
  await expect(prompt).toHaveCount(0);
  await expect(waiting).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole('alert')).toBeVisible();
  await screenshot(page, 'restart-rejoin-ended');
  await ask.click();
  await expect(waiting).toBeVisible();
  await prompt.getByRole('button', { name: 'Approve' }).click();
  await expect(page).toHaveURL(new RegExp(`${path}$`), { timeout: 15_000 });
  await expect(page.getByRole('banner').getByText('In town', { exact: true })).toBeVisible();
});
