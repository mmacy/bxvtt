import { request as httpRequest } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isProblem } from '@bxvtt/shared/client';
import type { GameState, ServerMessage } from '@bxvtt/shared/protocol';
import { WS_CLOSE_CODES } from '@bxvtt/shared/protocol';
import type { TestServer, TestUser } from './helpers';
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

/** A raw HTTP response. */
interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/**
 * Sends a request with headers that `fetch` won't send, such as `Host`, and an unencoded path.
 *
 * @param server - The server.
 * @param path - The path, sent as is.
 * @param options - The method, headers, and body.
 */
function rawRequest(
  server: TestServer,
  path: string,
  options: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<RawResponse> {
  const url = new URL(server.url);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: url.hostname,
        port: url.port,
        path,
        method: options.method ?? 'GET',
        headers: options.headers,
        agent: false,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on('error', reject);
    if (options.body !== undefined) req.write(options.body);
    req.end();
  });
}

/** Opens a raw WebSocket and resolves when it opens. */
function openSocket(server: TestServer): Promise<{ socket: WebSocket; messages: ServerMessage[] }> {
  const socket = new WebSocket(server.wsUrl);
  const messages: ServerMessage[] = [];
  socket.addEventListener('message', (event) =>
    messages.push(JSON.parse(String(event.data)) as ServerMessage),
  );
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve({ socket, messages }));
    socket.addEventListener('error', () => reject(new Error('socket error')));
  });
}

/** Resolves with a socket's close code. */
function closeCode(socket: WebSocket): Promise<number> {
  if (socket.readyState === socket.CLOSED) return Promise.resolve(-1);
  return new Promise((resolve) => socket.addEventListener('close', (event) => resolve(event.code)));
}

/** Starts a one-member game of builtin-barrow for a referee and a player. */
async function startBarrow(
  server: TestServer,
  options: { classes?: string[]; seed?: number } = {},
): Promise<{ referee: TestUser; player: TestUser; tableId: string; game: GameState }> {
  const referee = await createUser(server, 'Ref');
  const player = await createUser(server, 'Player');
  const tableId = (await createTable(referee, [player])).id;
  const classes = options.classes ?? ['fighter'];
  for (const [index, classId] of classes.entries()) {
    const character = await createCharacter(player, `Hero${index}`, classId, options.seed ?? 1);
    await player.client.addToRoster(tableId, character.id);
  }
  const game = await referee.client.startGame(tableId, {
    adventure_id: 'builtin-barrow',
    seed: options.seed ?? 1,
  });
  return { referee, player, tableId, game };
}

describe('authorization across tables, roles, and seats', () => {
  let server: TestServer;
  let referee: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let outsider: TestUser;
  let tableId: string;
  let otherTableId: string;
  let otherSaveId: string;
  let otherAnnotationId: string;

  beforeAll(async () => {
    server = await startServer();
    referee = await createUser(server, 'Ref');
    alice = await createUser(server, 'Alice');
    bob = await createUser(server, 'Bob');
    outsider = await createUser(server, 'Outsider');
    tableId = (await createTable(referee, [alice, bob])).id;
    await alice.client.addToRoster(tableId, (await createCharacter(alice, 'Brenna', 'fighter', 3)).id);
    await bob.client.addToRoster(tableId, (await createCharacter(bob, 'Tomas', 'cleric', 4)).id);
    await referee.client.startGame(tableId, { adventure_id: 'builtin-barrow', seed: 3 });
    // The outsider runs a table of their own, with a save and an annotation.
    otherTableId = (await outsider.client.createTable({ name: 'Elsewhere' })).id;
    await outsider.client.addToRoster(
      otherTableId,
      (await createCharacter(outsider, 'Ost', 'fighter', 5)).id,
    );
    await outsider.client.startGame(otherTableId, { adventure_id: 'builtin-barrow', seed: 5 });
    otherSaveId = (await outsider.client.createSave(otherTableId, 'Theirs')).id;
    otherAnnotationId = (
      await outsider.client.createAnnotation(otherTableId, {
        kind: 'pin',
        dungeon_id: 'barrow',
        level_number: 1,
        x: 0,
        y: 0,
        text: 'secret pin',
        visibility: 'referees',
      })
    ).id;
  });

  afterAll(async () => {
    await server.close();
  });

  it('answers 404 to a non-member on every route that takes a table ID', async () => {
    const c = outsider.client;
    const calls: (() => Promise<unknown>)[] = [
      () => c.getTable(tableId),
      () => c.updateTable(tableId, { name: 'Mine' }),
      () => c.deleteTable(tableId),
      () => c.regenerateInviteCode(tableId),
      () => c.leaveTable(tableId),
      () => c.setMemberRole(tableId, outsider.id, 'referee'),
      () => c.removeMember(tableId, alice.id),
      () => c.listAdventures(tableId),
      () => c.getGame(tableId),
      () => c.endGame(tableId),
      () => c.sendCommand(tableId, { command_type: 'wait' }),
      () => c.listEvents(tableId),
      () => c.getRefereeState(tableId),
      () => c.getAdventureDocument(tableId),
      () => c.setSeat(tableId, 'character-0001', outsider.id),
      () => c.getDeclarations(tableId),
      () => c.declare(tableId, 'character-0001', { action: 'hold' }),
      () => c.resolveRound(tableId),
      () => c.listSaves(tableId),
      () => c.createSave(tableId),
      () => c.getFeed(tableId),
      () => c.postFeed(tableId, { text: 'hello' }),
      () => c.getAnnotations(tableId, { dungeon_id: 'barrow', level_number: 1 }),
      () => c.getNotes(tableId, 'party'),
      () => c.getNotes(tableId, 'referee'),
      () => c.updateNotes(tableId, 'party', 'x', 0),
      () => c.generate(tableId, 'monsters', { monster_id: 'goblin' }),
    ];
    for (const call of calls) {
      await expect(call()).rejects.toSatisfy((error) => isProblem(error, 'not_found'));
    }
  });

  it("refuses a member's request for another table's save or annotation", async () => {
    await expect(alice.client.renameSave(tableId, otherSaveId, 'Stolen')).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
    await expect(referee.client.restoreSave(tableId, otherSaveId)).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
    await expect(referee.client.exportSave(tableId, otherSaveId)).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
    await expect(referee.client.deleteSave(tableId, otherSaveId)).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
    await expect(referee.client.deleteAnnotation(tableId, otherAnnotationId)).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
  });

  it("refuses a player's command for another seat, whatever field names the member", async () => {
    // Bob tries to take Brenna's sword by giving it to his own member.
    await expect(
      bob.client.sendCommand(tableId, {
        command_type: 'give_items',
        character_id: 'character-0001',
        recipient_id: 'character-0002',
        item_ids: ['sword'],
      }),
    ).rejects.toSatisfy((error) => isProblem(error, 'forbidden'));
    // A declaration whose body names another member than the route.
    await expect(
      bob.client.declare(tableId, 'character-0002', { action: 'hold', character_id: 'character-0001' }),
    ).rejects.toSatisfy((error) => isProblem(error, 'validation_error'));
    // A command with a source, a referee command, the battle command, and an unknown command.
    await expect(
      alice.client.sendCommand(tableId, {
        command_type: 'enter_dungeon',
        dungeon_id: 'barrow',
        source: 'npc',
      }),
    ).rejects.toSatisfy((error) => isProblem(error, 'referee_required'));
    await expect(
      alice.client.sendCommand(tableId, {
        command_type: 'place_party',
        location: {
          kind: 'dungeon',
          dungeon_id: 'barrow',
          level_number: 1,
          position: [4, 0],
          facing: 'east',
        },
      }),
    ).rejects.toSatisfy((error) => isProblem(error, 'referee_command'));
    await expect(
      alice.client.sendCommand(tableId, { command_type: 'resolve_battle_round', declarations: [] }),
    ).rejects.toSatisfy((error) => isProblem(error, 'use_declarations'));
    await expect(alice.client.sendCommand(tableId, { command_type: 'GRANT_COINS' })).rejects.toSatisfy(
      (error) => isProblem(error, 'unknown_command'),
    );
  });

  it("refuses a player's referee tools and referee data", async () => {
    await expect(alice.client.setSeat(tableId, 'character-0002', alice.id)).rejects.toSatisfy((error) =>
      isProblem(error, 'referee_required'),
    );
    await expect(alice.client.setMemberRole(tableId, alice.id, 'referee')).rejects.toSatisfy((error) =>
      isProblem(error, 'referee_required'),
    );
    await expect(
      alice.client.updateTable(tableId, { settings: { caller_user_id: bob.id } }),
    ).rejects.toSatisfy((error) => isProblem(error, 'referee_required'));
    await expect(alice.client.listEvents(tableId, { visibility: 'referee' })).rejects.toSatisfy((error) =>
      isProblem(error, 'referee_required'),
    );
    await expect(alice.client.getNotes(tableId, 'referee')).rejects.toSatisfy((error) =>
      isProblem(error, 'referee_required'),
    );
    await expect(alice.client.postFeed(tableId, { text: '/roll 1d20', secret: true })).rejects.toSatisfy(
      (error) => isProblem(error, 'referee_required'),
    );
    await expect(
      alice.client.createAnnotation(tableId, {
        kind: 'pin',
        dungeon_id: 'barrow',
        level_number: 1,
        x: 0,
        y: 0,
        text: 'x',
        visibility: 'referees',
      }),
    ).rejects.toSatisfy((error) => isProblem(error, 'referee_required'));
    await expect(
      alice.client.generate(tableId, 'treasure', { treasure_type: 'A', tier: 'basic' }),
    ).rejects.toSatisfy((error) => isProblem(error, 'referee_required'));
    // Extra fields in a body are refused rather than stored.
    const response = await fetch(`${server.url}/api/tables/${tableId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${referee.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed', invite_code: 'AAAAA-AAAAA-AAAAA-AAAAA' }),
    });
    expect(response.status).toBe(422);
  });

  it('reads a character only for its owner or a referee of a roster that holds it', async () => {
    const table = await alice.client.getTable(tableId);
    const brenna = table.roster.find((entry) => entry.owner_user_id === alice.id)?.character_id ?? '';
    await expect(bob.client.getCharacter(brenna)).rejects.toSatisfy((error) => isProblem(error, 'not_found'));
    await expect(outsider.client.getCharacter(brenna)).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
    expect((await referee.client.getCharacter(brenna)).id).toBe(brenna);
    await expect(bob.client.deleteCharacter(brenna)).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
  });
});

describe('membership changes', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("changes the invite code when a referee removes a member, so the old code doesn't let them back in", async () => {
    const referee = await createUser(server, 'Ref');
    const mallory = await createUser(server, 'Mallory');
    const table = await createTable(referee, [mallory]);
    const seen = (await mallory.client.getTable(table.id)).invite_code;
    const after = await referee.client.removeMember(table.id, mallory.id);
    expect(after.invite_code).not.toBe(seen);
    await expect(mallory.client.joinTable(seen)).rejects.toSatisfy((error) =>
      isProblem(error, 'invite_invalid'),
    );
    await expect(mallory.client.getTable(table.id)).rejects.toSatisfy((error) =>
      isProblem(error, 'not_found'),
    );
  });

  it("closes a removed member's socket and a demoted referee's socket before either hears more", async () => {
    const { referee, player, tableId } = await startBarrow(server);
    const coRef = await createUser(server, 'Coref');
    await coRef.client.joinTable((await referee.client.getTable(tableId)).invite_code);
    await referee.client.setMemberRole(tableId, coRef.id, 'referee');
    const coWs = await connect(server, coRef, tableId);
    const playerWs = await connect(server, player, tableId);
    const first = await received(coWs, 'snapshot');
    expect(first.game?.referee).not.toBeNull();

    await referee.client.setMemberRole(tableId, coRef.id, 'player');
    const resnap = await received(coWs, 'snapshot', (m) => m.role === 'player');
    expect(resnap.game?.referee).toBeNull();
    const at = coWs.messages.indexOf(resnap);
    await referee.client.sendCommand(tableId, { command_type: 'record_note', text: 'Only for referees.' });
    await referee.client.postFeed(tableId, { text: '/roll secret 1d20' });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const afterDemotion = coWs.messages.slice(at).map((message) => JSON.stringify(message));
    expect(findRefereeData(afterDemotion, ['Only for referees.'])).toEqual([]);
    expect((await coRef.client.getGame(tableId)).referee).toBeNull();

    const closed = new Promise<string | undefined>((resolve) =>
      playerWs.connection.onStatus((status, reason) => {
        if (status === 'closed') resolve(reason);
      }),
    );
    await referee.client.removeMember(tableId, player.id);
    expect(await closed).toBe('removed');
    await expect(player.client.getFeed(tableId)).rejects.toSatisfy((error) => isProblem(error, 'not_found'));
    coWs.close();
  });
});

describe('map annotations and pings on levels the party has not mapped', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("keeps a referee's drawings and pings on an unmapped level from the players", async () => {
    const { referee, player, tableId, game } = await startBarrow(server);
    await player.client.sendCommand(
      tableId,
      { command_type: 'enter_dungeon', dungeon_id: 'barrow' },
      game.revision,
    );
    const playerWs = await connect(server, player, tableId);
    const refereeWs = await connect(server, referee, tableId);
    const level2 = { dungeon_id: 'barrow', level_number: 2 };
    await referee.client.createAnnotation(tableId, {
      kind: 'stroke',
      ...level2,
      points: [
        [0, 0],
        [1, 1],
      ],
      width: 0.2,
    });
    await referee.client.createAnnotation(tableId, {
      kind: 'pin',
      ...level2,
      x: 0,
      y: 0,
      text: 'Ambush here',
    });
    refereeWs.connection.sendPing({ ...level2, x: 1, y: 1 });
    await received(refereeWs, 'ping');
    // The referee still sees everything on the level.
    expect((await referee.client.getAnnotations(tableId, level2)).items).toHaveLength(2);
    expect((await player.client.getAnnotations(tableId, level2)).items).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const texts = playerWs.messages.map((message) => JSON.stringify(message));
    expect(texts.some((text) => text.includes('Ambush here'))).toBe(false);
    expect(playerWs.messages.some((message) => message.type === 'ping')).toBe(false);
    // A player can't draw on a level the party hasn't mapped, so no player can fill the table with levels.
    await expect(
      player.client.createAnnotation(tableId, {
        kind: 'pin',
        dungeon_id: 'nowhere',
        level_number: 9,
        x: 0,
        y: 0,
        text: 'x',
      }),
    ).rejects.toSatisfy((error) => isProblem(error, 'forbidden'));
    // The party's own level works as before.
    const mine = await player.client.createAnnotation(tableId, {
      kind: 'pin',
      dungeon_id: 'barrow',
      level_number: 1,
      x: 0,
      y: 0,
      text: 'We were here',
    });
    expect(
      (await player.client.getAnnotations(tableId, { dungeon_id: 'barrow', level_number: 1 })).items,
    ).toContainEqual(mine);
    playerWs.close();
    refereeWs.close();
  });
});

describe('treasure the party has not found', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('hides a lair hoard after the party evades its monsters, and refuses to hand it over', async () => {
    const { referee, player, tableId, game } = await startBarrow(server, {
      classes: ['thief', 'fighter'],
      seed: 1,
    });
    let state = (
      await player.client.sendCommand(
        tableId,
        { command_type: 'enter_dungeon', dungeon_id: 'barrow' },
        game.revision,
      )
    ).game;
    for (const direction of ['east', 'east']) {
      state = (
        await player.client.sendCommand(tableId, { command_type: 'move_party', direction }, state.revision)
      ).game;
    }
    expect(state.mode).toBe('encounter');
    const evaded = await player.client.sendCommand(tableId, { command_type: 'evade' }, state.revision);
    expect(evaded.accepted).toBe(true);
    expect(evaded.game.mode).toBe('exploring');
    const refereeState = (await referee.client.getRefereeState(tableId)) as unknown as {
      dungeon_state: { generated_caches: Record<string, unknown>; resolved_encounters: string[] };
    };
    const hoards = Object.keys(refereeState.dungeon_state.generated_caches);
    expect(hoards.length).toBeGreaterThan(0);
    expect(refereeState.dungeon_state.resolved_encounters).not.toContain('barrow:1:guard_room');
    const playerGame = await player.client.getGame(tableId);
    const shown = playerGame.scene.levels.flatMap((level) => level.caches.map((cache) => cache.id));
    for (const id of hoards) expect(shown).not.toContain(id);
    // Guessing the sequential cache ID doesn't help.
    for (const id of hoards) {
      const taken = await player.client.sendCommand(tableId, {
        command_type: 'take_treasure',
        feature_id: id,
      });
      expect(taken.accepted).toBe(false);
      expect(taken.rejections[0]?.code).toBe('exploration.feature.unknown');
    }
    const after = (await referee.client.getRefereeState(tableId)) as unknown as typeof refereeState;
    expect(Object.keys(after.dungeon_state.generated_caches)).toEqual(hoards);
  });

  it("doesn't reveal whether a cache is trapped when a thief tries to remove a trap nobody found", async () => {
    const { referee, player, tableId, game } = await startBarrow(server, { classes: ['thief'], seed: 2 });
    await player.client.sendCommand(
      tableId,
      { command_type: 'enter_dungeon', dungeon_id: 'barrow' },
      game.revision,
    );
    const placed = await referee.client.sendCommand(tableId, {
      command_type: 'place_party',
      location: { kind: 'dungeon', dungeon_id: 'barrow', level_number: 1, position: [4, 0], facing: 'east' },
    });
    expect(placed.accepted).toBe(true);
    const here = (await player.client.getGame(tableId)).scene.here;
    expect(here?.caches.map((cache) => cache.id)).toContain('idol_shrine');
    expect(here?.caches.find((cache) => cache.id === 'idol_shrine')?.trap).toBeNull();
    // The idol isn't trapped. A trapped cache whose trap nobody found answers trap.not_found, so this must too.
    const tried = await player.client.sendCommand(tableId, {
      command_type: 'remove_treasure_trap',
      character_id: 'character-0001',
      feature_id: 'idol_shrine',
    });
    expect(tried.accepted).toBe(false);
    expect(tried.rejections.map((rejection) => rejection.code)).toEqual(['exploration.trap.not_found']);
  });
});

describe('request handling', () => {
  let server: TestServer;
  let webDist: string;
  let user: TestUser;

  beforeAll(async () => {
    webDist = await mkdtemp(join(tmpdir(), 'bxvtt-web-'));
    await mkdir(join(webDist, 'assets'));
    await writeFile(join(webDist, 'index.html'), '<!doctype html><title>bxvtt</title>');
    server = await startServer({ webDist });
    user = await createUser(server, 'Prober');
  });

  afterAll(async () => {
    await server.close();
    await rm(webDist, { recursive: true, force: true });
  });

  it("doesn't let a Host header write directives into the Content Security Policy", async () => {
    const response = await rawRequest(server, '/', {
      headers: { Host: "evil.example; script-src * 'unsafe-inline'", Accept: 'text/html' },
    });
    const csp = String(response.headers['content-security-policy']);
    expect(csp).not.toContain('*');
    expect(csp.match(/script-src /g)).toHaveLength(1);
    const normal = await rawRequest(server, '/', {
      headers: { Host: 'table.example:8443', Accept: 'text/html' },
    });
    expect(String(normal.headers['content-security-policy'])).toContain('wss://table.example:8443');
  });

  it('sends HSTS only for a request that reached the tunnel over HTTPS', async () => {
    const plain = await rawRequest(server, '/api/health');
    expect(plain.headers['strict-transport-security']).toBeUndefined();
    const tunneled = await rawRequest(server, '/api/health', { headers: { 'X-Forwarded-Proto': 'https' } });
    expect(tunneled.headers['strict-transport-security']).toContain('max-age=');
  });

  it('treats a percent-encoded API path as the API path', async () => {
    const response = await rawRequest(server, '/%61pi/users/me', {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    const anonymous = await rawRequest(server, '/%61pi/tables');
    expect(anonymous.status).toBe(401);
  });

  it('answers a malformed URL with a problem document', async () => {
    const response = await rawRequest(server, '/api/rules/%E0%A4%A', {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ type: 'about:blank', code: 'bad_request' });
  });

  it('refuses a body that nests deeper than any request needs, instead of failing with a 500', async () => {
    const deep = '['.repeat(30_000) + ']'.repeat(30_000);
    const response = await rawRequest(server, '/api/characters/preview', {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
      body: `{"name":"Deep","class_id":"fighter","alignment":"lawful","x":${deep}}`,
    });
    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({ code: 'bad_request' });
  });

  it('refuses a display name with bidirectional control characters', async () => {
    await expect(createUser(server, 'Rhea‮admin')).rejects.toSatisfy((error) =>
      isProblem(error, 'validation_error'),
    );
  });

  it('keeps the rules cache under its byte budget', async () => {
    const small = await startServer({ quotas: { rulesCacheBytes: 64 * 1024 } });
    try {
      const prober = await createUser(small, 'Cacher');
      for (let offset = 0; offset < 40; offset += 1) {
        await prober.client.rules('monsters', { limit: 50, offset });
      }
      expect(small.server.ctx.rules.bytes).toBeLessThanOrEqual(64 * 1024);
    } finally {
      await small.close();
    }
  });
});

describe('rate limits and quotas', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer({
      hostKey: 'correct-horse',
      rateLimits: {
        userPosts: { capacity: 3, windowMs: 60_000 },
      },
      quotas: {
        savesPerTable: 2,
        tablesPerUser: 2,
        charactersPerUser: 2,
        connectionsPerUser: 2,
        pendingSocketsPerAddress: 3,
      },
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it('counts an IPv6 address by its /64 prefix', async () => {
    const limited = await startServer({ rateLimits: { createUser: { capacity: 3, windowMs: 60_000 } } });
    const create = (address: string) =>
      fetch(`${limited.url}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': address },
        body: JSON.stringify({ name: 'Rotator' }),
      });
    expect((await create('2001:db8:1:2::1')).status).toBe(201);
    expect((await create('2001:db8:1:2:ffff::2')).status).toBe(201);
    expect((await create('2001:0db8:0001:0002:0:0:0:3')).status).toBe(201);
    expect((await create('2001:db8:1:2::4')).status).toBe(429);
    expect((await create('2001:db8:1:3::1')).status).toBe(201);
    await limited.close();
  });

  it('stops guessing the host key after a few wrong tries, even with the right key', async () => {
    const guarded = await startServer({
      hostKey: 'correct-horse',
      rateLimits: { failedHostKey: { capacity: 2, windowMs: 60_000 } },
    });
    const guesser = await createUser(guarded, 'Guesser');
    for (const key of ['one', 'two']) {
      await expect(guesser.client.createTable({ name: 'T', host_key: key })).rejects.toSatisfy((error) =>
        isProblem(error, 'host_key_required'),
      );
    }
    await expect(guesser.client.createTable({ name: 'T', host_key: 'correct-horse' })).rejects.toSatisfy(
      (error) => isProblem(error, 'rate_limited'),
    );
    await guarded.close();
  });

  it('limits how fast one user posts to the feed', async () => {
    const referee = await createUser(server, 'Chatter');
    const table = await referee.client.createTable({ name: 'Chat', host_key: 'correct-horse' });
    for (let i = 0; i < 3; i += 1) await referee.client.postFeed(table.id, { text: `message ${i}` });
    await expect(referee.client.postFeed(table.id, { text: 'one too many' })).rejects.toSatisfy((error) =>
      isProblem(error, 'rate_limited'),
    );
  });

  it('caps tables, characters, and saves', async () => {
    const hoarder = await createUser(server, 'Hoarder');
    const first = await hoarder.client.createTable({ name: 'One', host_key: 'correct-horse' });
    await hoarder.client.createTable({ name: 'Two', host_key: 'correct-horse' });
    await expect(hoarder.client.createTable({ name: 'Three', host_key: 'correct-horse' })).rejects.toSatisfy(
      (error) => isProblem(error, 'forbidden'),
    );
    const hero = await createCharacter(hoarder, 'A');
    await createCharacter(hoarder, 'B');
    await expect(createCharacter(hoarder, 'C')).rejects.toSatisfy((error) => isProblem(error, 'forbidden'));
    await hoarder.client.addToRoster(first.id, hero.id);
    await hoarder.client.startGame(first.id, { adventure_id: 'builtin-barrow', seed: 1 });
    await hoarder.client.createSave(first.id, 'one');
    await hoarder.client.createSave(first.id, 'two');
    await expect(hoarder.client.createSave(first.id, 'three')).rejects.toSatisfy((error) =>
      isProblem(error, 'forbidden'),
    );
  });

  it('limits WebSocket connections per user, sockets waiting to authenticate, and resyncs', async () => {
    const referee = await createUser(server, 'Sockets');
    const table = await referee.client.createTable({ name: 'Sockets', host_key: 'correct-horse' });
    const auth = JSON.stringify({ type: 'auth', token: referee.token, table_id: table.id });
    const live: WebSocket[] = [];
    for (let i = 0; i < 2; i += 1) {
      const { socket, messages } = await openSocket(server);
      socket.send(auth);
      await waitFor(() => messages.some((message) => message.type === 'snapshot'));
      live.push(socket);
    }
    const third = await openSocket(server);
    const thirdClosed = closeCode(third.socket);
    third.socket.send(auth);
    expect(await thirdClosed).toBe(WS_CLOSE_CODES.rate_limited);

    // Resyncs are limited, because each one reads the game from bxapi.
    const { socket, messages } = await openSocket(server);
    live[0]?.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    socket.send(auth);
    await waitFor(() => messages.some((message) => message.type === 'snapshot'));
    for (let i = 0; i < 10; i += 1) socket.send(JSON.stringify({ type: 'resync' }));
    await waitFor(() =>
      messages.some((message) => message.type === 'error' && message.code === 'rate_limited'),
    );
    expect(messages.filter((message) => message.type === 'snapshot').length).toBeLessThanOrEqual(4);
    socket.close();
    for (const open of live) open.close();

    // Sockets that never authenticate count against their address.
    const pending = [];
    for (let i = 0; i < 3; i += 1) pending.push(await openSocket(server));
    const extra = new WebSocket(server.wsUrl);
    expect(await closeCode(extra)).toBe(WS_CLOSE_CODES.rate_limited);
    for (const entry of pending) entry.socket.close();
  });
});

describe('a game that fails to start halfway', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it('deletes the new bxapi session and leaves the table in its lobby', async () => {
    const referee = await createUser(server, 'Ref');
    const table = await referee.client.createTable({ name: 'Flaky' });
    await referee.client.addToRoster(table.id, (await createCharacter(referee, 'Solo')).id);
    const bxapi = server.server.ctx.bxapi;
    const created: string[] = [];
    const originalPost = bxapi.post.bind(bxapi);
    const originalGet = bxapi.get.bind(bxapi);
    bxapi.post = async <T>(path: string, body: unknown, options = {}) => {
      const result = await originalPost<T>(path, body, options);
      if (path === '/v1/sessions') created.push((result as { id: string }).id);
      return result;
    };
    bxapi.get = async <T>(path: string, query?: Record<string, string | number | boolean | undefined>) => {
      if (path.endsWith('/view')) throw new Error('simulated bxapi failure');
      return originalGet<T>(path, query);
    };
    try {
      await expect(
        referee.client.startGame(table.id, { adventure_id: 'builtin-barrow' }),
      ).rejects.toBeDefined();
    } finally {
      bxapi.post = originalPost;
      bxapi.get = originalGet;
    }
    expect(created).toHaveLength(1);
    expect((await referee.client.getTable(table.id)).phase).toBe('lobby');
    const lookup = await fetch(`${server.config.bxapiUrl}/v1/sessions/${created[0] ?? ''}`);
    expect(lookup.status).toBe(404);
  });
});
