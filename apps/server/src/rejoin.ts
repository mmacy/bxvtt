import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  RejoinLookup,
  RejoinRequestList,
  RejoinRequestSummary,
  RejoinState,
  RejoinStatus,
  RejoinTicket,
  Role,
} from '@bxvtt/shared/protocol';
import { CreateRejoinRequest, RejoinLookupRequest, RejoinStatusRequest } from '@bxvtt/shared/protocol';
import { rateLimited } from './auth';
import type { Context } from './context';
import { str } from './db';
import { ApiError, notFound, parseBody } from './errors';
import { hashToken, normalizeInviteCode } from './ids';
import { addressKey } from './util';

/** One rejoin request, held in memory: it lasts minutes, so a restart may drop it. */
interface PendingRejoin {
  id: string;
  tableId: string;
  userId: string;
  secretHash: string;
  address: string;
  createdAt: number;
  expiresAt: number;
  state: RejoinState;
  /** When the visitor's browser last asked about the request. A request nobody asks about is abandoned. */
  polledAt: number;
  /** When a referee approved it, and who. The visitor must claim the approval soon after. */
  approvedAt: number | null;
  approvedBy: string | null;
}

/** The most requests one address may have waiting at once, so a household can ask for several members. */
const MAX_PENDING_PER_ADDRESS = 3;

/** How long the server keeps an ended request, so the visitor's next poll can learn how it ended. */
const ENDED_KEEP_MS = 10 * 60_000;

/** The path parameters of a visitor's status route. */
const RequestParams = z.object({ requestId: z.string().max(64) });
/** The path parameters of a referee's rejoin route. */
const TableRequestParams = z.object({ tableId: z.string(), requestId: z.string().max(64) });
/** The path parameters of a table route. */
const TableParams = z.object({ tableId: z.string() });

/** Formats a time in milliseconds as an RFC 3339 timestamp with whole seconds. */
function stamp(ms: number): string {
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
}

/**
 * Rejoin requests: a returning visitor with an invite code asks to be one of a table's offline members again, and a
 * referee approves. See the protocol's `rejoin.ts` for the flow. On approval the server gives the existing user a
 * new token and makes the old one useless, so the visitor gets the member's seats, characters, and roles.
 */
export class RejoinService {
  private readonly requests = new Map<string, PendingRejoin>();

  /**
   * @param ctx - The server's services.
   */
  constructor(private readonly ctx: Context) {}

  /** Finds the table an invite code belongs to, or throws `invite_invalid`. */
  private tableFor(inviteCode: string): { id: string; name: string } {
    const row = this.ctx.db.get(
      'SELECT id, name FROM tables WHERE invite_code = ?',
      normalizeInviteCode(inviteCode),
    );
    if (row === undefined) {
      throw new ApiError('invite_invalid', 'No table has that invite code. Check it with the referee.');
    }
    return { id: str(row, 'id'), name: str(row, 'name') };
  }

  /** Counts one invite code attempt for the address. */
  private takeInviteAttempt(request: FastifyRequest): void {
    const retry = this.ctx.limits.join.take(addressKey(request.clientIp));
    if (retry > 0) throw rateLimited('This address has tried too many invite codes. Try again later.', retry);
  }

  /** Ends the requests whose time ran out, and forgets the ones that ended long ago. */
  /**
   * Ends what time has ended: expired and abandoned requests, and approvals nobody claimed. The server calls it
   * every few seconds, so the referees' list drops a closed tab soon after the tab stops asking.
   */
  sweep(): void {
    const nowMs = Date.now();
    const changed = new Set<string>();
    for (const [id, pending] of this.requests) {
      if (pending.state === 'pending' && nowMs >= pending.expiresAt) {
        pending.state = 'expired';
        changed.add(pending.tableId);
      } else if (
        (pending.state === 'pending' || pending.state === 'approved') &&
        nowMs - pending.polledAt > this.ctx.config.rejoinAbandonMs
      ) {
        // The visitor stopped asking: the page closed or reloaded without cancelling.
        pending.state = 'cancelled';
        changed.add(pending.tableId);
      } else if (
        pending.state === 'approved' &&
        pending.approvedAt !== null &&
        nowMs - pending.approvedAt > this.ctx.config.rejoinClaimMs
      ) {
        // Nobody claimed the approval in time, so it lapses and the member's token keeps working.
        pending.state = 'expired';
        changed.add(pending.tableId);
      }
      if (pending.state !== 'pending' && nowMs >= pending.expiresAt + ENDED_KEEP_MS) this.requests.delete(id);
    }
    for (const tableId of changed) this.broadcast(tableId);
  }

  /**
   * The referees who could approve a request for a member: every referee of the table but the member.
   *
   * @param tableId - The table.
   * @param userId - The member.
   * @param onlineOnly - Count only those who are online now.
   */
  private approvers(tableId: string, userId: string, onlineOnly: boolean): string[] {
    const online = new Set(this.ctx.hub.presence(tableId).online);
    return this.ctx.tables
      .members(tableId)
      .filter((member) => member.role === 'referee' && member.user_id !== userId)
      .filter((member) => !onlineOnly || online.has(member.user_id))
      .map((member) => member.user_id);
  }

  /**
   * The table's name and its offline members, for a visitor with the invite code.
   *
   * @param request - The request, for its address.
   */
  lookup(request: FastifyRequest): RejoinLookup {
    this.takeInviteAttempt(request);
    const body = parseBody(RejoinLookupRequest, request);
    const table = this.tableFor(body.invite_code);
    const online = new Set(this.ctx.hub.presence(table.id).online);
    return {
      table_name: table.name,
      // A member nobody could approve, such as the table's only referee, would end in a certain refusal.
      members: this.ctx.tables
        .members(table.id)
        .filter((member) => !online.has(member.user_id))
        .filter((member) => this.approvers(table.id, member.user_id, false).length > 0)
        .map((member) => ({ user_id: member.user_id, name: member.name, color: member.color })),
    };
  }

  /**
   * Starts a request to rejoin as an offline member.
   *
   * @param request - The request, for its body and address.
   */
  create(request: FastifyRequest): RejoinTicket {
    const address = addressKey(request.clientIp);
    const retry = this.ctx.limits.rejoin.take(address);
    if (retry > 0) throw rateLimited('This address has asked to rejoin too often. Try again later.', retry);
    this.takeInviteAttempt(request);
    const body = parseBody(CreateRejoinRequest, request);
    const table = this.tableFor(body.invite_code);
    const role = this.ctx.tables.roleOf(table.id, body.user_id);
    if (role === null) notFound('member', body.user_id);
    if (this.ctx.hub.presence(table.id).online.includes(body.user_id)) {
      throw new ApiError(
        'rejoin_member_online',
        'That member is at the table now, so nobody can rejoin as them.',
      );
    }
    if (this.approvers(table.id, body.user_id, false).length === 0) {
      throw new ApiError(
        'rejoin_no_approver',
        "Only another referee can approve rejoining as a referee, and this table has none. The host keeps their sign-in by opening the server at http://127.0.0.1 on the server's own computer.",
      );
    }
    this.sweep();
    const waiting = (pending: PendingRejoin) => pending.state === 'pending' || pending.state === 'approved';
    for (const pending of this.requests.values()) {
      if (!waiting(pending) || pending.tableId !== table.id || pending.userId !== body.user_id) continue;
      // Asking again from the same address replaces the earlier request. Anyone else waits for it to end.
      if (pending.address !== address) {
        throw new ApiError(
          'rejoin_pending',
          'Someone is already asking to rejoin as that member. Wait until it ends.',
        );
      }
      pending.state = 'cancelled';
    }
    const fromAddress = [...this.requests.values()].filter(
      (pending) => waiting(pending) && pending.address === address,
    );
    if (fromAddress.length >= MAX_PENDING_PER_ADDRESS) {
      throw new ApiError(
        'rejoin_pending',
        'This address has too many requests to rejoin waiting. Wait until one ends.',
      );
    }
    const secret = `rjs_${randomBytes(32).toString('base64url')}`;
    const nowMs = Date.now();
    const pending: PendingRejoin = {
      id: `rjn_${randomBytes(16).toString('base64url')}`,
      tableId: table.id,
      userId: body.user_id,
      secretHash: hashToken(secret),
      address,
      createdAt: nowMs,
      expiresAt: nowMs + this.ctx.config.rejoinTtlMs,
      state: 'pending',
      polledAt: nowMs,
      approvedAt: null,
      approvedBy: null,
    };
    this.requests.set(pending.id, pending);
    request.log.info({ table: table.id, member: body.user_id, rejoin: pending.id }, 'rejoin requested');
    this.broadcast(table.id);
    return {
      request_id: pending.id,
      secret,
      expires_at: stamp(pending.expiresAt),
      approvers_online: this.approvers(table.id, body.user_id, true).length,
    };
  }

  /**
   * Answers a visitor's poll. The `approved` answer carries the new token once, and later polls read `claimed`.
   *
   * @param request - The request, for its path, body, and address.
   * @throws ApiError `not_found` for an unknown request or a wrong secret.
   */
  status(request: FastifyRequest): RejoinStatus {
    const retry = this.ctx.limits.rejoinPolls.take(addressKey(request.clientIp));
    if (retry > 0) throw rateLimited('Ask about the request less often.', retry);
    const { requestId } = RequestParams.parse(request.params);
    const body = parseBody(RejoinStatusRequest, request);
    this.sweep();
    const pending = this.owned(requestId, body.secret);
    pending.polledAt = Date.now();
    if (pending.state === 'pending' || pending.state === 'approved') this.cancelIfOnline(pending);
    const answer: RejoinStatus = {
      status: pending.state,
      expires_at: stamp(pending.expiresAt),
      table_id: pending.tableId,
      token: null,
      user: null,
    };
    if (pending.state === 'approved') {
      // The claim: only now does the member get a new token and lose the old one, because only now is a browser
      // there to take it.
      answer.token = this.ctx.users.rotateToken(pending.userId);
      answer.user = this.ctx.users.get(pending.userId);
      pending.state = 'claimed';
      this.ctx.hub.closeUserEverywhere(pending.userId);
      this.ctx.feed.system(pending.tableId, pending.approvedBy, 'member_rejoined', {
        user_id: pending.userId,
        approved_by: pending.approvedBy,
      });
      this.ctx.log.info({ table: pending.tableId, member: pending.userId }, 'rejoin claimed');
    }
    return answer;
  }

  /**
   * Ends a request at the visitor's word: it pressed "Stop waiting" or left the page. An ended request stays
   * ended, so a repeat is harmless.
   *
   * @param request - The request, for its path, body, and address.
   * @throws ApiError `not_found` for an unknown request or a wrong secret.
   */
  cancel(request: FastifyRequest): void {
    const retry = this.ctx.limits.rejoinPolls.take(addressKey(request.clientIp));
    if (retry > 0) throw rateLimited('Ask about the request less often.', retry);
    const { requestId } = RequestParams.parse(request.params);
    const body = parseBody(RejoinStatusRequest, request);
    const pending = this.owned(requestId, body.secret);
    if (pending.state !== 'pending' && pending.state !== 'approved') return;
    pending.state = 'cancelled';
    this.broadcast(pending.tableId);
  }

  /** Finds a request by its ID and the visitor's secret. A wrong secret reads as an unknown request. */
  private owned(requestId: string, secret: string): PendingRejoin {
    const pending = this.requests.get(requestId);
    if (pending === undefined || pending.secretHash !== hashToken(secret))
      notFound('rejoin request', requestId);
    return pending;
  }

  /** Cancels a pending request when its member is online or no longer a member. */
  private cancelIfOnline(pending: PendingRejoin): boolean {
    const gone = this.ctx.tables.roleOf(pending.tableId, pending.userId) === null;
    const online = this.ctx.hub.presence(pending.tableId).online.includes(pending.userId);
    if (!gone && !online) return false;
    pending.state = 'cancelled';
    this.broadcast(pending.tableId);
    return true;
  }

  /**
   * Ends a member's pending requests for a table because the member came online. The WebSocket calls it after a
   * connection authenticates.
   *
   * @param tableId - The table.
   * @param userId - The member.
   */
  memberOnline(tableId: string, userId: string): void {
    let changed = false;
    for (const pending of this.requests.values()) {
      const waiting = pending.state === 'pending' || pending.state === 'approved';
      if (waiting && pending.tableId === tableId && pending.userId === userId) {
        pending.state = 'cancelled';
        changed = true;
      }
    }
    if (changed) this.broadcast(tableId);
  }

  /**
   * The pending requests of a table, for its referees.
   *
   * @param tableId - The table.
   */
  pending(tableId: string): RejoinRequestSummary[] {
    const members = new Map(this.ctx.tables.members(tableId).map((member) => [member.user_id, member]));
    const items: RejoinRequestSummary[] = [];
    for (const pending of this.requests.values()) {
      if (pending.tableId !== tableId || pending.state !== 'pending' || Date.now() >= pending.expiresAt)
        continue;
      const member = members.get(pending.userId);
      if (member === undefined) continue;
      items.push({
        id: pending.id,
        table_id: tableId,
        user_id: pending.userId,
        name: member.name,
        color: member.color,
        role: member.role as Role,
        created_at: stamp(pending.createdAt),
        expires_at: stamp(pending.expiresAt),
      });
    }
    return items;
  }

  /** Sends the table's referees the pending requests. */
  private broadcast(tableId: string): void {
    const requests = this.pending(tableId);
    this.ctx.hub.send(tableId, ({ role }) =>
      role === 'referee' ? { type: 'rejoin_requests', requests } : null,
    );
  }

  /** Finds a pending request of a table for a referee's decision. */
  private decidable(tableId: string, requestId: string, userId: string): PendingRejoin {
    this.sweep();
    const pending = this.requests.get(requestId);
    if (pending === undefined || pending.tableId !== tableId) notFound('rejoin request', requestId);
    if (pending.userId === userId) {
      throw new ApiError(
        'forbidden',
        'A referee can’t approve or decline a request to rejoin as themselves.',
      );
    }
    if (pending.state !== 'pending') {
      throw new ApiError('rejoin_not_pending', `The request has ended: it is ${pending.state}.`);
    }
    return pending;
  }

  /**
   * Approves a request: the member gets a new token, which the visitor's next poll returns, and the old token
   * stops working. The member's connections close with `auth_failed`.
   *
   * @param tableId - The table.
   * @param requestId - The request.
   * @param refereeId - The referee who approves.
   */
  approve(tableId: string, requestId: string, refereeId: string): RejoinRequestList {
    const pending = this.decidable(tableId, requestId, refereeId);
    if (this.cancelIfOnline(pending)) {
      throw new ApiError('rejoin_member_online', 'The member came back online, so the request has ended.');
    }
    // The member keeps their token until the visitor's browser claims the approval with its next poll.
    pending.state = 'approved';
    pending.approvedAt = Date.now();
    pending.approvedBy = refereeId;
    this.ctx.log.info({ table: tableId, member: pending.userId, referee: refereeId }, 'rejoin approved');
    this.broadcast(tableId);
    return { items: this.pending(tableId) };
  }

  /**
   * Declines a request.
   *
   * @param tableId - The table.
   * @param requestId - The request.
   * @param refereeId - The referee who declines.
   */
  decline(tableId: string, requestId: string, refereeId: string): RejoinRequestList {
    const pending = this.decidable(tableId, requestId, refereeId);
    pending.state = 'declined';
    this.broadcast(tableId);
    return { items: this.pending(tableId) };
  }
}

/**
 * Registers the rejoin routes: the visitor's `POST /api/rejoin/lookup`, `POST /api/rejoin`, and
 * `POST /api/rejoin/{request_id}/status`, which need no token, and the referee's routes under
 * `/api/tables/{table_id}/rejoin-requests`.
 *
 * @param app - The Fastify instance.
 * @param ctx - The server's services.
 */
export function registerRejoinRoutes(app: FastifyInstance, ctx: Context): void {
  const rejoin = ctx.rejoin;
  app.post('/api/rejoin/lookup', async (request) => rejoin.lookup(request));
  app.post('/api/rejoin', async (request, reply) => reply.status(201).send(rejoin.create(request)));
  app.post('/api/rejoin/:requestId/status', async (request) => rejoin.status(request));

  // A page that is closing cancels with `navigator.sendBeacon`, which sends a string body as `text/plain`. Only
  // this route reads that type, as the same small JSON object the JSON parser would accept.
  void app.register(async (scope) => {
    scope.addContentTypeParser(
      'text/plain',
      { parseAs: 'string', bodyLimit: 1024 },
      (_request, body, done) => {
        try {
          const parsed: unknown = JSON.parse(typeof body === 'string' ? body : body.toString('utf8'));
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
            throw new Error('not an object');
          done(null, parsed);
        } catch {
          done(new ApiError('bad_request', "The request body isn't a JSON object."), undefined);
        }
      },
    );
    scope.post('/api/rejoin/:requestId/cancel', { bodyLimit: 1024 }, async (request, reply) => {
      rejoin.cancel(request);
      return reply.status(204).send();
    });
  });

  const sweeper = setInterval(() => rejoin.sweep(), 5000);
  sweeper.unref();
  app.addHook('onClose', async () => clearInterval(sweeper));

  app.get('/api/tables/:tableId/rejoin-requests', async (request) => {
    const { tableId } = TableParams.parse(request.params);
    ctx.tables.requireReferee(tableId, ctx.auth.user(request));
    rejoin.sweep();
    return { items: rejoin.pending(tableId) } satisfies RejoinRequestList;
  });
  app.post('/api/tables/:tableId/rejoin-requests/:requestId/approve', async (request) => {
    const { tableId, requestId } = TableRequestParams.parse(request.params);
    const user = ctx.auth.user(request);
    ctx.tables.requireReferee(tableId, user);
    return rejoin.approve(tableId, requestId, user.id);
  });
  app.post('/api/tables/:tableId/rejoin-requests/:requestId/decline', async (request) => {
    const { tableId, requestId } = TableRequestParams.parse(request.params);
    const user = ctx.auth.user(request);
    ctx.tables.requireReferee(tableId, user);
    return rejoin.decline(tableId, requestId, user.id);
  });
}
