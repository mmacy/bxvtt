import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { User } from '@bxvtt/shared/protocol';
import { ApiError } from './errors';
import type { UserStore } from './users';
import type { RateLimiter } from './util';
import { addressKey, clientAddress, requestPath } from './util';

declare module 'fastify' {
  interface FastifyRequest {
    /** The user the bearer token belongs to, or `null` before authentication and on public routes. */
    user: User | null;
    /** The address of the person behind the request. */
    clientIp: string;
  }
}

/** The routes under `/api` that need no token. */
const PUBLIC_ROUTES = new Set([
  'GET /api/health',
  'HEAD /api/health',
  'POST /api/users',
  'POST /api/rejoin/lookup',
  'POST /api/rejoin',
]);

/** The routes with a path parameter that need no token: a visitor's poll of a rejoin request. */
const PUBLIC_PATTERNS = [/^POST \/api\/rejoin\/[^/]+\/(?:status|cancel)$/];

/**
 * Checks bearer tokens. Every route under `/api` except the health check and user creation needs one. Failed
 * attempts count against a per-address limit, and an address over the limit gets 429 for a bad token.
 */
export class Auth {
  /**
   * @param users - The user store.
   * @param failedAuth - The limiter for failed attempts, by address.
   * @param userWrites - The limiter for requests that change something, by user.
   */
  constructor(
    private readonly users: UserStore,
    private readonly failedAuth: RateLimiter,
    private readonly userWrites: RateLimiter,
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
      const path = requestPath(request);
      if (!path.startsWith('/api/') && path !== '/api') return;
      const route = `${request.method} ${path}`;
      if (PUBLIC_ROUTES.has(route) || PUBLIC_PATTERNS.some((pattern) => pattern.test(route))) return;
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
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        const retry = this.userWrites.take(user.id);
        if (retry > 0)
          throw rateLimited('You are making changes too quickly. Wait a moment and try again.', retry);
      }
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
    const key = addressKey(address);
    const blocked = this.failedAuth.peek(key);
    const user = token.length <= 200 ? this.users.byToken(token) : null;
    if (user !== null) return user;
    if (token.length <= 200 && this.users.isRetired(token)) {
      throw new ApiError(
        'token_retired',
        'A referee approved a rejoin request for this member in another browser, so this sign-in is no longer active.',
        {},
        { headers: { 'WWW-Authenticate': 'Bearer' } },
      );
    }
    if (blocked > 0)
      throw rateLimited('Too many failed sign-in attempts from this IP address. Try again later.', blocked);
    this.failedAuth.take(key);
    return null;
  }

  /**
   * Returns the request's user.
   *
   * @param request - The request.
   * @throws ApiError `unauthorized` on a route that skipped authentication.
   */
  user(request: FastifyRequest): User {
    if (request.user === null)
      throw new ApiError('unauthorized', 'Sign in with a valid user token to access this route.');
    return request.user;
  }
}

/**
 * Builds a `rate_limited` problem with the `Retry-After` header.
 *
 * @param detail - What the client did too often.
 * @param retryAfter - The whole seconds until the client may try again.
 */
export function rateLimited(detail: string, retryAfter: number): ApiError {
  return new ApiError(
    'rate_limited',
    detail,
    { retry_after: retryAfter },
    { headers: { 'Retry-After': String(retryAfter) } },
  );
}
