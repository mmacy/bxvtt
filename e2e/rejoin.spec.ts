/**
 * Rejoining: a player whose browser lost its sign-in comes back in through the invite link as the member they
 * were, and a referee lets them in. Each test has a referee (Ruth) and a player (Sam) who joins through the invite
 * link in a browser with no stored identity, so the test learns his token from the browser, as the real flow does.
 */
import type { Page, WebSocketRoute } from '@playwright/test';
import type { User } from '@bxvtt/shared/protocol';
import { expect, sdkClient, test, type Actor, type Crew } from './support/fixtures';
import { screenshot } from './support/referee';
import { createCharacter, openTable } from './support/table';

/** A started game of The Drowned Bell that Sam joined through the invite link. */
interface RejoinTable {
  ruth: Actor;
  sam: Actor;
  tableId: string;
  inviteCode: string;
  path: string;
  /** Sam's first token, which the browser stored when he picked his name. */
  samToken: string;
  samUser: User;
}

/** Reads the identity that the web client stored for the page's user. */
async function storedIdentity(page: Page): Promise<{ token: string; user: User }> {
  const raw = await page.evaluate(() => localStorage.getItem('bxvtt.identity'));
  if (raw === null) throw new Error('The browser stored no identity.');
  return JSON.parse(raw) as { token: string; user: User };
}

/**
 * Ruth makes a table and puts Clarence on its roster. Sam opens the invite link in a browser with no identity,
 * picks his name, and joins. His character Flarg goes on the roster, and Ruth starts the game, so Flarg's seat
 * is Sam's.
 */
async function joinedTable(crew: Crew): Promise<RejoinTable> {
  const ruth = await crew.person('Ruth');
  const sam = await crew.person('Sam', { signedIn: false });
  const table = await ruth.client.createTable({ name: 'The bell tolls' });
  const clarence = await createCharacter(ruth.client, { name: 'Clarence', classId: 'cleric' }, table.id);
  await ruth.client.addToRoster(table.id, clarence.id);
  const path = `/tables/${table.id}`;
  await openTable(ruth.page, path);

  // Ruth is online, so nobody can come back in yet, and the page offers only the "new here" path.
  await sam.page.goto(`/join/${table.invite_code}`);
  await expect(sam.page.getByRole('heading', { name: "You're invited to a table" })).toBeVisible();
  await expect(sam.page.getByRole('heading', { name: "I've played at this table before" })).toHaveCount(0);
  await sam.page.getByRole('textbox', { name: 'Your name' }).fill('Sam');
  await sam.page.getByRole('button', { name: 'Join table' }).click();
  await expect(sam.page).toHaveURL(new RegExp(`${path}$`));
  await expect(sam.page.getByRole('heading', { name: 'The bell tolls', level: 1 })).toBeVisible();

  const { token, user } = await storedIdentity(sam.page);
  const client = sdkClient(token);
  const flarg = await createCharacter(client, { name: 'Flarg', classId: 'fighter' }, table.id);
  await client.addToRoster(table.id, flarg.id);
  await ruth.client.startGame(table.id, { adventure_id: 'sample:the-drowned-bell', seed: 1981 });
  await expect(sam.page.getByRole('heading', { name: 'Hollin Ferry', level: 2 })).toBeVisible({
    timeout: 20_000,
  });
  await expectSeat(sam.page);
  waitingTables.push({ referee: ruth, tableId: table.id });
  return {
    ruth,
    sam,
    tableId: table.id,
    inviteCode: table.invite_code,
    path,
    samToken: token,
    samUser: user,
  };
}

/** Expects the play screen to show Flarg as the viewer's own seat, and the viewer as the caller. */
async function expectSeat(page: Page): Promise<void> {
  await expect(page.getByRole('banner').getByText('In town', { exact: true })).toBeVisible();
  await page.getByRole('tablist', { name: 'Table panels' }).getByRole('tab', { name: 'Party' }).click();
  const order = page.getByRole('list', { name: 'Marching order' });
  await expect(order.getByRole('button', { name: 'Flarg', exact: true })).toHaveAccessibleDescription(
    /^You, level 1 fighter/,
  );
  await expect(order.getByRole('button', { name: 'Clarence', exact: true })).toHaveAccessibleDescription(
    /^Ruth, /,
  );
}

/** Sam closes his browser, and Ruth's top bar shows him offline. */
async function closeBrowser(table: RejoinTable): Promise<void> {
  await table.sam.context.close();
  await expect(table.ruth.page.getByRole('img', { name: 'Sam, offline' })).toBeVisible();
}

/** Sam comes back in a fresh browser with empty storage, through the invite link. */
async function returningVisitor(crew: Crew, table: RejoinTable): Promise<Actor> {
  const visitor = await crew.person('Sam in a new browser', { signedIn: false });
  await visitor.page.goto(`/join/${table.inviteCode}`);
  await expect(visitor.page.getByRole('heading', { name: "I'm new here" })).toBeVisible();
  await expect(visitor.page.getByRole('heading', { name: "I've played at this table before" })).toBeVisible();
  return visitor;
}

/** The list of members a visitor can come back in as. */
function candidates(page: Page) {
  return page.getByRole('list', { name: 'Members who can rejoin' });
}

/** Presses "Rejoin as Sam" and expects the waiting screen. */
async function askToComeBack(page: Page): Promise<void> {
  await candidates(page).getByRole('button', { name: 'Rejoin as Sam' }).click();
  await expect(page.getByRole('heading', { name: 'Waiting to rejoin as Sam' })).toBeVisible();
  // The heading shows while the request is on its way too, so wait for the server's ticket.
  await expect(page.getByText(/Your rejoin request expires at/)).toBeVisible();
}

/** The tables of the running test, whose waiting requests the test declines when it ends. */
const waitingTables: { referee: Actor; tableId: string }[] = [];

/**
 * Declines every request still waiting at the table. The server keeps one waiting request per address, and every
 * browser in the suite shares one address, so a request left waiting would block the next test's for minutes.
 */
async function declineWaiting(referee: Actor, tableId: string): Promise<void> {
  for (const request of (await referee.client.listRejoinRequests(tableId)).items) {
    await referee.client.declineRejoin(tableId, request.id).catch(() => undefined);
  }
}

test.afterEach(async () => {
  for (const { referee, tableId } of waitingTables.splice(0)) await declineWaiting(referee, tableId);
});

/** A warning banner on the join page, found by its title. */
function notice(page: Page, title: string) {
  return page.getByRole('alert').filter({ hasText: title });
}

/** The referee's prompt for rejoin requests. */
function requests(page: Page) {
  return page.getByRole('region', { name: 'Rejoin requests' });
}

test.describe('rejoining a table', () => {
  test('a returning player asks to come back in, the referee lets them in, and they keep their seat', async ({
    crew,
  }) => {
    const table = await joinedTable(crew);
    const { ruth, tableId } = table;
    await closeBrowser(table);

    const visitor = await returningVisitor(crew, table);
    const page = visitor.page;
    // Ruth is online, so only Sam is offered.
    const offered = candidates(page).getByRole('button');
    await expect(offered).toHaveCount(1);
    await expect(offered).toHaveAccessibleName('Rejoin as Sam');
    await screenshot(page, 'rejoin-choose');
    await askToComeBack(page);
    await expect(page.getByText(/A referee is online now\. Let them know it's you/)).toBeVisible();
    await expect(page.getByText(/Your rejoin request expires at .+\. Keep this page open\./)).toBeVisible();
    // While Sam waits, the page hides the "new here" path.
    await expect(page.getByRole('heading', { name: "I'm new here" })).toHaveCount(0);
    await screenshot(page, 'rejoin-waiting');

    const prompt = requests(ruth.page);
    await expect(prompt).toContainText('Someone asked to rejoin as Sam');
    await expect(prompt).toContainText(
      "Approve this rejoin request only if you confirm by voice or chat that it's really Sam",
    );
    await screenshot(ruth.page, 'rejoin-referee-prompt');
    await prompt.getByRole('button', { name: 'Approve' }).click();
    await expect(prompt).toHaveCount(0);

    // Sam lands on the play screen as the member he was, with Flarg's seat and the caller's role.
    await expect(page).toHaveURL(new RegExp(`${table.path}$`), { timeout: 15_000 });
    await expectSeat(page);
    await expect(ruth.page.getByRole('img', { name: 'Sam, online' })).toBeVisible();
    await screenshot(page, 'rejoin-landed');

    // The browser holds Sam's own user with a new token, and the old token no longer works.
    const { token, user } = await storedIdentity(page);
    expect(user.id).toBe(table.samUser.id);
    expect(token).not.toBe(table.samToken);
    await expect(sdkClient(table.samToken).me()).rejects.toThrow();
    const characters = await sdkClient(token).listCharacters();
    expect(characters.items.map((character) => character.name)).toEqual(['Flarg']);

    // The feed says who let Sam back in.
    await page.getByRole('tablist', { name: 'Table panels' }).getByRole('tab', { name: /^Feed/ }).click();
    await expect(page.getByRole('region', { name: 'Feed entries' })).toContainText(
      'Ruth let Sam back into the table.',
    );
    expect((await ruth.client.listRejoinRequests(tableId)).items).toEqual([]);
  });

  test('a player signs out in the lobby and comes back in through the invite link', async ({ crew }) => {
    const ruth = await crew.person('Ruth');
    const sam = await crew.person('Sam');
    const table = await ruth.client.createTable({ name: 'Round trip' });
    await sam.client.joinTable(table.invite_code);
    const flarg = await createCharacter(sam.client, { name: 'Flarg', classId: 'fighter' }, table.id);
    await sam.client.addToRoster(table.id, flarg.id);
    waitingTables.push({ referee: ruth, tableId: table.id });
    const path = `/tables/${table.id}`;
    await openTable(ruth.page, path);
    await openTable(sam.page, path);
    const before = await storedIdentity(sam.page);

    // The dialog says how Sam gets back to this table before he confirms, from the keyboard.
    await sam.page.getByRole('button', { name: 'Sam, your profile' }).focus();
    await sam.page.keyboard.press('Enter');
    await sam.page.getByRole('button', { name: 'Sign out' }).focus();
    await sam.page.keyboard.press('Enter');
    const confirm = sam.page.getByRole('alertdialog', { name: 'Sign out of this browser?' });
    await expect(confirm.getByRole('list', { name: 'Tables you can come back to' })).toContainText(
      'Round trip',
    );
    await expect(confirm).toContainText(`choose "I've played at this table before"`);
    await screenshot(sam.page, 'sign-out-confirm');
    await confirm.getByRole('button', { name: 'Sign out' }).click();

    await expect(sam.page).toHaveURL(/\/$/);
    await expect(sam.page.getByRole('form', { name: 'Choose your name' })).toBeVisible();
    await expect(sam.page.getByRole('textbox', { name: 'Your name' })).toHaveValue('');
    await expect(ruth.page.getByText('1 of 2 online')).toBeVisible();
    await expect(sdkClient(before.token).me()).rejects.toThrow();

    // The way back the dialog promised works: Sam asks through the invite link, and Ruth lets him in.
    await sam.page.goto(`/join/${table.invite_code}`);
    await askToComeBack(sam.page);
    await requests(ruth.page).getByRole('button', { name: 'Approve' }).click();
    await expect(sam.page).toHaveURL(new RegExp(`${path}$`), { timeout: 15_000 });
    await expect(sam.page.getByRole('heading', { name: 'Round trip', level: 1 })).toBeVisible();
    const after = await storedIdentity(sam.page);
    expect(after.user.id).toBe(before.user.id);
    expect((await sdkClient(after.token).listCharacters()).items.map((item) => item.name)).toEqual(['Flarg']);
  });

  test('when the referee says not now, the player is told and can ask again or stop waiting', async ({
    crew,
  }) => {
    const table = await joinedTable(crew);
    const { ruth, tableId } = table;
    await closeBrowser(table);
    const visitor = await returningVisitor(crew, table);
    const page = visitor.page;

    await askToComeBack(page);
    const prompt = requests(ruth.page);
    await prompt.getByRole('button', { name: 'Decline' }).click();
    await expect(prompt).toHaveCount(0);
    const refused = notice(page, 'The referee declined your request to rejoin as Sam');
    await expect(refused).toBeVisible({ timeout: 15_000 });
    await expect(refused).toContainText('Ask the referee if that was a mistake and try again');
    // The "new here" path comes back, and Sam can ask again.
    await expect(page.getByRole('heading', { name: "I'm new here" })).toBeVisible();
    await screenshot(page, 'rejoin-declined');

    await askToComeBack(page);
    await expect(prompt).toContainText('Someone asked to rejoin as Sam');
    await page.getByRole('button', { name: 'Stop waiting' }).click();
    await expect(page.getByRole('heading', { name: "I've played at this table before" })).toBeVisible();
    await expect(page.getByRole('heading', { name: "I'm new here" })).toBeVisible();
    await expect(candidates(page).getByRole('button', { name: 'Rejoin as Sam' })).toBeVisible();
    // Sam is still a stranger in this browser, and the old token still works.
    expect(await page.evaluate(() => localStorage.getItem('bxvtt.identity'))).toBeNull();
    expect((await sdkClient(table.samToken).me()).id).toBe(table.samUser.id);
    expect((await ruth.client.getTable(tableId)).members.map((member) => member.name).sort()).toEqual([
      'Ruth',
      'Sam',
    ]);
  });

  test('stopping a wait ends the request for the referee too', async ({ crew }) => {
    const table = await joinedTable(crew);
    const { ruth } = table;
    await closeBrowser(table);
    const visitor = await returningVisitor(crew, table);
    const page = visitor.page;

    await askToComeBack(page);
    const prompt = requests(ruth.page);
    await expect(prompt).toContainText('Someone asked to rejoin as Sam');
    await page.getByRole('button', { name: 'Stop waiting' }).click();
    await expect(prompt).toHaveCount(0);
    await askToComeBack(page);
    await expect(notice(page, 'A rejoin request is already pending')).toHaveCount(0);
  });

  test('two players on one network can ask to come back in at the same time', async ({ crew }) => {
    const table = await joinedTable(crew);
    const { ruth } = table;
    const pat = await crew.person('Pat');
    await pat.client.joinTable(table.inviteCode);
    await closeBrowser(table);
    const first = await returningVisitor(crew, table);
    const second = await crew.person('Pat in a new browser', { signedIn: false });
    await second.page.goto(`/join/${table.inviteCode}`);
    await askToComeBack(first.page);
    await candidates(second.page).getByRole('button', { name: 'Rejoin as Pat' }).click();
    await expect(second.page.getByRole('heading', { name: 'Waiting to rejoin as Pat' })).toBeVisible();
    await expect(second.page.getByText(/Your rejoin request expires at/)).toBeVisible();
    await expect(requests(ruth.page)).toContainText('1 more rejoin request is waiting.');
  });

  test('a poll that fails once keeps the player waiting', async ({ crew }) => {
    const table = await joinedTable(crew);
    const { ruth } = table;
    await closeBrowser(table);
    const visitor = await returningVisitor(crew, table);
    const page = visitor.page;
    let failOnce = true;
    await page.route(/\/api\/rejoin\/[^/]+\/status$/, async (route) => {
      if (!failOnce) return route.continue();
      failOnce = false;
      await route.abort('internetdisconnected');
    });
    crew.allowIssues(/ERR_INTERNET_DISCONNECTED|Failed to load resource|fetch/i);
    await askToComeBack(page);
    await expect.poll(() => failOnce, { timeout: 10_000 }).toBe(false);
    await expect(notice(page, "Can't reach the bxvtt server")).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Waiting to rejoin as Sam' })).toBeVisible();
    await requests(ruth.page).getByRole('button', { name: 'Approve' }).click();
    await expect(page).toHaveURL(new RegExp(`${table.path}$`), { timeout: 15_000 });
  });

  test('a member who is online right now cannot be asked for', async ({ crew }) => {
    const table = await joinedTable(crew);
    const { ruth } = table;
    await closeBrowser(table);
    const visitor = await returningVisitor(crew, table);
    const page = visitor.page;
    await expect(candidates(page).getByRole('button', { name: 'Rejoin as Sam' })).toBeVisible();

    // Sam opens the table again in his old browser while the new one still offers him.
    const old = await crew.person('Sam in the old browser', { signedIn: false });
    await old.context.addInitScript(
      (identity) => localStorage.setItem('bxvtt.identity', identity),
      JSON.stringify({ token: table.samToken, user: table.samUser }),
    );
    await openTable(old.page, table.path);
    await expect(ruth.page.getByRole('img', { name: 'Sam, online' })).toBeVisible();

    crew.allowIssues(/409|Conflict/);
    await candidates(page).getByRole('button', { name: 'Rejoin as Sam' }).click();
    const online = notice(page, 'That member is at the table right now');
    await expect(online).toBeVisible();
    await expect(online).toContainText("If that's you in another browser, keep playing in that browser");
    await expect(requests(ruth.page)).toHaveCount(0);
    await screenshot(page, 'rejoin-member-online');

    // A fresh look at the invite link no longer offers Sam, so the page shows only the "new here" path.
    await page.reload();
    await expect(page.getByRole('heading', { name: "You're invited to a table" })).toBeVisible();
    await expect(page.getByRole('heading', { name: "I've played at this table before" })).toHaveCount(0);
  });

  test('the join page never offers the table’s only referee, and words the way back for anyone', async ({
    crew,
  }) => {
    // Ruth is the only member, and she is offline: nobody could let a visitor back in as her (R-501).
    const ruth = await crew.person('Ruth');
    const table = await ruth.client.createTable({ name: 'The bell tolls' });
    const stranger = await crew.person('Stranger', { signedIn: false });
    await stranger.page.goto(`/join/${table.invite_code}`);
    await expect(stranger.page.getByRole('heading', { name: "You're invited to a table" })).toBeVisible();
    await expect(
      stranger.page.getByRole('heading', { name: "I've played at this table before" }),
    ).toHaveCount(0);
    await expect(stranger.page.getByRole('button', { name: /^Rejoin as/ })).toHaveCount(0);

    // Once an offline player can be asked for, the section names only the player, and its text doesn't guess
    // why the browser forgot the visitor (R-109).
    const sam = await crew.person('Sam');
    await sam.client.joinTable(table.invite_code);
    await stranger.page.reload();
    await expect(
      stranger.page.getByRole('heading', { name: "I've played at this table before" }),
    ).toBeVisible();
    const offered = candidates(stranger.page).getByRole('button');
    await expect(offered).toHaveCount(1);
    await expect(offered).toHaveAccessibleName('Rejoin as Sam');
    await expect(stranger.page.getByText(/address changed/)).toHaveCount(0);
    await expect(
      stranger.page.getByText(
        /^If you played here in another browser or session, select your name to send a rejoin request\./,
      ),
    ).toBeVisible();
  });

  test('a request ends when the member comes back online elsewhere', async ({ crew }) => {
    const table = await joinedTable(crew);
    const { ruth } = table;
    await closeBrowser(table);
    const visitor = await returningVisitor(crew, table);
    const page = visitor.page;
    await askToComeBack(page);
    await expect(requests(ruth.page)).toContainText('Someone asked to rejoin as Sam');

    const old = await crew.person('Sam in the old browser', { signedIn: false });
    await old.context.addInitScript(
      (identity) => localStorage.setItem('bxvtt.identity', identity),
      JSON.stringify({ token: table.samToken, user: table.samUser }),
    );
    await openTable(old.page, table.path);
    // The request ends for the referee at once, and the visitor's next poll learns why.
    await expect(requests(ruth.page)).toHaveCount(0);
    const back = notice(page, 'Sam is back at the table or has left it');
    await expect(back).toBeVisible({ timeout: 15_000 });
    await expect(back).toContainText(
      "If you're signed in as Sam in another browser, keep playing in that browser",
    );
    await expectSeat(old.page);
  });

  test('the old browser says the player signed in from another browser', async ({ crew }) => {
    const table = await joinedTable(crew);
    const { ruth, sam } = table;
    // Sam's old browser keeps the table open but loses its connection, so the server counts him offline.
    let cut = false;
    const sockets: WebSocketRoute[] = [];
    await sam.page.routeWebSocket(/\/ws$/, (socket) => {
      if (cut) {
        void socket.close();
        return;
      }
      const server = socket.connectToServer();
      sockets.push(socket, server);
    });
    await sam.page.reload();
    await expectSeat(sam.page);
    crew.allowIssues(/WebSocket|ERR_CONNECTION|ERR_INTERNET_DISCONNECTED|401|Unauthorized/i);
    cut = true;
    for (const socket of sockets) await socket.close();
    await expect(sam.page.getByText(/Connection lost/).first()).toBeVisible({ timeout: 15_000 });
    await expect(ruth.page.getByRole('img', { name: 'Sam, offline' })).toBeVisible();

    const visitor = await returningVisitor(crew, table);
    await askToComeBack(visitor.page);
    await requests(ruth.page).getByRole('button', { name: 'Approve' }).click();
    await expect(visitor.page).toHaveURL(new RegExp(`${table.path}$`), { timeout: 15_000 });
    await expectSeat(visitor.page);

    // The old browser's connection comes back, and the server refuses its retired token.
    cut = false;
    await expect(sam.page.getByText('You signed in to this table from another browser')).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      sam.page.getByText(/A referee approved your rejoin request in another browser/),
    ).toBeVisible();
    await screenshot(sam.page, 'rejoin-old-browser');
  });

  test('the old browser, opened after the rejoin, says the player signed in elsewhere', async ({ crew }) => {
    const table = await joinedTable(crew);
    const { ruth } = table;
    await closeBrowser(table);
    const visitor = await returningVisitor(crew, table);
    await askToComeBack(visitor.page);
    await requests(ruth.page).getByRole('button', { name: 'Approve' }).click();
    await expect(visitor.page).toHaveURL(new RegExp(`${table.path}$`), { timeout: 15_000 });

    const old = await crew.person('Sam in the old browser', { signedIn: false });
    await old.context.addInitScript(
      (identity) => localStorage.setItem('bxvtt.identity', identity),
      JSON.stringify({ token: table.samToken, user: table.samUser }),
    );
    crew.allowIssues(/401|Unauthorized/);
    await old.page.goto(table.path);
    await expect(old.page.getByText('Choose your name to continue')).toHaveCount(0);
    await expect(old.page.getByText(/signed in to this table from another browser/)).toBeVisible();
  });
});
