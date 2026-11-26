import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BxvttClient, isProblem, TableConnection } from '@bxvtt/shared/client';
import type { BxvttProblemError } from '@bxvtt/shared/client';
import type { Health, ServerMessage } from '@bxvtt/shared/protocol';
import { MIN_ENGINE_VERSION, versionAtLeast } from '../src/health';
import type { TestServer, TestUser } from './helpers';
import { createCharacter, createTable, createUser, recordBxapi, startServer } from './helpers';

/**
 * Makes the test server's bxapi client report another engine version from `/v1/meta`, and leaves every other
 * call alone.
 *
 * @param server - The test server.
 * @returns A function that sets the version, or `null` for bxapi's own.
 */
function stubEngine(server: TestServer): (version: string | null) => void {
  const bxapi = server.server.ctx.bxapi;
  const original = bxapi.request.bind(bxapi);
  let engine: string | null = null;
  bxapi.request = (async (method: string, path: string, options?: Parameters<typeof original>[2]) => {
    const result = await original(method, path, options);
    if (engine !== null && method === 'GET' && path === '/v1/meta') {
      return { ...(result as Record<string, unknown>), engine_version: engine };
    }
    return result;
  }) as typeof bxapi.request;
  return (version) => {
    engine = version;
  };
}

/** Reads the health with a user's token, so it has the cause of a problem. */
async function healthFor(server: TestServer, user: TestUser): Promise<Health> {
  const response = await fetch(`${server.url}/api/health`, {
    headers: { Authorization: `Bearer ${user.token}` },
  });
  return (await response.json()) as Health;
}

describe('comparing engine versions', () => {
  it('passes 2.9.0 and every later version, and fails older or unreadable ones', () => {
    for (const version of ['2.9.0', '2.9', '2.9.1', '2.10.0', '3.0.0', '10.0.0']) {
      expect(versionAtLeast(version, MIN_ENGINE_VERSION), version).toBe(true);
    }
    for (const version of ['2.8.0', '2.8.99', '1.9.9', '2.9.0rc1', 'v2.9.0', '', 'unknown']) {
      expect(versionAtLeast(version, MIN_ENGINE_VERSION), version).toBe(false);
    }
  });
});

describe('a bxapi whose engine is older than 2.9.0', () => {
  let server: TestServer;
  let setEngine: (version: string | null) => void;
  let referee: TestUser;
  let alice: TestUser;
  let tableId: string;

  beforeAll(async () => {
    server = await startServer();
    setEngine = stubEngine(server);
    referee = await createUser(server, 'Rhea');
    alice = await createUser(server, 'Alice');
    tableId = (await createTable(referee, [alice])).id;
    const fighter = await createCharacter(alice, 'Brenna', 'fighter', 11);
    await alice.client.addToRoster(tableId, fighter.id);
    await referee.client.startGame(tableId, { adventure_id: 'builtin-barrow', seed: 7 });
  });

  afterAll(async () => {
    setEngine(null);
    await server.close();
  });

  it('passes the health check for 2.9.0, 2.10.0, and 3.0.0', async () => {
    for (const version of ['2.9.0', '2.10.0', '3.0.0']) {
      setEngine(version);
      const health = await healthFor(server, alice);
      expect(health, version).toMatchObject({
        status: 'ok',
        bxapi: { reachable: true, outdated: false, error: null },
      });
      const sent = await alice.client.sendCommand(tableId, { command_type: 'rest', kind: 'night' });
      expect(sent.accepted, version).toBe(true);
    }
  });

  it('reports an older engine as degraded, with the cause for a signed-in user only', async () => {
    setEngine('2.8.0');
    const health = await healthFor(server, alice);
    expect(health.status).toBe('degraded');
    expect(health.bxapi.reachable).toBe(true);
    expect(health.bxapi.outdated).toBe(true);
    expect(health.bxapi.error).toBe(
      'bxapi runs osrlib 2.8.0, and bxvtt needs 2.9.0 or later. If you host this server, update bxapi and restart it. Otherwise, ask the server host to update it.',
    );
    const anonymous = await new BxvttClient({ baseUrl: server.url }).health();
    expect(anonymous.status).toBe('degraded');
    expect(anonymous.bxapi.meta).toBeNull();
    // The flag reveals no version, so an anonymous reader gets it too.
    expect(anonymous.bxapi.outdated).toBe(true);
    expect(anonymous.bxapi.error).toBe(
      "The game service isn't set up correctly. Ask the server host to fix it.",
    );
  });

  it('refuses a command, a declaration, an ability roll, and a preview with bxapi_outdated, and sends bxapi nothing', async () => {
    setEngine('2.8.0');
    await healthFor(server, alice);
    const recorder = recordBxapi(server);
    try {
      const command = await alice.client
        .sendCommand(tableId, { command_type: 'rest', kind: 'night' })
        .catch((error: BxvttProblemError) => error);
      expect(isProblem(command, 'bxapi_outdated')).toBe(true);
      expect((command as BxvttProblemError).status).toBe(503);
      const declaration = await alice.client
        .declare(tableId, 'character-0001', { action: 'hold' })
        .catch((error: BxvttProblemError) => error);
      expect(isProblem(declaration, 'bxapi_outdated')).toBe(true);
      const roll = await alice.client.rollAbilities(tableId).catch((error: BxvttProblemError) => error);
      expect(isProblem(roll, 'bxapi_outdated')).toBe(true);
      const preview = await alice.client
        .previewCharacter({ name: 'Wren', class_id: 'fighter', alignment: 'lawful', seed: 3 })
        .catch((error: BxvttProblemError) => error);
      expect(isProblem(preview, 'bxapi_outdated')).toBe(true);
      expect(recorder.calls.filter((call) => call.method === 'POST')).toEqual([]);
      // A browser that connects gets the same code, and no game state.
      const connection = new TableConnection({
        url: server.wsUrl,
        token: alice.token,
        tableId,
        reconnectInitialMs: 5000,
        reconnectMaxMs: 5000,
      });
      const messages: ServerMessage[] = [];
      connection.onAny((message) => messages.push(message));
      const failed = connection.next('error', () => true, 5000);
      connection.connect();
      try {
        expect(await failed).toMatchObject({ code: 'bxapi_outdated' });
        expect(messages.some((message) => message.type === 'snapshot')).toBe(false);
      } finally {
        connection.close();
      }
    } finally {
      recorder.stop();
    }
  });

  it('serves games again once the health check finds a new enough engine', async () => {
    setEngine('2.9.0');
    await healthFor(server, alice);
    const sent = await alice.client.sendCommand(tableId, { command_type: 'rest', kind: 'night' });
    expect(sent.accepted).toBe(true);
  });
});
