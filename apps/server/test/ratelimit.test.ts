import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BxvttClient } from '@bxvtt/shared/client';
import { clientAddress } from '../src/util';
import type { TestServer } from './helpers';
import { startServer } from './helpers';

/**
 * Sends a request as if it came through a proxy on the same machine for a client at `address`.
 *
 * @param server - The server.
 * @param path - The path.
 * @param init - The request.
 * @param address - The client's address, in `X-Forwarded-For`.
 */
function fromAddress(
  server: TestServer,
  path: string,
  init: RequestInit,
  address: string,
): Promise<Response> {
  return fetch(`${server.url}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': `198.51.100.9, ${address}`,
      ...init.headers,
    },
  });
}

describe('per-address rate limits', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer({
      rateLimits: {
        createUser: { capacity: 2, windowMs: 60_000 },
        join: { capacity: 3, windowMs: 60_000 },
        failedAuth: { capacity: 3, windowMs: 60_000 },
      },
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it('limits how fast one address creates users', async () => {
    const create = (address: string) =>
      fromAddress(server, '/api/users', { method: 'POST', body: JSON.stringify({ name: 'Spam' }) }, address);
    expect((await create('203.0.113.1')).status).toBe(201);
    expect((await create('203.0.113.1')).status).toBe(201);
    const limited = await create('203.0.113.1');
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await limited.json()).toMatchObject({ code: 'rate_limited' });
    // Another address has its own budget.
    expect((await create('203.0.113.2')).status).toBe(201);
  });

  it('limits how fast one address tries invite codes', async () => {
    const owner = new BxvttClient({ baseUrl: server.url });
    await owner.createUser('Owner');
    const table = await owner.createTable({ name: 'Guarded' });
    const guest = await fromAddress(
      server,
      '/api/users',
      { method: 'POST', body: JSON.stringify({ name: 'Guesser' }) },
      '203.0.113.3',
    );
    const { token } = (await guest.json()) as { token: string };
    const join = (code: string) =>
      fromAddress(
        server,
        '/api/join',
        {
          method: 'POST',
          body: JSON.stringify({ invite_code: code }),
          headers: { Authorization: `Bearer ${token}` },
        },
        '203.0.113.3',
      );
    for (const code of ['AAAAA-AAAAA-AAAAA-AAAAA', 'BBBBB-BBBBB-BBBBB-BBBBB', 'CCCCC-CCCCC-CCCCC-CCCCC']) {
      expect((await join(code)).status).toBe(404);
    }
    // The budget is spent, so even the right code waits.
    const limited = await join(table.invite_code);
    expect(limited.status).toBe(429);
  });

  it('limits failed authentication by address and still lets a valid token through', async () => {
    const user = await fromAddress(
      server,
      '/api/users',
      { method: 'POST', body: JSON.stringify({ name: 'Valid' }) },
      '203.0.113.4',
    );
    const { token } = (await user.json()) as { token: string };
    const me = (bearer: string) =>
      fromAddress(server, '/api/users/me', { headers: { Authorization: `Bearer ${bearer}` } }, '203.0.113.4');
    for (let i = 0; i < 3; i += 1) expect((await me(`bxt_guess${i}`)).status).toBe(401);
    expect((await me('bxt_guess-again')).status).toBe(429);
    expect((await me(token)).status).toBe(200);
  });

  it('trusts CF-Connecting-IP only from a peer on this machine', async () => {
    const create = (address: string) =>
      fetch(`${server.url}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': address },
        body: JSON.stringify({ name: 'Tunnel' }),
      });
    expect((await create('203.0.113.60')).status).toBe(201);
    expect((await create('203.0.113.60')).status).toBe(201);
    expect((await create('203.0.113.60')).status).toBe(429);
    expect((await create('203.0.113.61')).status).toBe(201);
    expect(clientAddress('127.0.0.1', { 'cf-connecting-ip': '203.0.113.60' })).toBe('203.0.113.60');
    expect(clientAddress('::ffff:127.0.0.1', { 'x-forwarded-for': '10.0.0.1, 203.0.113.7' })).toBe(
      '203.0.113.7',
    );
    expect(clientAddress('198.51.100.20', { 'cf-connecting-ip': '203.0.113.60' })).toBe('198.51.100.20');
    expect(clientAddress('198.51.100.20', { 'x-forwarded-for': '203.0.113.7' })).toBe('198.51.100.20');
    expect(clientAddress('127.0.0.1', { 'x-forwarded-for': 'not-an-address' })).toBe('127.0.0.1');
  });
});
