/**
 * Privacy: a player's browser never receives referee data. The first test plays The Drowned Bell from town into
 * the dungeon and through two fights, while the referee writes private notes, places a referee-only pin, rolls in
 * secret, and reads a treasure's referee notes in the area key while the player stands in the same room. It
 * records every API response body and WebSocket frame the player's browser receives, and scans them for markers
 * of referee-only content, among them the referee notes of every sample adventure. It scans the referee's own
 * traffic as the control, so a marker the scan can't find never passes for a guarded one. The second test does the
 * same while a returning player asks to come back in: the requests go to referees alone, and the visitor learns
 * nothing but the table's name, the offline members, and, once let in, their own new sign-in.
 */
import { expect, sdkClient, test } from './support/fixtures';
import { BELL_MARKERS, SAMPLE_REFEREE_NOTES, STRUCTURAL_MARKERS, findLeaks } from './support/privacy';
import { searchFor } from './support/party-actions';
import { clickMapOffset, openRefereeSection } from './support/referee';
import { openTable, placeParty, send, setupTable, waitForGame } from './support/table';

const NOTES_MARKER = 'Private plan: the prior waits in the bell pit with two drowned brothers.';
const PIN_MARKER = 'Referee pin: a crossbow trap behind this wall.';
const ROLL_MARKER = 'whether the goblins hear the marker party';
const CHAPEL_NOTE = 'The clay bottle wrapped in the altar cloth holds the potion of healing.';

test('a player receives no referee data through a whole game of The Drowned Bell', async ({ crew }) => {
  test.slow();
  // The referee's browser is recorded too, as the control: the scan has to find her referee data.
  const ruth = await crew.person('Ruth', { record: true });
  const sam = await crew.person('Sam', { record: true });
  const { table, path } = await setupTable({
    referee: ruth,
    players: [sam],
    party: [
      { owner: sam, name: 'Flarg', classId: 'fighter' },
      { owner: sam, name: 'Tinks', classId: 'thief' },
      { owner: ruth, name: 'Clarence', classId: 'cleric' },
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
    await expect(sam.page.getByRole('region', { name: 'Current location' })).toContainText('Gatehouse stair');

    await ruth.page
      .getByRole('toolbar', { name: 'Map tools' })
      .getByRole('button', { name: 'Pin a note' })
      .click();
    await clickMapOffset(ruth.page, 1, -1);
    const pin = ruth.page.getByRole('dialog', { name: 'Add pin' });
    await pin.getByRole('textbox', { name: 'Note' }).fill(PIN_MARKER);
    await pin.getByRole('checkbox', { name: 'Visible only to referees' }).check();
    await pin.getByRole('button', { name: 'Add pin' }).click();
    await expect(pin).toHaveCount(0);
    await expect
      .poll(async () =>
        JSON.stringify(await ruth.client.getAnnotations(tableId, { dungeon_id: 'priory', level_number: 1 })),
      )
      .toContain(PIN_MARKER);
  });

  await test.step('the party searches the chapel and meets the guardroom goblins', async () => {
    await placeParty(ruth.client, tableId, { dungeon: 'priory', level: 1, x: 17, y: 12 });
    await expect(sam.page.getByRole('region', { name: 'Current location' })).toContainText('Chapel');
    // The referee reads the altar's referee notes in the area key while Sam stands at the altar.
    const now = await openRefereeSection(ruth.page, 'now');
    await expect(now.getByRole('region', { name: 'Referee notes' }).first()).toContainText(CHAPEL_NOTE);
    await expect(sam.page.getByText(CHAPEL_NOTE)).toHaveCount(0);
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
  // The control: the same scan finds the referee notes, their field, and the referee view's feature handles in
  // what the referee's browser received, so a leak of any of them to the player would fail this test.
  expect(SAMPLE_REFEREE_NOTES, 'the sample adventures should have referee notes').toHaveLength(13);
  const refereeData = findLeaks(ruth.received, ['"referee_notes"', '"feature_handles"', CHAPEL_NOTE]);
  expect(refereeData.map((found) => found.marker)).toEqual([
    '"referee_notes"',
    '"feature_handles"',
    CHAPEL_NOTE,
    '"referee":{',
  ]);
  const leaks = findLeaks(sam.received, [
    ...STRUCTURAL_MARKERS,
    ...BELL_MARKERS,
    ...SAMPLE_REFEREE_NOTES,
    NOTES_MARKER,
    PIN_MARKER,
    ROLL_MARKER,
  ]);
  expect(leaks.map((leak) => `${leak.marker} … ${leak.context}`)).toEqual([]);
  // The player's page shows none of the notes either.
  const page = await sam.page.content();
  expect(SAMPLE_REFEREE_NOTES.filter((note) => page.includes(note))).toEqual([]);
});

test('rejoin requests reach referees alone, and a visitor learns only what the join page needs', async ({
  crew,
}) => {
  const ruth = await crew.person('Ruth');
  const sam = await crew.person('Sam');
  const pat = await crew.person('Pat', { record: true });
  const { table, path } = await setupTable({
    referee: ruth,
    players: [sam, pat],
    party: [
      { owner: sam, name: 'Flarg', classId: 'fighter' },
      { owner: pat, name: 'Tinks', classId: 'thief' },
      { owner: ruth, name: 'Clarence', classId: 'cleric' },
    ],
  });
  const oldToken = sam.token ?? '';
  await openTable(ruth.page, path);
  await openTable(pat.page, path);
  // Ruth and Pat count as online only once their sockets open, and the join page lists offline members alone.
  await expect(ruth.page.getByRole('img', { name: /^Pat, online/ })).toBeVisible();
  await expect(pat.page.getByRole('img', { name: /^Ruth, referee, online/ })).toBeVisible();

  // Sam's browser lost its sign-in. He opens the invite link in a new one and asks to come back in, twice.
  const visitor = await crew.person('Sam in a new browser', { signedIn: false, record: true });
  await visitor.page.goto(`/join/${table.invite_code}`);
  const members = visitor.page.getByRole('list', { name: 'Members who can rejoin' });
  await expect(members.getByRole('button')).toHaveCount(1);
  await members.getByRole('button', { name: 'Rejoin as Sam' }).click();
  const prompt = ruth.page.getByRole('region', { name: 'Rejoin requests' });
  await prompt.getByRole('button', { name: 'Decline' }).click();
  await expect(
    visitor.page.getByRole('alert').filter({ hasText: 'The referee declined your request to rejoin' }),
  ).toBeVisible({
    timeout: 15_000,
  });
  const visitorBefore = [...visitor.received];
  await members.getByRole('button', { name: 'Rejoin as Sam' }).click();
  await prompt.getByRole('button', { name: 'Approve' }).click();
  await expect(visitor.page).toHaveURL(new RegExp(`${path}$`), { timeout: 15_000 });
  await expect(visitor.page.getByRole('banner').getByText('In town', { exact: true })).toBeVisible();
  const raw = await visitor.page.evaluate(() => localStorage.getItem('bxvtt.identity'));
  const newToken = (JSON.parse(raw ?? '{}') as { token?: string }).token ?? '';
  expect(newToken).not.toBe('');
  expect((await sdkClient(newToken).me()).id).toBe(sam.id);
  await expect(pat.page.getByRole('region', { name: 'Rejoin requests' })).toHaveCount(0);

  // The other player received no request, no request ID or secret, and neither of Sam's tokens.
  const rejoinMarkers = ['"rejoin_requests"', 'rjn_', 'rjs_', oldToken, newToken];
  const patLeaks = findLeaks(pat.received, [
    ...STRUCTURAL_MARKERS,
    ...BELL_MARKERS,
    ...SAMPLE_REFEREE_NOTES,
    ...rejoinMarkers,
  ]);
  expect(patLeaks.map((leak) => `${leak.marker} … ${leak.context}`)).toEqual([]);
  expect(pat.received.length, 'the recorder should have captured traffic').toBeGreaterThan(5);

  // Before the referee let Sam in, the visitor received the lookup, its own tickets, and the request's status.
  const lookup = visitorBefore
    .map((text) => {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return null;
      }
    })
    .find(
      (body): body is { table_name: string; members: Record<string, unknown>[] } =>
        typeof body === 'object' && body !== null && 'table_name' in body,
    );
  expect(lookup, 'the visitor should have received the lookup').toBeDefined();
  expect(Object.keys(lookup ?? {}).sort()).toEqual(['members', 'table_name']);
  expect(lookup?.members.map((member) => Object.keys(member).sort())).toEqual([['color', 'name', 'user_id']]);
  const visitorLeaks = findLeaks(visitorBefore, [
    ...STRUCTURAL_MARKERS,
    ...BELL_MARKERS,
    '"rejoin_requests"',
    oldToken,
    table.invite_code,
    '"role"',
    'Clarence',
    'Flarg',
  ]);
  expect(visitorLeaks.map((leak) => `${leak.marker} … ${leak.context}`)).toEqual([]);

  // Once in, the visitor is Sam, a player, and receives no referee data and no request list. The request IDs it
  // received are its own tickets.
  const visitorLeaksAfter = findLeaks(visitor.received, [...STRUCTURAL_MARKERS, ...BELL_MARKERS, oldToken]);
  expect(visitorLeaksAfter.map((leak) => `${leak.marker} … ${leak.context}`)).toEqual([]);
  expect(visitor.received.some((text) => text.includes('"rejoin_requests":['))).toBe(false);
});
