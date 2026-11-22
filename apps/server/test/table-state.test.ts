import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BxvttClient, isProblem } from '@bxvtt/shared/client';
import type { FullCatalog, GameEntry, GameState } from '@bxvtt/shared/protocol';
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

describe('the game clock on feed entries, the entrance, and presence', () => {
  let server: TestServer;
  let referee: TestUser;
  let alice: TestUser;
  let tableId: string;
  let aliceWs: TestConnection;
  let game: GameState;

  beforeAll(async () => {
    server = await startServer();
    referee = await createUser(server, 'Rhea');
    alice = await createUser(server, 'Alice');
    tableId = (await createTable(referee, [alice])).id;
    const brenna = await createCharacter(alice, 'Brenna', 'fighter', 21);
    await alice.client.addToRoster(tableId, brenna.id);
  });

  afterAll(async () => {
    aliceWs.close();
    await server.close();
  });

  it('counts the members online in the table list', async () => {
    const before = (await referee.client.listTables()).items.find((item) => item.id === tableId);
    expect(before?.online_count).toBe(0);
    aliceWs = await connect(server, alice, tableId);
    const after = (await referee.client.listTables()).items.find((item) => item.id === tableId);
    expect(after).toMatchObject({ member_count: 2, online_count: 1 });
    game = await referee.client.startGame(tableId, { adventure_id: 'builtin-barrow', seed: 3 });
  });

  it('offers travel to town only on the entrance cell, and shows the entrance once seen', async () => {
    expect(game.scene.can_travel_to_town).toBe(false);
    const entered = await alice.client.sendCommand(
      tableId,
      { command_type: 'enter_dungeon', dungeon_id: 'barrow' },
      game.revision,
    );
    const here = entered.game.scene.here;
    expect(here?.at_entrance).toBe(true);
    expect(entered.game.scene.can_travel_to_town).toBe(true);
    const level = entered.game.scene.levels.find((candidate) => candidate.dungeon_id === 'barrow');
    expect(level?.entrance).toEqual(here?.position);
    const moved = await alice.client.sendCommand(
      tableId,
      { command_type: 'move_party', direction: 'east' },
      entered.revision,
    );
    expect(moved.game.scene.here?.at_entrance).toBe(false);
    expect(moved.game.scene.can_travel_to_town).toBe(false);
    expect(moved.game.scene.levels[0]?.entrance).toEqual(here?.position);
    // osrlib agrees: away from the entrance, travel_to_town is refused.
    const refused = await alice.client.sendCommand(
      tableId,
      { command_type: 'travel_to_town' },
      moved.revision,
    );
    expect(refused.rejections.map((rejection) => rejection.code)).toEqual([
      'exploration.travel.not_at_entrance',
    ]);
    game = moved.game;
  });

  it('records the game clock after each command on its feed entry', async () => {
    const entry = await received(
      aliceWs,
      'feed',
      (message) => message.entry.kind === 'game' && message.entry.revision === game.revision,
    );
    expect((entry.entry as GameEntry).clock_rounds).toBe(game.view.clock_rounds);
    const page = await alice.client.getFeed(tableId, { limit: 200 });
    const games = page.entries.filter((candidate): candidate is GameEntry => candidate.kind === 'game');
    expect(games.length).toBeGreaterThanOrEqual(2);
    for (const candidate of games) expect(typeof candidate.clock_rounds).toBe('number');
    const clocks = games.map((candidate) => candidate.clock_rounds ?? 0);
    expect([...clocks].sort((a, b) => a - b)).toEqual(clocks);
  });

  it('fills the clock of an older entry only where the server knows it', async () => {
    // Entries written before the server recorded clocks have none in their stored JSON.
    const db = server.server.ctx.db;
    for (const column of ['data_json', 'referee_json']) {
      db.run(
        `UPDATE feed SET ${column} = json_remove(${column}, '$.clock_rounds') WHERE table_id = ? AND kind = 'game'`,
        tableId,
      );
    }
    const page = await alice.client.getFeed(tableId, { limit: 200 });
    const games = page.entries.filter((candidate): candidate is GameEntry => candidate.kind === 'game');
    for (const candidate of games) {
      expect(candidate.clock_rounds).toBe(
        candidate.revision === game.revision ? game.view.clock_rounds : null,
      );
    }
  });

  it('sends a player no referee data', () => {
    const texts = [...alice.received, ...aliceWs.messages.map((message) => JSON.stringify(message))];
    expect(findRefereeData(texts)).toEqual([]);
  });

  it('drops a user from the online count when the socket closes', async () => {
    aliceWs.close();
    await waitFor(() => server.server.ctx.hub.presence(tableId).online.length === 0);
    const after = (await referee.client.listTables()).items.find((item) => item.id === tableId);
    expect(after?.online_count).toBe(0);
    aliceWs = await connect(server, alice, tableId);
  });
});

describe('whole rules catalogs', () => {
  let server: TestServer;
  let alice: TestUser;
  /** A client that doesn't copy each response, because the recording fetch can't tee a large body reliably. */
  let plain: BxvttClient;

  beforeAll(async () => {
    server = await startServer();
    alice = await createUser(server, 'Alice');
    plain = new BxvttClient({ baseUrl: server.url, token: alice.token });
  });

  afterAll(async () => {
    await server.close();
  });

  it('returns every full equipment entry, the same as the entry route', async () => {
    const catalog = await plain.fullCatalog('equipment');
    const list = await alice.client.rules<{ items: { id: string }[]; total: number }>('equipment', {
      limit: 200,
    });
    expect(catalog.catalog).toBe('equipment');
    expect(catalog.total).toBe(list.total);
    expect(catalog.items.map((item) => item.id)).toEqual(list.items.map((item) => item.id));
    const torch = catalog.items.find((item) => item.id === 'torch');
    expect(torch).toEqual(await alice.client.rules('equipment/torch'));
  });

  it('pages through a catalog longer than one bxapi page', async () => {
    const monsters = await plain.fullCatalog('monsters');
    expect(monsters.total).toBeGreaterThan(200);
    expect(monsters.items).toHaveLength(monsters.total);
    expect(new Set(monsters.items.map((monster) => monster.id)).size).toBe(monsters.total);
    expect(monsters.items.every((monster) => Array.isArray(monster.categories))).toBe(true);
    for (const name of ['classes', 'spells', 'magic-items'] as const) {
      const catalog: FullCatalog = await plain.fullCatalog(name);
      expect(catalog.items.length).toBe(catalog.total);
    }
  });

  it('answers with an ETag, a 304 for a matching If-None-Match, and gzip when asked', async () => {
    const headers = { Authorization: `Bearer ${alice.token}` };
    const identity = await fetch(`${server.url}/api/catalogs/spells`, {
      headers: { ...headers, 'Accept-Encoding': 'identity' },
    });
    expect(identity.status).toBe(200);
    expect(identity.headers.get('content-encoding')).toBeNull();
    expect(identity.headers.get('cache-control')).toBe('private, max-age=3600');
    const etag = identity.headers.get('etag') ?? '';
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
    const body = await identity.text();
    const again = await fetch(`${server.url}/api/catalogs/spells`, {
      headers: { ...headers, 'If-None-Match': etag },
    });
    expect(again.status).toBe(304);
    // Node's fetch decodes gzip by itself, so read the raw bytes with node:http.
    const { request } = await import('node:http');
    const raw = await new Promise<{ encoding: string | undefined; bytes: Buffer }>((resolve, reject) => {
      const req = request(
        `${server.url}/api/catalogs/spells`,
        { headers: { ...headers, 'Accept-Encoding': 'gzip, deflate' } },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () =>
            resolve({ encoding: response.headers['content-encoding'], bytes: Buffer.concat(chunks) }),
          );
        },
      );
      req.on('error', reject);
      req.end();
    });
    expect(raw.encoding).toBe('gzip');
    expect(raw.bytes.length).toBeLessThan(Buffer.byteLength(body));
    expect(gunzipSync(raw.bytes).toString('utf8')).toBe(body);
  });

  it('refuses a catalog it does not serve', async () => {
    await expect(plain.fullCatalog('languages' as 'classes')).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
  });
});
