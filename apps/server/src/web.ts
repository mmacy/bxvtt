import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { Config } from './config';
import { requestPath, viaHttpsProxy } from './util';

/** A `Host` header that is a host name or an IP address with an optional port, and nothing else. */
const SAFE_HOST = /^(?:[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})*|\[[0-9A-Fa-f:.]{2,45}\])(?::\d{1,5})?$/;

/**
 * Builds the Content Security Policy for the web client, a Vite build of a React app:
 *
 * - Scripts come only from the server, and no inline script or `eval` runs.
 * - Styles come from the server. `'unsafe-inline'` stays for styles because Radix UI's dialogs insert a
 *   `<style>` element to lock scrolling. An inline style can't run code.
 * - Images may be `data:` and `blob:` URLs, because the map exports its canvas with `toDataURL`. Fonts may be
 *   `data:` URLs, because Vite inlines small font files.
 * - The page may connect only to its own origin, including the WebSocket. The `ws:` and `wss:` sources name
 *   the `Host` header only when it is a plain host and port, so a forged `Host` can't add a directive. Behind
 *   an HTTPS proxy, only `wss:` is allowed.
 * - No plugin, frame, worker from elsewhere, `<base>`, or form target on another origin.
 *
 * @param host - The request's `Host` header.
 * @param secure - Whether the page was loaded over HTTPS.
 */
export function contentSecurityPolicy(host: string | undefined, secure = false): string {
  let sockets = '';
  if (host !== undefined && SAFE_HOST.test(host))
    sockets = secure ? ` wss://${host}` : ` ws://${host} wss://${host}`;
  return [
    "default-src 'self'",
    "script-src 'self'",
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${sockets}`,
    "worker-src 'self'",
    "frame-src 'none'",
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
    const secure = viaHttpsProxy(request.socket.remoteAddress, request.headers);
    // A browser that reached the server through an HTTPS tunnel keeps to HTTPS for this host from then on.
    if (secure) reply.header('Strict-Transport-Security', 'max-age=31536000');
    const path = requestPath(request);
    if (path === '/api' || path.startsWith('/api/')) {
      reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
      if (!reply.hasHeader('Cache-Control')) reply.header('Cache-Control', 'no-store');
    } else {
      reply.header('Content-Security-Policy', contentSecurityPolicy(request.headers.host, secure));
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
