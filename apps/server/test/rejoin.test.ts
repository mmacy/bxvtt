import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BxvttClient, isProblem } from '@bxvtt/shared/client';
import type { BxvttProblemError } from '@bxvtt/shared/client';
import type { RefereeTableDetail, RejoinTicket } from '@bxvtt/shared/protocol';
import type { TestConnection, TestServer, TestUser } from './helpers';
import { connect, createCharacter, createTable, createUser, received, startServer, waitFor } from './helpers';

/**
 * A browser with no token yet. Pass `ip` for a browser at another address: the server trusts `CF-Connecting-IP`
 * from a peer on its own machine, as it does from `cloudflared`.
 */
function visitor(server: TestServer, ip?: string): BxvttClient {
  if (ip === undefined) return new BxvttClient({ baseUrl: server.url });
  const fetchFrom: typeof fetch = (input, init) =>
    fetch(input, {
      ...init,
      headers: { ...(init?.headers as Record<string, string>), 'CF-Connecting-IP': ip },
    });
  return new BxvttClient({ baseUrl: server.url, fetch: fetchFrom });
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
  let table: RefereeTableDetail;
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
    // The old token no longer works and says why, and replaying the approval hands out nothing.
    expect(await failure(alice.client.me())).toBe('token_retired');
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
    expect(await browser.rejoinStatus(ticket.request_id, ticket.secret)).toMatchObject({
      status: 'cancelled',
      cancel_reason: 'member_returned',
    });
    expect(await failure(host.client.approveRejoin(table.id, ticket.request_id))).toBe('rejoin_not_pending');
    back.close();
    await waitFor(() => !server.server.ctx.hub.presence(table.id).online.includes(bob.id));
  });

  it('keeps one request per member, and lets the same address ask again', async () => {
    const browser = visitor(server);
    const first = await browser.requestRejoin(table.invite_code, bob.id);
    // Another visitor, at another address, waits for the first request to end.
    expect(await failure(visitor(server, '198.51.100.7').requestRejoin(table.invite_code, bob.id))).toBe(
      'rejoin_pending',
    );
    // Asking again from the same address, as after a reload, replaces the earlier request.
    const again = await visitor(server).requestRejoin(table.invite_code, bob.id);
    expect((await browser.rejoinStatus(first.request_id, first.secret)).status).toBe('cancelled');
    expect((await host.client.listRejoinRequests(table.id)).items.map((item) => item.id)).toEqual([
      again.request_id,
    ]);
    await host.client.declineRejoin(table.id, again.request_id);
  });

  it('ends a request the visitor stops waiting for, at once for the referee too (R-401)', async () => {
    const browser = visitor(server);
    const ticket = await browser.requestRejoin(table.invite_code, bob.id);
    await received(hostWs, 'rejoin_requests', (m) => m.requests.some((r) => r.id === ticket.request_id));
    const before = hostWs.messages.length;
    await browser.cancelRejoin(ticket.request_id, ticket.secret);
    await waitFor(() =>
      hostWs.messages
        .slice(before)
        .some((m) => m.type === 'rejoin_requests' && !m.requests.some((r) => r.id === ticket.request_id)),
    );
    expect((await browser.rejoinStatus(ticket.request_id, ticket.secret)).status).toBe('cancelled');
    expect(await failure(host.client.approveRejoin(table.id, ticket.request_id))).toBe('rejoin_not_pending');
    expect((await bob.client.me()).id).toBe(bob.id);
    // A closing page cancels with navigator.sendBeacon, which sends the JSON as text/plain.
    const next = await visitor(server).requestRejoin(table.invite_code, bob.id);
    const beacon = await fetch(`${server.url}/api/rejoin/${next.request_id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ secret: next.secret }),
    });
    expect(beacon.status).toBe(204);
    expect((await host.client.listRejoinRequests(table.id)).items).toEqual([]);
    // Only the cancel route reads text/plain, and only as a JSON object.
    const elsewhere = await fetch(`${server.url}/api/rejoin`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: '{}',
    });
    expect(elsewhere.status).toBe(415);
    const junk = await fetch(`${server.url}/api/rejoin/${next.request_id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'not json',
    });
    expect(junk.status).toBe(400);
    expect(await failure(visitor(server).cancelRejoin(next.request_id, 'rjs_wrong'))).toBe('not_found');
  });

  it('caps the requests one address has waiting, so a household can ask for a few members (R-402)', async () => {
    const extra: TestUser[] = [];
    for (const name of ['Cara', 'Dov', 'Eli']) {
      const user = await createUser(server, name);
      await user.client.joinTable(table.invite_code);
      extra.push(user);
    }
    const house = '203.0.113.9';
    const tickets: RejoinTicket[] = [];
    for (const member of [bob, ...extra.slice(0, 2)]) {
      tickets.push(await visitor(server, house).requestRejoin(table.invite_code, member.id));
    }
    const fourth = extra[2];
    if (fourth === undefined) throw new Error('missing member');
    expect(await failure(visitor(server, house).requestRejoin(table.invite_code, fourth.id))).toBe(
      'rejoin_pending',
    );
    for (const ticket of tickets) await visitor(server, house).cancelRejoin(ticket.request_id, ticket.secret);
  });

  it('refuses a retired token on a WebSocket with token_retired (R-403)', async () => {
    const browser = visitor(server);
    const ticket = await browser.requestRejoin(table.invite_code, bob.id);
    await host.client.approveRejoin(table.id, ticket.request_id);
    const oldToken = bob.token;
    const approved = await browser.rejoinStatus(ticket.request_id, ticket.secret);
    expect(approved.status).toBe('approved');
    expect(await failure(bob.client.me())).toBe('token_retired');
    const { TableConnection } = await import('@bxvtt/shared/client');
    const stale = new TableConnection({ url: server.wsUrl, token: oldToken, tableId: table.id });
    const errors: string[] = [];
    stale.onAny((message) => {
      if (message.type === 'error') errors.push(message.code);
    });
    stale.connect();
    await waitFor(() => errors.length > 0);
    stale.close();
    expect(errors).toEqual(['token_retired']);
    bob.client.setToken(approved.token);
    bob.token = approved.token ?? '';
  });

  it('never lets a referee be reclaimed without another referee to approve', async () => {
    hostWs.close();
    await waitFor(() => !server.server.ctx.hub.presence(table.id).online.includes(host.id));
    // The lookup leaves out the only referee, so no visitor is offered a certain refusal (R-501).
    const offered = (await visitor(server).lookupRejoin(table.invite_code)).members.map((m) => m.user_id);
    expect(offered).not.toContain(host.id);
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

describe('a rejoin request for a member who goes away (#27)', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer();
  });

  afterAll(async () => {
    await server.close();
  });

  /** A table with a connected referee, two players, and a visitor waiting to rejoin as Alice. */
  async function waiting() {
    const host = await createUser(server, 'Rhea');
    const alice = await createUser(server, 'Alice');
    const bob = await createUser(server, 'Bob');
    const table = await createTable(host, [alice, bob]);
    const hostWs = await connect(server, host, table.id);
    const browser = visitor(server);
    const ticket = await browser.requestRejoin(table.invite_code, alice.id);
    await received(hostWs, 'rejoin_requests', (m) => m.requests.some((r) => r.id === ticket.request_id));
    const before = hostWs.messages.length;
    /** Whether the referee's banner has emptied since the request arrived. */
    const emptied = () =>
      hostWs.messages.slice(before).some((m) => m.type === 'rejoin_requests' && m.requests.length === 0);
    return { host, alice, bob, table, hostWs, browser, ticket, emptied };
  }

  it('ends when the member leaves, and the referee sees it end without a reload', async () => {
    const { host, alice, table, hostWs, browser, ticket, emptied } = await waiting();
    await alice.client.leaveTable(table.id);
    await waitFor(emptied);
    expect((await host.client.listRejoinRequests(table.id)).items).toEqual([]);
    expect(await failure(host.client.approveRejoin(table.id, ticket.request_id))).toBe('rejoin_not_pending');
    expect(await browser.rejoinStatus(ticket.request_id, ticket.secret)).toMatchObject({
      status: 'cancelled',
      cancel_reason: 'member_left',
    });
    hostWs.close();
  });

  it('ends when a referee removes the member', async () => {
    const { host, alice, table, hostWs, browser, ticket, emptied } = await waiting();
    await host.client.removeMember(table.id, alice.id);
    await waitFor(emptied);
    expect(await failure(host.client.approveRejoin(table.id, ticket.request_id))).toBe('rejoin_not_pending');
    // The visitor learns that Alice is gone, the same as leaving: never that a referee removed her.
    expect(await browser.rejoinStatus(ticket.request_id, ticket.secret)).toMatchObject({
      status: 'cancelled',
      cancel_reason: 'member_left',
    });
    // A new request for a member who is gone is refused.
    expect(await failure(visitor(server, '203.0.113.9').requestRejoin(table.invite_code, alice.id))).toMatch(
      /^(not_found|invite_invalid)$/,
    );
    // The old token still belongs to Alice, who is no longer a member.
    expect((await alice.client.me()).id).toBe(alice.id);
    hostWs.close();
  });

  it('ends an approval nobody has claimed yet when the member leaves, even if they join again before the claim', async () => {
    const { host, alice, table, hostWs, browser, ticket } = await waiting();
    await host.client.approveRejoin(table.id, ticket.request_id);
    await alice.client.leaveTable(table.id);
    // Alice joins again with the invite code before the visitor's browser polls. The approval she had as the
    // member before must not hand her token to the visitor.
    await alice.client.joinTable(table.invite_code);
    const status = await browser.rejoinStatus(ticket.request_id, ticket.secret);
    expect(status).toMatchObject({ status: 'cancelled', token: null, cancel_reason: 'member_left' });
    expect((await alice.client.me()).id).toBe(alice.id);
    hostWs.close();
  });

  it('ends when the only referee who could approve it leaves', async () => {
    const host = await createUser(server, 'Rhea');
    const second = await createUser(server, 'Sable');
    const alice = await createUser(server, 'Alice');
    const table = await createTable(host, [second, alice]);
    await host.client.setMemberRole(table.id, second.id, 'referee');
    const secondWs = await connect(server, second, table.id);
    // A request to come back as Sable, whom only Rhea can approve.
    const browser = visitor(server);
    secondWs.close();
    await waitFor(() => !server.server.ctx.hub.presence(table.id).online.includes(second.id));
    const ticket = await browser.requestRejoin(table.invite_code, second.id);
    await host.client.leaveTable(table.id);
    expect(await browser.rejoinStatus(ticket.request_id, ticket.secret)).toMatchObject({
      status: 'cancelled',
      cancel_reason: 'no_referee',
    });
  });

  it('ends when the only referee who could approve it becomes a player', async () => {
    const host = await createUser(server, 'Rhea');
    const second = await createUser(server, 'Sable');
    const table = await createTable(host, [second]);
    await host.client.setMemberRole(table.id, second.id, 'referee');
    const secondWs = await connect(server, second, table.id);
    // Rhea is offline, and only Sable can approve a request to come back as her.
    const browser = visitor(server);
    const ticket = await browser.requestRejoin(table.invite_code, host.id);
    await received(secondWs, 'rejoin_requests', (m) => m.requests.length === 1);
    await host.client.setMemberRole(table.id, second.id, 'player');
    expect(await browser.rejoinStatus(ticket.request_id, ticket.secret)).toMatchObject({
      status: 'cancelled',
      cancel_reason: 'no_referee',
    });
    secondWs.close();
  });

  it('ends every request for a table that is deleted', async () => {
    const { host, table, hostWs, browser, ticket } = await waiting();
    await host.client.deleteTable(table.id);
    expect((await browser.rejoinStatus(ticket.request_id, ticket.secret)).status).toBe('cancelled');
    hostWs.close();
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

describe('a rejoin request whose visitor goes away', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startServer({ rejoinAbandonMs: 300, rejoinClaimMs: 300 });
  });

  afterAll(async () => {
    await server.close();
  });

  it('is abandoned when nobody polls it, and never retires the old token for nobody (R-401)', async () => {
    const host = await createUser(server, 'Rhea');
    const alice = await createUser(server, 'Alice');
    const table = await createTable(host, [alice]);
    const ticket = await visitor(server).requestRejoin(table.invite_code, alice.id);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect((await host.client.listRejoinRequests(table.id)).items).toEqual([]);
    expect(await failure(host.client.approveRejoin(table.id, ticket.request_id))).toBe('rejoin_not_pending');
    expect((await alice.client.me()).id).toBe(alice.id);
  });

  it('lets an approval lapse when the visitor never claims it, with no notice in the feed', async () => {
    const host = await createUser(server, 'Rhea');
    const alice = await createUser(server, 'Alice');
    const table = await createTable(host, [alice]);
    const browser = visitor(server);
    const ticket = await browser.requestRejoin(table.invite_code, alice.id);
    await host.client.approveRejoin(table.id, ticket.request_id);
    // The approval alone changes nothing: the member's token still works.
    expect((await alice.client.me()).id).toBe(alice.id);
    await new Promise((resolve) => setTimeout(resolve, 400));
    const late = await browser.rejoinStatus(ticket.request_id, ticket.secret).catch(() => null);
    expect(late?.token ?? null).toBeNull();
    expect((await alice.client.me()).id).toBe(alice.id);
    const feed = await host.client.getFeed(table.id, { limit: 50 });
    expect(feed.entries.some((entry) => entry.kind === 'system' && entry.code === 'member_rejoined')).toBe(
      false,
    );
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
      bxapi: { reachable: true, outdated: false, meta: null },
    });
    const user = await createUser(server, 'Rhea');
    const full = await user.client.health();
    expect(full.bxapi.meta?.engine_version).toEqual(expect.any(String));
    const wrong = await new BxvttClient({ baseUrl: server.url, token: 'bxt_nope' }).health();
    expect(wrong.bxapi.meta).toBeNull();
  });
});
