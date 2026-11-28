import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BxvttClient, isProblem, TableConnection } from '@bxvtt/shared/client';
import type { BxvttProblemError } from '@bxvtt/shared/client';
import type { ServerMessage } from '@bxvtt/shared/protocol';
import type { ServerOverrides, TestServer, TestUser } from './helpers';
import {
  BXAPI_URL,
  createCharacter,
  createTable,
  createUser,
  findRefereeData,
  startServer,
  waitFor,
} from './helpers';

/** The problem code an SDK call failed with. */
async function failure(call: Promise<unknown>): Promise<string> {
  const error = await call.then(
    () => null,
    (caught: unknown) => caught,
  );
  if (!isProblem(error)) throw new Error(`expected a problem, got ${String(error)}`);
  return (error as BxvttProblemError).problem.code;
}

/** A user's SDK client for another server on the same data directory. */
function clientOf(server: TestServer, user: TestUser): BxvttClient {
  return new BxvttClient({ baseUrl: server.url, token: user.token });
}

/**
 * Opens a table connection and records what arrives until a snapshot or an error arrives, and why the
 * connection stopped, if it did. The connection reconnects quickly, as a browser does after a `resync` close.
 */
async function firstAnswer(
  server: TestServer,
  user: TestUser,
  tableId: string,
): Promise<{ messages: ServerMessage[]; closed: () => string | null; close: () => void }> {
  const connection = new TableConnection({
    url: server.wsUrl,
    token: user.token,
    tableId,
    reconnectInitialMs: 50,
    reconnectMaxMs: 200,
  });
  const messages: ServerMessage[] = [];
  let reason: string | null = null;
  connection.onAny((message) => messages.push(message));
  connection.onStatus((status, why) => {
    if (status === 'closed') reason = why ?? null;
  });
  connection.connect();
  await waitFor(() => messages.some((message) => message.type === 'snapshot' || message.type === 'error'));
  return { messages, closed: () => reason, close: () => connection.close() };
}

/**
 * A table whose game bxapi can no longer load (#24). The first server starts the game and stops. The test then
 * either deletes the session from bxapi, which never ends, or points the next server at a bxapi that doesn't
 * answer, which ends when bxapi comes back.
 */
describe('a table whose game cannot be loaded', () => {
  let dataDir: string;
  let referee: TestUser;
  let alice: TestUser;
  let tableId: string;
  let sessionId: string;
  let servers: TestServer[];

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'bxvtt-lost-'));
    servers = [];
    const first = await startServer({ dataDir });
    referee = await createUser(first, 'Rhea');
    alice = await createUser(first, 'Alice');
    const table = await createTable(referee, [alice]);
    tableId = table.id;
    const brenna = await createCharacter(alice, 'Brenna', 'fighter', 21);
    await alice.client.addToRoster(tableId, brenna.id);
    const game = await referee.client.startGame(tableId, { adventure_id: 'builtin-barrow', seed: 3 });
    sessionId = game.session_id;
    await first.close({ keepInBxapi: true });
  });

  afterEach(async () => {
    for (const server of servers) await server.close({ keepInBxapi: true });
    // A server that reaches bxapi deletes what the tables left there, then the directory goes.
    const cleaner = await startServer({ dataDir });
    await cleaner.server.ctx.janitor.sweep();
    await cleaner.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  async function restart(overrides: ServerOverrides = {}): Promise<TestServer> {
    const server = await startServer({ dataDir, ...overrides });
    servers.push(server);
    return server;
  }

  async function deleteSession(): Promise<void> {
    const response = await fetch(`${BXAPI_URL}/v1/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
    expect(response.status).toBe(204);
  }

  it('tells every member the game is gone, and says so in the table list', async () => {
    await deleteSession();
    const server = await restart();
    const refereeAnswer = await firstAnswer(server, referee, tableId);
    const playerAnswer = await firstAnswer(server, alice, tableId);
    for (const answer of [refereeAnswer, playerAnswer]) {
      expect(answer.messages.some((m) => m.type === 'snapshot')).toBe(false);
      expect(answer.messages).toContainEqual(
        expect.objectContaining({ type: 'error', code: 'game_missing' }),
      );
      // The client stops reconnecting, because waiting never brings the game back.
      await waitFor(() => answer.closed() === 'game_missing');
      answer.close();
    }
    const texts = playerAnswer.messages.map((message) => JSON.stringify(message));
    expect(findRefereeData(texts)).toEqual([]);
    expect(await failure(clientOf(server, alice).getGame(tableId))).toBe('game_missing');
    const listed = (await clientOf(server, alice).listTables()).items.find((item) => item.id === tableId);
    expect(listed?.game?.missing).toBe(true);
    expect((await clientOf(server, referee).getTable(tableId)).game?.missing).toBe(true);
  });

  it('lets a player leave and a referee delete it, which frees a place in the table limit', async () => {
    await deleteSession();
    const server = await restart({ quotas: { tablesPerUser: 1 } });
    const rhea = clientOf(server, referee);
    expect(await failure(rhea.createTable({ name: 'Another' }))).toBe('forbidden');
    await clientOf(server, alice).leaveTable(tableId);
    expect((await clientOf(server, alice).listTables()).items).toEqual([]);
    await rhea.deleteTable(tableId);
    expect((await rhea.listTables()).items).toEqual([]);
    // bxapi had no session to delete, so nothing waits to be tried again.
    expect(server.server.ctx.db.all("SELECT id FROM bxapi_garbage WHERE kind = 'session'")).toEqual([]);
    const another = await rhea.createTable({ name: 'Another' });
    expect(another.name).toBe('Another');
  });

  it('lets a referee end the game, which returns the table to its lobby', async () => {
    await deleteSession();
    const server = await restart();
    const rhea = clientOf(server, referee);
    expect(await failure(rhea.getGame(tableId))).toBe('game_missing');
    await rhea.endGame(tableId);
    const table = await rhea.getTable(tableId);
    expect(table.phase).toBe('lobby');
    expect(table.game).toBeNull();
    const answer = await firstAnswer(server, alice, tableId);
    expect(answer.messages.some((m) => m.type === 'snapshot')).toBe(true);
    answer.close();
  });

  it('opens the lobby after a full reset of bxapi, where the referee can delete the table', async () => {
    // A save first, so the reset takes the session, the save, and the roster's character.
    const before = await restart();
    const save = await clientOf(before, referee).createSave(tableId, 'Before the reset');
    const characterId = (await clientOf(before, referee).getTable(tableId)).roster[0]?.character_id ?? '';
    await before.close({ keepInBxapi: true });
    servers = servers.filter((server) => server !== before);
    await deleteSession();
    for (const path of [`/v1/saves/${save.id}`, `/v1/characters/${characterId}`]) {
      expect((await fetch(`${BXAPI_URL}${path}`, { method: 'DELETE' })).status).toBe(204);
    }

    const server = await restart();
    const rhea = clientOf(server, referee);
    expect(await failure(rhea.getGame(tableId))).toBe('game_missing');
    await rhea.endGame(tableId);
    // The lobby opens: its snapshot, the adventures, the saves, and the characters all answer.
    const answer = await firstAnswer(server, referee, tableId);
    const snapshot = answer.messages.find((m) => m.type === 'snapshot');
    expect(snapshot?.type === 'snapshot' && snapshot.table.phase).toBe('lobby');
    answer.close();
    expect((await rhea.listAdventures(tableId)).items.length).toBeGreaterThan(0);
    expect((await rhea.listSaves(tableId)).items.map((item) => item.id)).toContain(save.id);
    await rhea.listCharacters();
    await rhea.deleteTable(tableId);
    expect((await rhea.listTables()).items).toEqual([]);
  });

  it('notices a game that goes missing while the server holds it', async () => {
    const server = await restart();
    const rhea = clientOf(server, referee);
    const game = await rhea.getGame(tableId);
    const open = await firstAnswer(server, alice, tableId);
    expect(open.messages.some((m) => m.type === 'snapshot')).toBe(true);
    await deleteSession();
    expect(
      await failure(
        rhea.sendCommand(tableId, { command_type: 'enter_dungeon', dungeon_id: 'barrow' }, game.revision),
      ),
    ).toBe('game_missing');
    expect((await rhea.getTable(tableId)).game?.missing).toBe(true);
    expect(await failure(rhea.getGame(tableId))).toBe('game_missing');
    // Alice's open screen reconnects and hears why the game can't load.
    await waitFor(() => open.messages.some((m) => m.type === 'error' && m.code === 'game_missing'));
    open.close();
  });

  it('clears the note when bxapi has the game again, as after the host restores its data', async () => {
    const server = await restart();
    const tables = server.server.ctx.tables;
    const game = tables.game(tableId);
    if (game === null) throw new Error('The game did not start.');
    // The note from a time bxapi didn't have the session, which bxapi has again now.
    tables.setGame(tableId, { sessionId, record: { ...game.record, missing: true } });
    expect((await clientOf(server, alice).getTable(tableId)).game?.missing).toBe(true);
    const back = await firstAnswer(server, alice, tableId);
    expect(back.messages.some((m) => m.type === 'snapshot')).toBe(true);
    back.close();
    expect((await clientOf(server, alice).getTable(tableId)).game?.missing).toBe(false);
  });

  it('keeps trying while bxapi is unreachable, and the table can still be left or deleted', async () => {
    const offline = await restart({ bxapiUrl: 'http://127.0.0.1:1' });
    const answer = await firstAnswer(offline, alice, tableId);
    expect(answer.messages).toContainEqual(
      expect.objectContaining({ type: 'error', code: 'bxapi_unavailable' }),
    );
    answer.close();
    expect((await clientOf(offline, alice).getTable(tableId)).game?.missing).toBe(false);
    await clientOf(offline, alice).leaveTable(tableId);
    await clientOf(offline, referee).deleteTable(tableId);
    expect((await clientOf(offline, referee).listTables()).items).toEqual([]);
    // The deletions bxapi didn't answer wait in the server's list, so the cleaner deletes them later.
    expect(
      offline.server.ctx.db.all("SELECT id FROM bxapi_garbage WHERE kind = 'session'").map((row) => row.id),
    ).toContain(sessionId);
  });

  it('opens again when bxapi comes back', async () => {
    const offline = await restart({ bxapiUrl: 'http://127.0.0.1:1' });
    const answer = await firstAnswer(offline, alice, tableId);
    expect(answer.messages).toContainEqual(
      expect.objectContaining({ type: 'error', code: 'bxapi_unavailable' }),
    );
    answer.close();
    await offline.close({ keepInBxapi: true });
    servers = servers.filter((server) => server !== offline);
    const online = await restart();
    const back = await firstAnswer(online, alice, tableId);
    expect(back.messages.some((m) => m.type === 'snapshot')).toBe(true);
    back.close();
  });
});
