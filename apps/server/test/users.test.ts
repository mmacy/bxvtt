import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BxvttClient, isProblem } from '@bxvtt/shared/client';
import type { ChatEntry, SystemEntry } from '@bxvtt/shared/protocol';
import { BxapiProblem } from '../src/bxapi';
import type { TestConnection, TestServer, TestUser } from './helpers';
import {
  connect,
  createCharacter,
  createTable,
  createUser,
  findRefereeData,
  received,
  startServer,
  waitFor,
} from './helpers';

/** Every row of every table in the server's database that holds a string, as `table: row` text. */
function rowsContaining(server: TestServer, text: string): string[] {
  const { db } = server.server.ctx;
  const found: string[] = [];
  const names = db
    .all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .map((row) => String(row.name));
  for (const name of names) {
    for (const row of db.all(`SELECT * FROM "${name}"`)) {
      const json = JSON.stringify(row);
      if (json.includes(text)) found.push(`${name}: ${json}`);
    }
  }
  return found;
}

/** A client that sends a token the test kept, as a copy of the token in another place would. */
function clientWith(server: TestServer, token: string): BxvttClient {
  return new BxvttClient({ baseUrl: server.url, token });
}

describe('deleting a user', () => {
  let server: TestServer;
  let referee: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let tableId: string;
  let soloId: string;
  let leftId: string;
  let refereeWs: TestConnection;
  let aliceWs: TestConnection;
  let bobWs: TestConnection;
  const aliceCharacters: string[] = [];

  beforeAll(async () => {
    server = await startServer();
    referee = await createUser(server, 'Rhea');
    alice = await createUser(server, 'Alice');
    bob = await createUser(server, 'Bob');
    // Alice created the table she plays at, and then made Rhea its referee and stepped down.
    const created = await alice.client.createTable({ name: 'Barrow' });
    tableId = created.id;
    await referee.client.joinTable(created.invite_code);
    await bob.client.joinTable(created.invite_code);
    await alice.client.setMemberRole(tableId, referee.id, 'referee');
    await referee.client.setMemberRole(tableId, alice.id, 'player');
    // A table Alice has to herself, and a table she left before.
    soloId = (await alice.client.createTable({ name: 'Solitaire' })).id;
    const left = await createTable(referee, [alice], 'Old haunt');
    leftId = left.id;
    await alice.client.postFeed(leftId, { text: 'Goodbye, all.' });
    await alice.client.leaveTable(leftId);

    const brenna = await createCharacter(alice, 'Brenna', 'fighter', 11);
    const spare = await createCharacter(alice, 'Spare', 'thief', 12);
    aliceCharacters.push(brenna.id, spare.id);
    const tomas = await createCharacter(bob, 'Tomas', 'cleric', 13);
    await alice.client.addToRoster(tableId, brenna.id);
    await bob.client.addToRoster(tableId, tomas.id);
    await referee.client.startGame(tableId, { adventure_id: 'builtin-barrow', seed: 5 });

    await alice.client.postFeed(tableId, { text: 'Brenna checks her sword.' });
    await alice.client.postFeed(tableId, { text: 'Psst, Bob.', to: [bob.id] });
    await bob.client.postFeed(tableId, { text: 'Psst, Alice.', to: [alice.id] });
    await alice.client.createSave(tableId, 'Before the barrow');
    await alice.client.updateNotes(tableId, 'party', 'Brenna owes Tomas 5 gp.', 0);

    refereeWs = await connect(server, referee, tableId);
    aliceWs = await connect(server, alice, tableId);
    bobWs = await connect(server, bob, tableId);
  });

  afterAll(async () => {
    refereeWs.close();
    bobWs.close();
    await server.close();
  });

  it('refuses while the user is the only referee of a table with other members, and changes nothing', async () => {
    const error: unknown = await referee.client.deleteMe().catch((problem: unknown) => problem);
    expect(isProblem(error, 'last_referee')).toBe(true);
    expect(isProblem(error) && error.problem.detail).toContain('Barrow');
    expect((await referee.client.me()).id).toBe(referee.id);
    const table = await referee.client.getTable(tableId);
    expect(table.members.map((member) => member.user_id)).toContain(referee.id);
  });

  it('leaves every table, deletes the last-member table, and stops the token at once', async () => {
    const bobFrom = bobWs.messages.length;
    const closed = new Promise<string | undefined>((resolve) => {
      aliceWs.connection.onStatus((status, reason) => {
        if (status === 'closed') resolve(reason);
      });
    });
    await alice.client.deleteMe();

    expect(alice.client.getToken()).toBeNull();
    await expect(clientWith(server, alice.token).me()).rejects.toSatisfy((error) =>
      isProblem(error, 'unauthorized'),
    );
    expect(await closed).toBe('removed');
    expect(aliceWs.messages.at(-1)).toEqual({ type: 'removed', reason: 'left' });

    // The others hear that Alice left: the member list, presence, her empty seat, and the caller.
    await received(bobWs, 'table', (message) =>
      message.table.members.every((member) => member.user_id !== alice.id),
    );
    await received(bobWs, 'presence', (message) => !message.presence.online.includes(alice.id));
    const { game } = await received(
      bobWs,
      'game',
      (message) => message.game?.seats.every((seat) => seat.user_id !== alice.id) === true,
    );
    // The game keeps Brenna, and the referee controls her now.
    expect(game?.seats.find((seat) => seat.name === 'Brenna')?.user_id).toBeNull();
    expect(game?.caller_user_id).not.toBe(alice.id);

    const table = await referee.client.getTable(tableId);
    expect(table.members.map((member) => member.name)).toEqual(['Rhea', 'Bob']);
    // Alice created the table, so its first referee is its creator now.
    expect(table.created_by).toBe(referee.id);
    expect(server.server.ctx.db.get('SELECT 1 FROM tables WHERE id = ?', soloId)).toBeUndefined();

    // Nothing Bob received because of the deletion holds referee data.
    const texts = bobWs.messages.slice(bobFrom).map((message) => JSON.stringify(message));
    expect(findRefereeData(texts)).toEqual([]);
  });

  it('keeps what the user wrote in the feed, under an unassigned user ID', async () => {
    const feed = await bob.client.getFeed(tableId, { limit: 200 });
    const chats = feed.entries.filter((entry): entry is ChatEntry => entry.kind === 'chat');
    const said = chats.find((entry) => entry.text === 'Brenna checks her sword.');
    const whisperFrom = chats.find((entry) => entry.text === 'Psst, Bob.');
    const whisperTo = chats.find((entry) => entry.text === 'Psst, Alice.');
    expect(said?.user_id).toMatch(/^usr_/);
    expect(said?.user_id).not.toBe(alice.id);
    // Alice's messages at one table still share one author, so the feed groups them.
    expect(whisperFrom?.user_id).toBe(said?.user_id);
    expect(whisperFrom?.to).toEqual([bob.id]);
    expect(whisperTo?.user_id).toBe(bob.id);
    expect(whisperTo?.to).toEqual([said?.user_id]);
    const left = feed.entries.find(
      (entry): entry is SystemEntry => entry.kind === 'system' && entry.code === 'member_left',
    );
    expect(left?.params.user_id).toBe(said?.user_id);
    const members = (await referee.client.getTable(tableId)).members.map((member) => member.user_id);
    expect(members).not.toContain(said?.user_id);

    // The table Alice left before keeps her message too, under its own ID.
    const old = await referee.client.getFeed(leftId, { limit: 200 });
    const goodbye = old.entries.find((entry) => entry.kind === 'chat' && entry.text === 'Goodbye, all.');
    expect(goodbye?.user_id).toMatch(/^usr_/);
    expect(goodbye?.user_id).not.toBe(said?.user_id);

    const saves = await referee.client.listSaves(tableId);
    expect(saves.items.find((save) => save.label === 'Before the barrow')?.created_by).toBe(said?.user_id);
    expect((await bob.client.getNotes(tableId, 'party')).text).toBe('Brenna owes Tomas 5 gp.');
  });

  it('leaves no row that names the user, and deletes their stored characters from bxapi', async () => {
    expect(rowsContaining(server, alice.id)).toEqual([]);
    for (const id of aliceCharacters) {
      const error: unknown = await server.server.ctx.bxapi
        .get(`/v1/characters/${id}`)
        .catch((problem: unknown) => problem);
      expect(error instanceof BxapiProblem && error.code).toBe('not_found');
    }
  });
});

describe('deleting a user and rejoin requests', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('cancels a request to rejoin as the deleted user', async () => {
    const referee = await createUser(server, 'Rhea');
    const dan = await createUser(server, 'Dan');
    const table = await createTable(referee, [dan], 'Ford');
    const refereeWs = await connect(server, referee, table.id);
    const visitor = new BxvttClient({ baseUrl: server.url });
    const ticket = await visitor.requestRejoin(table.invite_code, dan.id);
    await received(refereeWs, 'rejoin_requests', (message) => message.requests.length === 1);
    await dan.client.deleteMe();
    await received(refereeWs, 'rejoin_requests', (message) => message.requests.length === 0);
    expect((await visitor.rejoinStatus(ticket.request_id, ticket.secret)).status).toBe('cancelled');
    refereeWs.close();
  });
});

describe('signing out', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('stops the token and closes its connections, and keeps the user, who can rejoin', async () => {
    const referee = await createUser(server, 'Rhea');
    const cara = await createUser(server, 'Cara');
    const table = await createTable(referee, [cara], 'Moor');
    const character = await createCharacter(cara, 'Wren', 'thief', 3);
    await cara.client.addToRoster(table.id, character.id);
    const ws = await connect(server, cara, table.id);
    const closed = new Promise<string | undefined>((resolve) => {
      ws.connection.onStatus((status, reason) => {
        if (status === 'closed') resolve(reason);
      });
    });
    await cara.client.signOut();
    expect(cara.client.getToken()).toBeNull();
    expect(await closed).toBe('auth_failed');
    await expect(clientWith(server, cara.token).me()).rejects.toSatisfy((error) =>
      isProblem(error, 'unauthorized'),
    );

    // Cara stays at the table with her character, and the rejoin flow offers her.
    const detail = await referee.client.getTable(table.id);
    expect(detail.members.map((member) => member.name)).toEqual(['Rhea', 'Cara']);
    expect(detail.roster.map((entry) => entry.name)).toEqual(['Wren']);
    await waitFor(() => !server.server.ctx.hub.presence(table.id).online.includes(cara.id));
    const lookup = await new BxvttClient({ baseUrl: server.url }).lookupRejoin(table.invite_code);
    expect(lookup.members.map((member) => member.name)).toEqual(['Cara']);
  });
});
