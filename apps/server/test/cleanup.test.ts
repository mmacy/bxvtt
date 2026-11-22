import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isProblem } from '@bxvtt/shared/client';
import type { BxvttProblemError } from '@bxvtt/shared/client';
import type { Health } from '@bxvtt/shared/protocol';
import { BxapiProblem, BxapiUnreachable, toApiError } from '../src/bxapi';
import { ApiError } from '../src/errors';
import { storageWarning } from '../src/health';
import type { TestServer, TestUser } from './helpers';
import { createCharacter, createTable, createUser, startServer } from './helpers';

/** Whether bxapi still has a resource, asked directly. */
async function exists(server: TestServer, path: string): Promise<boolean> {
  try {
    await server.server.ctx.bxapi.get(path);
    return true;
  } catch (error) {
    if (error instanceof BxapiProblem && error.status === 404) return false;
    throw error;
  }
}

/** A small adventure document that bxapi accepts, for an upload. */
async function sampleDocument(server: TestServer, tableId: string, referee: TestUser): Promise<unknown> {
  const adventures = await referee.client.listAdventures(tableId);
  const builtin = adventures.items.find((item) => item.id === 'builtin-barrow');
  expect(builtin).toBeDefined();
  return server.server.ctx.bxapi.get('/v1/adventures/builtin-barrow/document');
}

describe('what bxvtt deletes in bxapi', () => {
  let server: TestServer;
  let referee: TestUser;

  beforeAll(async () => {
    server = await startServer();
    referee = await createUser(server, 'Rhea');
  });

  afterAll(async () => {
    await server.close();
  });

  async function playingTable(): Promise<{ tableId: string; sessionId: string }> {
    const tableId = (await createTable(referee, [])).id;
    const character = await createCharacter(referee, 'Brenna', 'fighter', 5);
    await referee.client.addToRoster(tableId, character.id);
    const game = await referee.client.startGame(tableId, { adventure_id: 'builtin-barrow', seed: 7 });
    return { tableId, sessionId: game.session_id };
  }

  it('deletes the session a restore replaced, and keeps every save restorable', async () => {
    const { tableId, sessionId } = await playingTable();
    const save = await referee.client.createSave(tableId, 'Before the barrow');
    const restored = await referee.client.restoreSave(tableId, save.id);
    expect(restored.session_id).not.toBe(sessionId);
    expect(await exists(server, `/v1/sessions/${sessionId}`)).toBe(false);
    expect(await exists(server, `/v1/sessions/${restored.session_id}`)).toBe(true);
    // The save outlives its session, so the table can restore it again.
    const again = await referee.client.restoreSave(tableId, save.id);
    expect(again.mode).toBe('town');
    expect(await exists(server, `/v1/sessions/${restored.session_id}`)).toBe(false);
  });

  it('deletes the session of a game a referee ends, and keeps its saves', async () => {
    const { tableId, sessionId } = await playingTable();
    const save = await referee.client.createSave(tableId);
    await referee.client.endGame(tableId);
    expect(await exists(server, `/v1/sessions/${sessionId}`)).toBe(false);
    expect(await exists(server, `/v1/saves/${save.id}`)).toBe(true);
    const resumed = await referee.client.restoreSave(tableId, save.id);
    expect(resumed.mode).toBe('town');
  });

  it("deletes a deleted table's sessions, saves, and uploaded adventures", async () => {
    const { tableId, sessionId } = await playingTable();
    const save = await referee.client.createSave(tableId);
    const document = (await sampleDocument(server, tableId, referee)) as Record<string, unknown>;
    const payload = document.payload as Record<string, unknown>;
    payload.name = 'An upload to delete';
    const upload = await referee.client.uploadAdventure(tableId, document as never);
    await referee.client.deleteTable(tableId);
    expect(await exists(server, `/v1/sessions/${sessionId}`)).toBe(false);
    expect(await exists(server, `/v1/saves/${save.id}`)).toBe(false);
    expect(await exists(server, `/v1/adventures/${upload.id}`)).toBe(false);
  });

  it("deletes a character its owner deletes, and keeps a character on a deleted table's roster", async () => {
    const kept = await createCharacter(referee, 'Kept', 'fighter', 6);
    const gone = await createCharacter(referee, 'Gone', 'fighter', 7);
    const tableId = (await createTable(referee, [])).id;
    await referee.client.addToRoster(tableId, kept.id);
    await referee.client.deleteTable(tableId);
    await referee.client.deleteCharacter(gone.id);
    expect(await exists(server, `/v1/characters/${gone.id}`)).toBe(false);
    expect(await exists(server, `/v1/characters/${kept.id}`)).toBe(true);
  });

  it('remembers a deletion that failed while bxapi was down, and finishes it later', async () => {
    const { tableId, sessionId } = await playingTable();
    const save = await referee.client.createSave(tableId);
    const bxapi = server.server.ctx.bxapi;
    const original = bxapi.request.bind(bxapi);
    bxapi.request = (async (method: string, path: string, options?: Parameters<typeof original>[2]) => {
      if (method === 'DELETE') throw new BxapiUnreachable('bxapi refused the connection.', false);
      return original(method, path, options);
    }) as typeof bxapi.request;
    try {
      await referee.client.deleteTable(tableId);
    } finally {
      bxapi.request = original as typeof bxapi.request;
    }
    expect(await exists(server, `/v1/sessions/${sessionId}`)).toBe(true);
    const garbage = server.server.ctx.db
      .all('SELECT kind, id FROM bxapi_garbage')
      .map((row) => String(row.id));
    expect(garbage).toEqual(expect.arrayContaining([sessionId, save.id]));
    expect(await server.server.ctx.janitor.sweep()).toBeGreaterThanOrEqual(2);
    expect(await exists(server, `/v1/sessions/${sessionId}`)).toBe(false);
    expect(await exists(server, `/v1/saves/${save.id}`)).toBe(false);
    expect(server.server.ctx.db.all('SELECT kind FROM bxapi_garbage')).toEqual([]);
  });

  it('sweeps up the old sessions an earlier server left behind, and never the current one', async () => {
    const ended = await playingTable();
    const current = await playingTable();
    // An earlier bxvtt kept the session when a game ended.
    server.server.ctx.db.run(
      'UPDATE tables SET session_id = NULL, game_json = NULL WHERE id = ?',
      ended.tableId,
    );
    await server.server.ctx.janitor.sweep();
    expect(await exists(server, `/v1/sessions/${ended.sessionId}`)).toBe(false);
    expect(await exists(server, `/v1/sessions/${current.sessionId}`)).toBe(true);
    expect((await referee.client.getGame(current.tableId)).session_id).toBe(current.sessionId);
  });
});

describe("bxapi's full storage", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer();
  });

  afterAll(async () => {
    await server.close();
  });

  const full = () =>
    new BxapiProblem(
      507,
      {
        code: 'storage_full',
        detail: 'full',
        status: 507,
        used_bytes: 1_073_741_900,
        max_bytes: 1_073_741_824,
      },
      null,
    );

  it('maps storage_full to its own problem with the figures, not to a busy bxapi', () => {
    const error = toApiError(full());
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: 'bxapi_storage_full',
      status: 507,
      extras: { used_bytes: 1_073_741_900, max_bytes: 1_073_741_824 },
    });
  });

  it('answers 507 bxapi_storage_full on routes that store something, and never retries a command', async () => {
    const referee = await createUser(server, 'Rhea');
    const tableId = (await createTable(referee, [])).id;
    const character = await createCharacter(referee, 'Brenna', 'fighter', 5);
    await referee.client.addToRoster(tableId, character.id);
    const game = await referee.client.startGame(tableId, { adventure_id: 'builtin-barrow', seed: 7 });
    const bxapi = server.server.ctx.bxapi;
    const original = bxapi.request.bind(bxapi);
    let commands = 0;
    bxapi.request = (async (method: string, path: string, options?: Parameters<typeof original>[2]) => {
      if (method === 'POST') {
        if (path.endsWith('/commands')) commands += 1;
        throw full();
      }
      return original(method, path, options);
    }) as typeof bxapi.request;
    try {
      const failed = await referee.client
        .sendCommand(tableId, { command_type: 'rest', kind: 'turn' }, game.revision)
        .catch((error: BxvttProblemError) => error);
      expect(isProblem(failed, 'bxapi_storage_full')).toBe(true);
      expect((failed as BxvttProblemError).problem).toMatchObject({
        status: 507,
        used_bytes: 1_073_741_900,
        max_bytes: 1_073_741_824,
      });
      expect(commands).toBe(1);
      await expect(createCharacter(referee, 'Wren', 'fighter', 8)).rejects.toSatisfy((error) =>
        isProblem(error, 'bxapi_storage_full'),
      );
      await expect(referee.client.createSave(tableId)).rejects.toSatisfy((error) =>
        isProblem(error, 'bxapi_storage_full'),
      );
    } finally {
      bxapi.request = original as typeof bxapi.request;
    }
  });

  it('gives a user the storage figures in the health check, and warns past 80 percent', async () => {
    const user = await createUser(server, 'Quinn');
    const health = await user.client.health();
    expect(health.bxapi.meta?.storage).toEqual({
      used_bytes: expect.any(Number),
      max_bytes: health.bxapi.meta?.storage.max_bytes,
    });
    const at = (used: number, max: number | null): Health => ({
      ...health,
      bxapi: {
        ...health.bxapi,
        meta: health.bxapi.meta && { ...health.bxapi.meta, storage: { used_bytes: used, max_bytes: max } },
      },
    });
    expect(storageWarning(at(700, 1000))).toBeNull();
    expect(storageWarning(at(850, 1000))).toMatch(/85 percent full/);
    expect(storageWarning(at(5_000, null))).toBeNull();
  });
});
