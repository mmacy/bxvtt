/**
 * Privacy: a player's browser never receives referee data. The test plays The Drowned Bell from town into the
 * dungeon and through two fights, while the referee writes private notes, places a referee-only pin, and rolls in
 * secret. It records every API response body and WebSocket frame the player's browser receives, and scans them
 * for markers of referee-only content.
 */
import { expect, test } from './support/fixtures';
import { BELL_MARKERS, STRUCTURAL_MARKERS, findLeaks } from './support/privacy';
import { searchFor } from './support/party-actions';
import { clickMapOffset, openRefereeSection } from './support/referee';
import { openTable, placeParty, send, setupTable, waitForGame } from './support/table';

const NOTES_MARKER = 'Private plan: the prior waits in the bell pit with two drowned brothers.';
const PIN_MARKER = 'Referee pin: a crossbow trap behind this wall.';
const ROLL_MARKER = 'whether the goblins hear the marker party';

test('a player receives no referee data through a whole game of The Drowned Bell', async ({ crew }) => {
  test.slow();
  const ruth = await crew.person('Ruth');
  const sam = await crew.person('Sam', { record: true });
  const { table, path } = await setupTable({
    referee: ruth,
    players: [sam],
    party: [
      { owner: sam, name: 'Brenna', classId: 'fighter' },
      { owner: sam, name: 'Wren', classId: 'thief' },
      { owner: ruth, name: 'Osric', classId: 'cleric' },
    ],
  });
  const tableId = table.id;
  await openTable(ruth.page, path);
  await openTable(sam.page, path);

  await test.step('the referee writes private notes and rolls in secret', async () => {
    const notes = await openRefereeSection(ruth.page, 'notes');
    await notes.getByRole('textbox', { name: 'Private notes' }).fill(NOTES_MARKER);
    await expect(notes.getByRole('status')).toContainText(/Saved/i);

    await ruth.page
      .getByRole('tablist', { name: 'Table panels' })
      .getByRole('tab', { name: /^Feed/ })
      .click();
    const composer = ruth.page.getByRole('textbox', { name: 'Message the table' });
    await composer.fill(`/roll secret 1d20 ${ROLL_MARKER}`);
    await composer.press('Enter');
    await expect(ruth.page.getByRole('region', { name: 'Feed entries' })).toContainText(ROLL_MARKER);
  });

  await test.step('the caller sets out, and the referee pins a secret on the map', async () => {
    await sam.page
      .getByRole('toolbar', { name: 'Party actions' })
      .getByRole('button', { name: /^Set out/ })
      .click();
    const setOut = sam.page.getByRole('dialog', { name: /^Set out for/ });
    await setOut.getByRole('button', { name: 'Set out' }).click();
    await expect(sam.page.getByRole('banner').getByText('Exploring', { exact: true })).toBeVisible();
    await expect(sam.page.getByRole('region', { name: 'Where the party stands' })).toContainText(
      'Gatehouse stair',
    );

    await ruth.page
      .getByRole('toolbar', { name: 'Map tools' })
      .getByRole('button', { name: 'Pin a note' })
      .click();
    await clickMapOffset(ruth.page, 1, -1);
    const pin = ruth.page.getByRole('dialog', { name: 'Add a pin' });
    await pin.getByRole('textbox', { name: 'Note' }).fill(PIN_MARKER);
    await pin.getByRole('checkbox', { name: 'Only referees see this pin' }).check();
    await pin.getByRole('button', { name: 'Add the pin' }).click();
    await expect(pin).toHaveCount(0);
    await expect
      .poll(async () =>
        JSON.stringify(await ruth.client.getAnnotations(tableId, { dungeon_id: 'priory', level_number: 1 })),
      )
      .toContain(PIN_MARKER);
  });

  await test.step('the party searches the chapel and meets the guardroom goblins', async () => {
    await placeParty(ruth.client, tableId, { dungeon: 'priory', level: 1, x: 17, y: 12 });
    await expect(sam.page.getByRole('region', { name: 'Where the party stands' })).toContainText('Chapel');
    await searchFor(sam.page);

    // Placing the party starts no encounter, so it walks the last step into the guardroom.
    await placeParty(ruth.client, tableId, { dungeon: 'priory', level: 1, x: 14, y: 21 });
    await send(sam.client, tableId, { command_type: 'move_party', direction: 'north' });
    await waitForGame(
      sam.client,
      tableId,
      (game) => game.view.encounter != null,
      'an encounter in the guardroom',
    );
    await expect(
      sam.page.getByRole('banner').getByText(/^(Encounter|Battle)$/),
      'Sam sees the goblins',
    ).toBeVisible();
    await send(ruth.client, tableId, {
      command_type: 'end_encounter',
      outcome: 'departed',
      resolve_area: false,
    });
  });

  await test.step('the party fights the robed corpses in the bell pit', async () => {
    await placeParty(ruth.client, tableId, { dungeon: 'priory', level: 3, x: 13, y: 17, facing: 'south' });
    await send(sam.client, tableId, { command_type: 'move_party', direction: 'south' });
    let game = await waitForGame(
      sam.client,
      tableId,
      (g) => g.view.encounter != null,
      'the bell pit encounter',
    );
    if (game.mode === 'encounter') {
      game = await send(sam.client, tableId, { command_type: 'engage_battle' });
    }
    for (let round = 0; round < 2 && game.mode === 'battle'; round += 1) {
      await ruth.client.resolveRound(tableId, true);
      game = await sam.client.getGame(tableId);
    }
    await expect(sam.page.getByRole('banner').getByText(/^(Encounter|Battle|Game over)$/)).toBeVisible();
    // The disguised prior shows only as a robed corpse.
    await expect(sam.page.getByText(/robed corpse/i).first()).toBeVisible();
  });

  await test.step('the player reloads and reads the journal', async () => {
    await sam.page.reload();
    await expect(sam.page.getByRole('banner')).toBeVisible();
    await sam.page
      .getByRole('tablist', { name: 'Table panels' })
      .getByRole('tab', { name: 'Journal' })
      .click();
    await expect(sam.page.getByRole('tabpanel', { name: 'Journal' })).toContainText('Recover the Hand');
    await sam.page.getByRole('tablist', { name: 'Table panels' }).getByRole('tab', { name: /^Feed/ }).click();
    await expect(sam.page.getByRole('region', { name: 'Feed entries' })).not.toContainText(ROLL_MARKER);
  });

  // The referee's copy of the feed has the secret roll, so its absence from the player's copy means something.
  const refereeFeed = await ruth.client.getFeed(tableId, { limit: 200 });
  const secret = refereeFeed.entries.find((entry) => JSON.stringify(entry).includes(ROLL_MARKER));
  expect(secret, 'the referee should see the secret roll').toBeDefined();
  expect(JSON.stringify(secret)).toContain('"secret":true');

  expect(sam.received.length, 'the recorder should have captured traffic').toBeGreaterThan(20);
  // Public text that the player must have received proves the recorder saw both HTTP and WebSocket traffic.
  const seen = findLeaks(sam.received, [
    '"type":"snapshot"',
    '"type":"game"',
    'Gatehouse stair',
    'robed corpse',
  ]);
  expect(seen.map((found) => found.marker)).toEqual([
    '"type":"snapshot"',
    '"type":"game"',
    'Gatehouse stair',
    'robed corpse',
  ]);
  const leaks = findLeaks(sam.received, [
    ...STRUCTURAL_MARKERS,
    ...BELL_MARKERS,
    NOTES_MARKER,
    PIN_MARKER,
    ROLL_MARKER,
  ]);
  expect(leaks.map((leak) => `${leak.marker} … ${leak.context}`)).toEqual([]);
});
