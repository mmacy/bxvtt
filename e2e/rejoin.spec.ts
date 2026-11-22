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
 * Ruth makes a table and puts Osric on its roster. Sam opens the invite link in a browser with no identity,
 * picks his name, and joins. His character Brenna goes on the roster, and Ruth starts the game, so Brenna's seat
 * is Sam's.
 */
async function joinedTable(crew: Crew): Promise<RejoinTable> {
  const ruth = await crew.person('Ruth');
  const sam = await crew.person('Sam', { signedIn: false });
  const table = await ruth.client.createTable({ name: 'The bell tolls' });
  const osric = await createCharacter(ruth.client, { name: 'Osric', classId: 'cleric' });
  await ruth.client.addToRoster(table.id, osric.id);
  const path = `/tables/${table.id}`;
  await openTable(ruth.page, path);

  // Ruth is online, so nobody can come back in yet, and the page offers only the "new here" path.
  await sam.page.goto(`/join/${table.invite_code}`);
  await expect(sam.page.getByRole('heading', { name: "You're invited to a table" })).toBeVisible();
  await expect(sam.page.getByRole('heading', { name: "I've played at this table before" })).toHaveCount(0);
  await sam.page.getByRole('textbox', { name: 'Your name' }).fill('Sam');
  await sam.page.getByRole('button', { name: 'Join the table' }).click();
  await expect(sam.page).toHaveURL(new RegExp(`${path}$`));
  await expect(sam.page.getByRole('heading', { name: 'The bell tolls', level: 1 })).toBeVisible();

  const { token, user } = await storedIdentity(sam.page);
  const client = sdkClient(token);
  const brenna = await createCharacter(client, { name: 'Brenna', classId: 'fighter' });
  await client.addToRoster(table.id, brenna.id);
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

/** Expects the play screen to show Brenna as the viewer's own seat, and the viewer as the caller. */
async function expectSeat(page: Page): Promise<void> {
  await expect(page.getByRole('banner').getByText('In town', { exact: true })).toBeVisible();
  await page.getByRole('tablist', { name: 'Table panels' }).getByRole('tab', { name: 'Party' }).click();
  const order = page.getByRole('list', { name: 'Marching order' });
  await expect(order.getByRole('button', { name: /^Brenna\W+You\W+Level 1 fighter/ })).toBeVisible();
  await expect(order.getByRole('button', { name: /^Osric\W+Ruth\W/ })).toBeVisible();
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
  return page.getByRole('list', { name: 'Members who can come back in' });
}

/** Presses "Come back in as Sam" and expects the waiting screen. */
async function askToComeBack(page: Page): Promise<void> {
  await candidates(page).getByRole('button', { name: 'Come back in as Sam' }).click();
  await expect(
    page.getByRole('heading', { name: 'Waiting for a referee to let you in as Sam' }),
  ).toBeVisible();
  // The heading shows while the request is on its way too, so wait for the server's ticket.
  await expect(page.getByText(/Your request lasts until/)).toBeVisible();
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

/** The referee's prompt for requests to come back in. */
function requests(page: Page) {
  return page.getByRole('region', { name: 'Requests to come back in' });
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
    await expect(offered).toHaveAccessibleName('Come back in as Sam');
    await screenshot(page, 'rejoin-choose');
    await askToComeBack(page);
    await expect(page.getByText(/A referee is at the table now and sees your request/)).toBeVisible();
    await expect(page.getByText(/Your request lasts until .+\. Keep this page open\./)).toBeVisible();
    // While Sam waits, the page hides the "new here" path.
    await expect(page.getByRole('heading', { name: "I'm new here" })).toHaveCount(0);
    await screenshot(page, 'rejoin-waiting');

    const prompt = requests(ruth.page);
    await expect(prompt).toContainText('Someone is asking to come back in as Sam');
    await expect(prompt).toContainText("Let them in only if you know it's Sam");
    await screenshot(ruth.page, 'rejoin-referee-prompt');
    await prompt.getByRole('button', { name: 'Let them in' }).click();
    await expect(prompt).toHaveCount(0);

    // Sam lands on the play screen as the member he was, with Brenna's seat and the caller's role.
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
    expect(characters.items.map((character) => character.name)).toEqual(['Brenna']);

    // The feed says who let Sam back in.
    await page.getByRole('tablist', { name: 'Table panels' }).getByRole('tab', { name: /^Feed/ }).click();
    await expect(page.getByRole('region', { name: 'Feed entries' })).toContainText(
      'Ruth let Sam back into the table.',
    );
    expect((await ruth.client.listRejoinRequests(tableId)).items).toEqual([]);
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
    await prompt.getByRole('button', { name: 'Not now' }).click();
    await expect(prompt).toHaveCount(0);
    const refused = notice(page, "The referee didn't let you in as Sam");
    await expect(refused).toBeVisible({ timeout: 15_000 });
    await expect(refused).toContainText('If that was a mistake, ask the referee, and then ask again');
    // The "new here" path comes back, and Sam can ask again.
    await expect(page.getByRole('heading', { name: "I'm new here" })).toBeVisible();
    await screenshot(page, 'rejoin-declined');

    await askToComeBack(page);
    await expect(prompt).toContainText('Someone is asking to come back in as Sam');
    await page.getByRole('button', { name: 'Stop waiting' }).click();
    await expect(page.getByRole('heading', { name: "I've played at this table before" })).toBeVisible();
    await expect(page.getByRole('heading', { name: "I'm new here" })).toBeVisible();
    await expect(candidates(page).getByRole('button', { name: 'Come back in as Sam' })).toBeVisible();
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
    await expect(prompt).toContainText('Someone is asking to come back in as Sam');
    await page.getByRole('button', { name: 'Stop waiting' }).click();
    await expect(prompt).toHaveCount(0);
    await askToComeBack(page);
    await expect(notice(page, 'A request to come back in is already waiting')).toHaveCount(0);
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
    await candidates(second.page).getByRole('button', { name: 'Come back in as Pat' }).click();
    await expect(
      second.page.getByRole('heading', { name: 'Waiting for a referee to let you in as Pat' }),
    ).toBeVisible();
    await expect(second.page.getByText(/Your request lasts until/)).toBeVisible();
    await expect(requests(ruth.page)).toContainText('One more request is waiting.');
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
    await expect(
      page.getByRole('heading', { name: 'Waiting for a referee to let you in as Sam' }),
    ).toBeVisible();
    await requests(ruth.page).getByRole('button', { name: 'Let them in' }).click();
    await expect(page).toHaveURL(new RegExp(`${table.path}$`), { timeout: 15_000 });
  });

  test('a member who is online right now cannot be asked for', async ({ crew }) => {
    const table = await joinedTable(crew);
    const { ruth } = table;
    await closeBrowser(table);
    const visitor = await returningVisitor(crew, table);
    const page = visitor.page;
    await expect(candidates(page).getByRole('button', { name: 'Come back in as Sam' })).toBeVisible();

    // Sam opens the table again in his old browser while the new one still offers him.
    const old = await crew.person('Sam in the old browser', { signedIn: false });
    await old.context.addInitScript(
      (identity) => localStorage.setItem('bxvtt.identity', identity),
      JSON.stringify({ token: table.samToken, user: table.samUser }),
    );
    await openTable(old.page, table.path);
    await expect(ruth.page.getByRole('img', { name: 'Sam, online' })).toBeVisible();

    crew.allowIssues(/409|Conflict/);
    await candidates(page).getByRole('button', { name: 'Come back in as Sam' }).click();
    const online = notice(page, 'That member is at the table right now');
    await expect(online).toBeVisible();
    await expect(online).toContainText("If that's you in another browser, keep playing there");
    await expect(requests(ruth.page)).toHaveCount(0);
    await screenshot(page, 'rejoin-member-online');

    // A fresh look at the invite link no longer offers Sam, so the page shows only the "new here" path.
    await page.reload();
    await expect(page.getByRole('heading', { name: "You're invited to a table" })).toBeVisible();
    await expect(page.getByRole('heading', { name: "I've played at this table before" })).toHaveCount(0);
  });

  test('a request ends when the member comes back online elsewhere', async ({ crew }) => {
    const table = await joinedTable(crew);
    const { ruth } = table;
    await closeBrowser(table);
    const visitor = await returningVisitor(crew, table);
    const page = visitor.page;
    await askToComeBack(page);
    await expect(requests(ruth.page)).toContainText('Someone is asking to come back in as Sam');

    const old = await crew.person('Sam in the old browser', { signedIn: false });
    await old.context.addInitScript(
      (identity) => localStorage.setItem('bxvtt.identity', identity),
      JSON.stringify({ token: table.samToken, user: table.samUser }),
    );
    await openTable(old.page, table.path);
    // The request ends for the referee at once, and the visitor's next poll learns why.
    await expect(requests(ruth.page)).toHaveCount(0);
    const back = notice(page, 'Sam is back at the table, or has left it');
    await expect(back).toBeVisible({ timeout: 15_000 });
    await expect(back).toContainText('If you are that member in another browser, play on there');
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
    await requests(ruth.page).getByRole('button', { name: 'Let them in' }).click();
    await expect(visitor.page).toHaveURL(new RegExp(`${table.path}$`), { timeout: 15_000 });
    await expectSeat(visitor.page);

    // The old browser's connection comes back, and the server refuses its retired token.
    cut = false;
    await expect(sam.page.getByText("You've signed in to this table from another browser")).toBeVisible({
      timeout: 30_000,
    });
    await expect(sam.page.getByText(/A referee let you back in somewhere else/)).toBeVisible();
    await screenshot(sam.page, 'rejoin-old-browser');
  });

  test('the old browser, opened after the rejoin, says the player signed in elsewhere', async ({ crew }) => {
    const table = await joinedTable(crew);
    const { ruth } = table;
    await closeBrowser(table);
    const visitor = await returningVisitor(crew, table);
    await askToComeBack(visitor.page);
    await requests(ruth.page).getByRole('button', { name: 'Let them in' }).click();
    await expect(visitor.page).toHaveURL(new RegExp(`${table.path}$`), { timeout: 15_000 });

    const old = await crew.person('Sam in the old browser', { signedIn: false });
    await old.context.addInitScript(
      (identity) => localStorage.setItem('bxvtt.identity', identity),
      JSON.stringify({ token: table.samToken, user: table.samUser }),
    );
    crew.allowIssues(/401|Unauthorized/);
    await old.page.goto(table.path);
    await expect(old.page.getByText("This server doesn't know you yet")).toHaveCount(0);
    await expect(old.page.getByText(/signed in to this table from another browser/)).toBeVisible();
  });
});
