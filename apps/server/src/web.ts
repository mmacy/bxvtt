import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { Config } from './config';

/**
 * Builds the Content Security Policy for the web client. Scripts, styles, fonts, and images come from the
 * server only. The client may connect to the server's own origin, including its WebSocket.
 *
 * @param host - The request's `Host` header.
 */
export function contentSecurityPolicy(host: string | undefined): string {
  const sockets = host === undefined ? '' : ` ws://${host} wss://${host}`;
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${sockets}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * Adds the security headers every response gets, and the stricter headers of API responses.
 *
 * @param app - The Fastify instance.
 */
export function registerSecurityHeaders(app: FastifyInstance): void {
  app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    if (request.url.startsWith('/api/')) {
      reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
      if (!reply.hasHeader('Cache-Control')) reply.header('Cache-Control', 'no-store');
    } else {
      reply.header('Content-Security-Policy', contentSecurityPolicy(request.headers.host));
    }
  });
}

/**
 * Serves the built web client from `apps/web/dist` when it exists. Hashed files under `assets/` are cached for
 * a year. Any other GET for a path outside `/api` and `/ws` that accepts HTML gets `index.html`, so the client's
 * router handles deep links.
 *
 * @param app - The Fastify instance.
 * @param config - The server's settings.
 * @returns Whether the client is served.
 */
export async function registerWebClient(app: FastifyInstance, config: Config): Promise<boolean> {
  if (config.webDist === null) return false;
  await app.register(fastifyStatic, {
    root: config.webDist,
    wildcard: false,
    index: false,
    setHeaders(reply, path) {
      reply.header(
        'Cache-Control',
        path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  });
  return true;
}

/**
 * Whether a request should get the client's `index.html` instead of a 404.
 *
 * @param request - The request.
 */
export function wantsSpaFallback(request: FastifyRequest): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  const path = request.url.split('?')[0] ?? '';
  if (path === '/api' || path.startsWith('/api/') || path === '/ws') return false;
  if (/\.[A-Za-z0-9]+$/.test(path)) return false;
  const accept = request.headers.accept ?? '';
  return accept.includes('text/html') || accept.includes('*/*') || accept === '';
}
