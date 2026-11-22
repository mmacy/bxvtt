import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib';
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

const brotli = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

/** The media types of the files the server compresses. Fonts and images are compressed already. */
const COMPRESSIBLE: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** A file smaller than this isn't worth compressing. */
const MIN_COMPRESS_BYTES = 1024;

/** One file of the client, compressed both ways. */
interface Compressed {
  type: string;
  br: Buffer;
  gzip: Buffer;
  etag: string;
}

/** The `Cache-Control` of a client file: a year for hashed files under `assets/`, and revalidation for the rest. */
function cacheControl(path: string): string {
  return path.includes('/assets/') || path.startsWith('assets/')
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
}

/**
 * Picks the encoding to send from `Accept-Encoding`: brotli when the client takes it, then gzip, else none. A
 * coding with `q=0` is refused.
 *
 * @param header - The request's `Accept-Encoding`.
 */
export function chooseEncoding(header: string | string[] | undefined): 'br' | 'gzip' | null {
  if (typeof header !== 'string') return null;
  const accepted = new Map<string, number>();
  for (const part of header.split(',')) {
    const [coding = '', ...params] = part.trim().toLowerCase().split(';');
    const q = params.map((param) => param.trim()).find((param) => param.startsWith('q='));
    accepted.set(coding.trim(), q === undefined ? 1 : Number(q.slice(2)));
  }
  const takes = (coding: string) => (accepted.get(coding) ?? accepted.get('*') ?? 0) > 0;
  if (takes('br')) return 'br';
  if (takes('gzip')) return 'gzip';
  return null;
}

/**
 * The built client's text files, compressed with brotli and gzip once and kept in memory. Every file is
 * compressed at startup in the background, and a file asked for before then is compressed on that request.
 */
export class CompressedClient {
  private readonly files = new Map<string, Promise<Compressed | null>>();

  /**
   * @param root - The built client's directory.
   */
  constructor(private readonly root: string) {}

  /**
   * Returns a file compressed, or `null` for a file that isn't there, isn't text, or is too small.
   *
   * @param relative - The file's path under the root, such as `assets/index-abc.js`.
   */
  get(relative: string): Promise<Compressed | null> {
    let entry = this.files.get(relative);
    if (entry === undefined) {
      entry = this.compress(relative).catch(() => null);
      this.files.set(relative, entry);
    }
    return entry;
  }

  private async compress(relative: string): Promise<Compressed | null> {
    const type = COMPRESSIBLE[extname(relative).toLowerCase()];
    if (type === undefined) return null;
    const path = normalize(join(this.root, relative));
    if (!path.startsWith(normalize(this.root) + sep)) return null;
    const info = await stat(path);
    if (!info.isFile() || info.size < MIN_COMPRESS_BYTES) return null;
    const body = await readFile(path);
    const [br, gz] = await Promise.all([
      brotli(body, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 10,
          [zlibConstants.BROTLI_PARAM_SIZE_HINT]: body.length,
        },
      }),
      gzipAsync(body, { level: 9 }),
    ]);
    return { type, br, gzip: gz, etag: createHash('sha256').update(body).digest('hex').slice(0, 32) };
  }

  /**
   * Sends a file compressed when the client accepts it and the file is worth it.
   *
   * @param request - The request.
   * @param reply - The reply.
   * @param relative - The file's path under the root.
   * @returns Whether it sent the file.
   */
  async send(request: FastifyRequest, reply: FastifyReply, relative: string): Promise<boolean> {
    const encoding = chooseEncoding(request.headers['accept-encoding']);
    if (encoding === null) return false;
    const file = await this.get(relative);
    if (file === null) return false;
    const etag = `"${file.etag}-${encoding}"`;
    reply.header('Vary', 'Accept-Encoding');
    reply.header('Cache-Control', cacheControl(relative));
    reply.header('ETag', etag);
    if (request.headers['if-none-match'] === etag) {
      await reply.status(304).send();
      return true;
    }
    await reply
      .header('Content-Encoding', encoding)
      .type(file.type)
      .send(encoding === 'br' ? file.br : file.gzip);
    return true;
  }
}

/**
 * Serves the built web client from `apps/web/dist` when it exists. Hashed files under `assets/` are cached for
 * a year, and everything else, `index.html` included, revalidates. Scripts, styles, and other text go out
 * compressed with brotli or gzip, as `Accept-Encoding` allows, with `Vary: Accept-Encoding`. The server
 * compresses each file once, in memory, so the build needs no extra step. Any other GET for a path outside
 * `/api` and `/ws` that accepts HTML gets `index.html`, so the client's router handles deep links.
 *
 * @param app - The Fastify instance.
 * @param config - The server's settings.
 * @returns The compressed client, or `null` when the server doesn't serve the client.
 */
export async function registerWebClient(
  app: FastifyInstance,
  config: Config,
): Promise<CompressedClient | null> {
  if (config.webDist === null) return null;
  const client = new CompressedClient(config.webDist);
  app.addHook('onRequest', async (request, reply) => {
    if (request.method !== 'GET') return;
    const path = requestPath(request);
    if (path === '/api' || path.startsWith('/api/') || path === '/ws' || !/\.[A-Za-z0-9]+$/.test(path))
      return;
    let relative: string;
    try {
      relative = decodeURIComponent(path).replace(/^\/+/, '');
    } catch {
      return;
    }
    await client.send(request, reply, relative);
  });
  await app.register(fastifyStatic, {
    root: config.webDist,
    wildcard: false,
    index: false,
    setHeaders(reply, path) {
      reply.header('Cache-Control', cacheControl(path));
      if (COMPRESSIBLE[extname(path).toLowerCase()] !== undefined) reply.header('Vary', 'Accept-Encoding');
    },
  });
  // Compress every file in the background, so the first visitor doesn't wait for it.
  void (async () => {
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(config.webDist ?? '', { recursive: true });
    for (const entry of entries) await client.get(String(entry).split(sep).join('/'));
  })().catch((error: unknown) => app.log.warn({ err: error }, 'could not compress the web client'));
  return client;
}

/**
 * Sends the client's `index.html`, compressed when the client accepts it, for a client route.
 *
 * @param client - The compressed client.
 * @param request - The request.
 * @param reply - The reply.
 */
export async function sendIndex(
  client: CompressedClient,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  if (await client.send(request, reply, 'index.html')) return reply;
  return reply
    .header('Cache-Control', 'no-cache')
    .header('Vary', 'Accept-Encoding')
    .type('text/html')
    .sendFile('index.html');
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
