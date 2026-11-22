import { request as httpRequest } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BxvttClient, isProblem, TableConnection } from '@bxvtt/shared/client';
import { WS_CLOSE_CODES } from '@bxvtt/shared/protocol';
import type { TestServer } from './helpers';
import { createUser, startServer } from './helpers';

/**
 * Sends a WebSocket handshake with an `Origin` header and reports the status: 101 when the server upgrades.
 *
 * @param server - The server.
 * @param origin - The `Origin` header, or `undefined` for none.
 */
function handshake(server: TestServer, origin: string | undefined): Promise<number> {
  const url = new URL(server.wsUrl.replace('ws:', 'http:'));
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      host: url.hostname,
      port: url.port,
      path: url.pathname,
      agent: false,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        ...(origin === undefined ? {} : { Origin: origin }),
      },
    });
    req.on('upgrade', (response, socket) => {
      socket.destroy();
      resolve(response.statusCode ?? 0);
    });
    req.on('response', (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
}

describe('users and authentication', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer({ hostKey: 'host-secret-key', publicOrigins: ['https://table.example'] });
  });

  afterAll(async () => {
    await server.close();
  });

  it('creates a user with a palette color and a token', async () => {
    const client = new BxvttClient({ baseUrl: server.url });
    const created = await client.createUser('  Morgan  ');
    expect(created.user.name).toBe('Morgan');
    expect(created.user.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(created.token).toMatch(/^bxt_/);
    expect(await client.me()).toEqual(created.user);
    const updated = await client.updateMe({ name: 'Morgana', color: '#009e73' });
    expect(updated).toMatchObject({ name: 'Morgana', color: '#009e73' });
    await expect(client.updateMe({ color: '#123456' as '#009e73' })).rejects.toSatisfy((error) =>
      isProblem(error, 'validation_error'),
    );
    await expect(client.createUser('a\u0007b')).rejects.toSatisfy((error) =>
      isProblem(error, 'validation_error'),
    );
  });

  it('requires a bearer token on every route except health, user creation, and the visitor rejoin routes', async () => {
    const anonymous = new BxvttClient({ baseUrl: server.url });
    expect((await anonymous.health()).bxapi.reachable).toBe(true);
    for (const call of [
      () => anonymous.me(),
      () => anonymous.listTables(),
      () => anonymous.rules('classes'),
      () => anonymous.listCharacters(),
      () => anonymous.listRejoinRequests('tbl_aaaaaaaaaaaaaaaaaaaaaa'),
      () => anonymous.approveRejoin('tbl_aaaaaaaaaaaaaaaaaaaaaa', 'rjn_x'),
    ]) {
      await expect(call()).rejects.toSatisfy((error) => isProblem(error, 'unauthorized'));
    }
    const forged = new BxvttClient({ baseUrl: server.url, token: 'bxt_not-a-real-token' });
    await expect(forged.me()).rejects.toSatisfy((error) => isProblem(error, 'unauthorized'));
  });

  it('answers with problem documents and stable codes', async () => {
    const user = await createUser(server, 'Quinn');
    const response = await fetch(`${server.url}/api/tables`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'text/plain' },
      body: 'hello',
    });
    expect(response.status).toBe(415);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect((await response.json()) as object).toMatchObject({
      type: 'about:blank',
      code: 'unsupported_media_type',
      status: 415,
    });
    const broken = await fetch(`${server.url}/api/tables`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
      body: '{"name":',
    });
    expect(((await broken.json()) as { code: string }).code).toBe('bad_request');
    const huge = await fetch(`${server.url}/api/tables`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x'.repeat(70_000) }),
    });
    expect(huge.status).toBe(413);
    expect(((await huge.json()) as { code: string }).code).toBe('content_too_large');
    const missing = await fetch(`${server.url}/api/nothing-here`, {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(((await missing.json()) as { code: string }).code).toBe('not_found');
    expect(missing.headers.get('x-request-id')).toMatch(/^req_/);
    expect(missing.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('needs the host key to create a table, and no key to join one', async () => {
    const host = await createUser(server, 'Host');
    const guest = await createUser(server, 'Guest');
    await expect(host.client.createTable({ name: 'No key' })).rejects.toSatisfy((error) =>
      isProblem(error, 'host_key_required'),
    );
    await expect(host.client.createTable({ name: 'Wrong key', host_key: 'nope' })).rejects.toSatisfy(
      (error) => isProblem(error, 'host_key_required'),
    );
    const table = await host.client.createTable({ name: 'Keyed', host_key: 'host-secret-key' });
    expect(table.invite_code).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){3}$/);
    const joined = await guest.client.joinTable(table.invite_code.toLowerCase().replaceAll('-', ''));
    expect(joined.members.map((member) => member.user_id)).toContain(guest.id);
  });

  it('authenticates the WebSocket with the first message, not the URL', async () => {
    const referee = await createUser(server, 'Wsref');
    const outsider = await createUser(server, 'Outsider');
    const table = await referee.client.createTable({ name: 'Sockets', host_key: 'host-secret-key' });
    const closed = (token: string) =>
      new Promise<string | undefined>((resolve) => {
        const connection = new TableConnection({ url: server.wsUrl, token, tableId: table.id });
        connection.onStatus((status, reason) => {
          if (status === 'closed') resolve(reason);
        });
        connection.connect();
      });
    expect(await closed('bxt_wrong')).toBe('auth_failed');
    expect(await closed(outsider.token)).toBe('auth_failed');

    // A socket that sends anything other than auth first is closed.
    const socket = new WebSocket(server.wsUrl);
    const code = await new Promise<number>((resolve) => {
      socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'heartbeat' })));
      socket.addEventListener('close', (event) => resolve(event.code));
    });
    expect(code).toBe(WS_CLOSE_CODES.auth_failed);
  });

  it('checks the Origin of a WebSocket handshake', async () => {
    expect(await handshake(server, undefined)).toBe(101);
    expect(await handshake(server, 'http://localhost:5180')).toBe(101);
    expect(await handshake(server, server.url)).toBe(101);
    expect(await handshake(server, 'https://table.example')).toBe(101);
    expect(await handshake(server, 'https://evil.example')).toBe(403);
    expect(await handshake(server, 'null')).toBe(403);
  });

  it('closes a socket that sends a message over the size limit', async () => {
    const referee = await createUser(server, 'Bigsender');
    const table = await referee.client.createTable({ name: 'Big messages', host_key: 'host-secret-key' });
    const socket = new WebSocket(server.wsUrl);
    const code = await new Promise<number>((resolve) => {
      socket.addEventListener('open', () =>
        socket.send(
          JSON.stringify({ type: 'auth', token: referee.token, table_id: table.id, pad: 'x'.repeat(20_000) }),
        ),
      );
      socket.addEventListener('close', (event) => resolve(event.code));
    });
    expect(code).toBe(WS_CLOSE_CODES.message_too_large);
  });

  it('reports bxapi as unreachable with a clear problem', async () => {
    const offline = await startServer({ bxapiUrl: 'http://127.0.0.1:1' });
    try {
      const client = new BxvttClient({ baseUrl: offline.url });
      const health = await fetch(`${offline.url}/api/health`);
      expect(health.status).toBe(503);
      expect(((await health.json()) as { bxapi: { reachable: boolean } }).bxapi.reachable).toBe(false);
      await client.createUser('Lonely');
      await expect(client.rollDice({ expression: '1d6' })).rejects.toSatisfy((error) =>
        isProblem(error, 'bxapi_unavailable'),
      );
    } finally {
      await offline.close();
    }
  });
});
