/**
 * The server restarts in the middle of play. Every open page shows that it lost the connection, reconnects by
 * itself when the server is back, and shows the same game, feed, and notes as before. This spec stops the server
 * that every other spec shares, so Playwright runs it alone in the `restart` project after the rest.
 */
import { expect, test } from './support/fixtures';
import { moveWithKey } from './support/party-actions';
import { screenshot } from './support/referee';
import { restartServer } from './support/server';
import { enterDungeon, openTable, setupTable } from './support/table';

test('the table reconnects after the server restarts, with its state intact', async ({ crew }) => {
  test.slow();
  const ruth = await crew.person('Ruth');
  const sam = await crew.person('Sam');
  const { table, path } = await setupTable({
    referee: ruth,
    players: [sam],
    party: [
      { owner: sam, name: 'Brenna', classId: 'fighter' },
      { owner: ruth, name: 'Osric', classId: 'cleric' },
    ],
  });
  const tableId = table.id;
  await enterDungeon(sam.client, tableId, 'priory');
  await sam.client.postFeed(tableId, { text: 'Hold the torch higher, Osric.' });
  const notes = await sam.client.getNotes(tableId, 'party');
  await sam.client.updateNotes(tableId, 'party', 'The bell tolls under the floor.', notes.version);
  await openTable(ruth.page, path);
  await openTable(sam.page, path);
  await moveWithKey(sam.page, 'ArrowUp');
  await expect(ruth.page.getByText('The party is at 14, 22')).toBeAttached();

  // While the server is down, requests and the socket fail. That is the point of the test.
  crew.allowIssues(
    /WebSocket|ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|50[234]|Failed to load resource|fetch/i,
  );
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
    'Hold the torch higher, Osric.',
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
