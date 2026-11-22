import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BxvttClient, isProblem } from '@bxvtt/shared/client';
import type { BxvttProblemError } from '@bxvtt/shared/client';
import type { RejoinTicket, TableDetail } from '@bxvtt/shared/protocol';
import type { TestConnection, TestServer, TestUser } from './helpers';
import { connect, createCharacter, createTable, createUser, received, startServer, waitFor } from './helpers';

/** A browser at a new address: no token yet. */
function visitor(server: TestServer): BxvttClient {
  return new BxvttClient({ baseUrl: server.url });
}

/** The problem code an SDK call failed with. */
async function failure(call: Promise<unknown>): Promise<string> {
  const error = await call.then(
    () => null,
    (caught: unknown) => caught,
  );
  if (!isProblem(error)) throw new Error(`expected a problem, got ${String(error)}`);
  return (error as BxvttProblemError).problem.code;
}

describe('rejoining a table as an existing member', () => {
  let server: TestServer;
  let host: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let table: TableDetail;
  let hostWs: TestConnection;

  beforeAll(async () => {
    server = await startServer();
    host = await createUser(server, 'Rhea');
    alice = await createUser(server, 'Alice');
    bob = await createUser(server, 'Bob');
    table = await createTable(host, [alice, bob]);
    const brenna = await createCharacter(alice, 'Brenna', 'fighter', 3);
    await alice.client.addToRoster(table.id, brenna.id);
    hostWs = await connect(server, host, table.id);
  });

  afterAll(async () => {
    hostWs.close();
    await server.close();
  });

  it('shows a visitor with the invite code only the table name and its offline members', async () => {
    const bobWs = await connect(server, bob, table.id);
    const lookup = await visitor(server).lookupRejoin(table.invite_code);
    expect(lookup.table_name).toBe(table.name);
    // Rhea and Bob are online, so only Alice is offered.
    expect(lookup.members).toEqual([{ user_id: alice.id, name: 'Alice', color: expect.any(String) }]);
    expect(Object.keys(lookup).sort()).toEqual(['members', 'table_name']);
    bobWs.close();
    await waitFor(() => !server.server.ctx.hub.presence(table.id).online.includes(bob.id));
    expect(await failure(visitor(server).lookupRejoin('WRONG-CODE'))).toBe('invite_invalid');
  });

  it('lets a referee approve, hands the visitor a new token once, and retires the old one', async () => {
    const browser = visitor(server);
    const ticket = await browser.requestRejoin(table.invite_code, alice.id);
    expect(ticket.approvers_online).toBe(1);
    const notified = await received(hostWs, 'rejoin_requests', (m) => m.requests.length === 1);
    expect(notified.requests[0]).toMatchObject({ id: ticket.request_id, user_id: alice.id, name: 'Alice' });
    expect((await browser.rejoinStatus(ticket.request_id, ticket.secret)).status).toBe('pending');
    // A player can't decide, and nobody can poll without the secret.
    expect(await failure(bob.client.approveRejoin(table.id, ticket.request_id))).toBe('referee_required');
    expect(await failure(visitor(server).rejoinStatus(ticket.request_id, 'rjs_wrong'))).toBe('not_found');

    await host.client.approveRejoin(table.id, ticket.request_id);
    const approved = await browser.rejoinStatus(ticket.request_id, ticket.secret);
    expect(approved).toMatchObject({ status: 'approved', table_id: table.id, user: { id: alice.id } });
    expect(approved.token).toMatch(/^bxt_/);
    // The SDK stored the new token, so the browser is Alice, with her character.
    expect((await browser.me()).id).toBe(alice.id);
    expect((await browser.listCharacters()).items.map((item) => item.name)).toEqual(['Brenna']);
    expect((await browser.getTable(table.id)).members.filter((m) => m.name === 'Alice')).toHaveLength(1);
    // The old token no longer works, and replaying the approval hands out nothing.
    expect(await failure(alice.client.me())).toBe('unauthorized');
    const replay = await browser.rejoinStatus(ticket.request_id, ticket.secret);
    expect(replay).toMatchObject({ status: 'claimed', token: null, user: null });
    expect(await failure(host.client.approveRejoin(table.id, ticket.request_id))).toBe('rejoin_not_pending');
    const feed = await host.client.getFeed(table.id, { limit: 50 });
    expect(feed.entries.some((entry) => entry.kind === 'system' && entry.code === 'member_rejoined')).toBe(
      true,
    );
    alice.client.setToken(approved.token);
  });

  it('tells the visitor when a referee declines', async () => {
    const browser = visitor(server);
    const ticket = await browser.requestRejoin(table.invite_code, bob.id);
    await host.client.declineRejoin(table.id, ticket.request_id);
    expect((await browser.rejoinStatus(ticket.request_id, ticket.secret)).status).toBe('declined');
    expect((await bob.client.me()).id).toBe(bob.id);
  });

  it('refuses a member who is online, and ends a request when the member comes online', async () => {
    const bobWs = await connect(server, bob, table.id);
    expect(await failure(visitor(server).requestRejoin(table.invite_code, bob.id))).toBe(
      'rejoin_member_online',
    );
    bobWs.close();
    await waitFor(() => !server.server.ctx.hub.presence(table.id).online.includes(bob.id));
    const browser = visitor(server);
    const ticket = await browser.requestRejoin(table.invite_code, bob.id);
    const back = await connect(server, bob, table.id);
    expect((await browser.rejoinStatus(ticket.request_id, ticket.secret)).status).toBe('cancelled');
    expect(await failure(host.client.approveRejoin(table.id, ticket.request_id))).toBe('rejoin_not_pending');
    back.close();
    await waitFor(() => !server.server.ctx.hub.presence(table.id).online.includes(bob.id));
  });

  it('keeps one request at a time per address and per member', async () => {
    const browser = visitor(server);
    const ticket = await browser.requestRejoin(table.invite_code, bob.id);
    expect(await failure(visitor(server).requestRejoin(table.invite_code, bob.id))).toBe('rejoin_pending');
    await host.client.declineRejoin(table.id, ticket.request_id);
  });

  it('never lets a referee be reclaimed without another referee to approve', async () => {
    hostWs.close();
    await waitFor(() => !server.server.ctx.hub.presence(table.id).online.includes(host.id));
    expect(await failure(visitor(server).requestRejoin(table.invite_code, host.id))).toBe(
      'rejoin_no_approver',
    );
    hostWs = await connect(server, host, table.id);
  });

  it("doesn't let a referee approve their own request", async () => {
    await host.client.setMemberRole(table.id, bob.id, 'referee');
    hostWs.close();
    await waitFor(() => !server.server.ctx.hub.presence(table.id).online.includes(host.id));
    const ticket: RejoinTicket = await visitor(server).requestRejoin(table.invite_code, host.id);
    // Rhea's old browser still has her token, but she can't approve a request to become herself.
    expect(await failure(host.client.approveRejoin(table.id, ticket.request_id))).toBe('forbidden');
    await bob.client.declineRejoin(table.id, ticket.request_id);
    hostWs = await connect(server, host, table.id);
  });
});

describe('a rejoin request that nobody decides', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer({ rejoinTtlMs: 200 });
  });

  afterAll(async () => {
    await server.close();
  });

  it('expires, and a referee can no longer approve it', async () => {
    const host = await createUser(server, 'Rhea');
    const alice = await createUser(server, 'Alice');
    const table = await createTable(host, [alice]);
    const browser = visitor(server);
    const ticket = await browser.requestRejoin(table.invite_code, alice.id);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect((await browser.rejoinStatus(ticket.request_id, ticket.secret)).status).toBe('expired');
    expect(await failure(host.client.approveRejoin(table.id, ticket.request_id))).toBe('rejoin_not_pending');
    expect((await host.client.listRejoinRequests(table.id)).items).toEqual([]);
  });
});

describe('rejoin rate limits', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer({
      rateLimits: { rejoin: { capacity: 1, windowMs: 60_000 }, join: { capacity: 4, windowMs: 60_000 } },
    });
  });

  afterAll(async () => {
    await server.close();
  });

  it('limits new requests and wrong codes from one address', async () => {
    const host = await createUser(server, 'Rhea');
    const alice = await createUser(server, 'Alice');
    const table = await createTable(host, [alice]);
    const ticket = await visitor(server).requestRejoin(table.invite_code, alice.id);
    await host.client.declineRejoin(table.id, ticket.request_id);
    expect(await failure(visitor(server).requestRejoin(table.invite_code, alice.id))).toBe('rate_limited');
    // Lookups share the invite code limit with joining (one attempt) and the first request (one attempt).
    await visitor(server).lookupRejoin(table.invite_code);
    expect(await failure(visitor(server).lookupRejoin('NOPE'))).toBe('invite_invalid');
    expect(await failure(visitor(server).lookupRejoin(table.invite_code))).toBe('rate_limited');
  });
});

describe('the health check', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer({ hostKey: 'k'.repeat(24) });
  });

  afterAll(async () => {
    await server.close();
  });

  it("gives anyone the status and the host key flag, and bxapi's details only to a user", async () => {
    const anonymous = await visitor(server).health();
    expect(anonymous).toMatchObject({
      status: 'ok',
      host_key_required: true,
      bxapi: { reachable: true, meta: null },
    });
    const user = await createUser(server, 'Rhea');
    const full = await user.client.health();
    expect(full.bxapi.meta?.engine_version).toEqual(expect.any(String));
    const wrong = await new BxvttClient({ baseUrl: server.url, token: 'bxt_nope' }).health();
    expect(wrong.bxapi.meta).toBeNull();
  });
});
