import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { User } from '@bxvtt/shared/protocol';
import { ApiError } from './errors';
import type { UserStore } from './users';
import type { RateLimiter } from './util';
import { clientAddress } from './util';

declare module 'fastify' {
  interface FastifyRequest {
    /** The user the bearer token belongs to, or `null` before authentication and on public routes. */
    user: User | null;
    /** The address of the person behind the request. */
    clientIp: string;
  }
}

/** The routes under `/api` that need no token. */
const PUBLIC_ROUTES = new Set(['GET /api/health', 'HEAD /api/health', 'POST /api/users']);

/**
 * Checks bearer tokens. Every route under `/api` except the health check and user creation needs one. Failed
 * attempts count against a per-address limit, and an address over the limit gets 429 for a bad token.
 */
export class Auth {
  /**
   * @param users - The user store.
   * @param failedAuth - The limiter for failed attempts.
   */
  constructor(
    private readonly users: UserStore,
    private readonly failedAuth: RateLimiter,
  ) {}

  /**
   * Adds the hook that resolves `request.clientIp` and `request.user`.
   *
   * @param app - The Fastify instance.
   */
  register(app: FastifyInstance): void {
    app.decorateRequest('user', null);
    app.decorateRequest('clientIp', '');
    app.addHook('onRequest', async (request) => {
      request.clientIp = clientAddress(request.socket.remoteAddress, request.headers);
      const path = request.url.split('?')[0] ?? '';
      if (!path.startsWith('/api/') && path !== '/api') return;
      if (PUBLIC_ROUTES.has(`${request.method} ${path}`)) return;
      const header = request.headers.authorization;
      const match = typeof header === 'string' ? /^Bearer\s+(\S+)$/i.exec(header) : null;
      const token = match?.[1];
      const user = token === undefined ? null : this.authenticate(token, request.clientIp);
      if (user === null) {
        throw new ApiError(
          'unauthorized',
          'Send your user token as Authorization: Bearer <token>.',
          {},
          {
            headers: { 'WWW-Authenticate': 'Bearer' },
          },
        );
      }
      request.user = user;
    });
  }

  /**
   * Finds the user a token belongs to, counting a failure against the address.
   *
   * @param token - The token.
   * @param address - The client's address.
   * @returns The user, or `null` for an unknown token.
   * @throws ApiError `rate_limited` when the address has failed too often.
   */
  authenticate(token: string, address: string): User | null {
    const blocked = this.failedAuth.peek(address);
    const user = token.length <= 200 ? this.users.byToken(token) : null;
    if (user !== null) return user;
    if (blocked > 0) {
      throw new ApiError(
        'rate_limited',
        'This address has sent too many unknown tokens. Try again later.',
        { retry_after: blocked },
        { headers: { 'Retry-After': String(blocked) } },
      );
    }
    this.failedAuth.take(address);
    return null;
  }

  /**
   * Returns the request's user.
   *
   * @param request - The request.
   * @throws ApiError `unauthorized` on a route that skipped authentication.
   */
  user(request: FastifyRequest): User {
    if (request.user === null) throw new ApiError('unauthorized', 'This route needs a user token.');
    return request.user;
  }
}
