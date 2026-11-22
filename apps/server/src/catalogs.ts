import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { FullCatalogName } from '@bxvtt/shared/protocol';
import { FullCatalogNameSchema } from '@bxvtt/shared/protocol';
import { BxapiProblem, toApiError } from './bxapi';
import type { Context } from './context';
import { notFound } from './errors';
import type { RulesCache } from './rules';
import { etagMatches } from './rules';
import { sleep } from './util';

/** A whole catalog, ready to send. */
interface BuiltCatalog {
  etag: string;
  body: string;
  gzip: Buffer;
  /** The `ETag`s of bxapi's list pages the catalog was built from, joined. */
  source: string;
  checkedAt: number;
}

/** How long the server serves a built catalog before it checks bxapi's list for a change. */
const FRESH_MS = 5 * 60_000;
/** How many entries the server reads from bxapi at once while it builds a catalog. */
const CONCURRENCY = 4;
/** How many times the server retries one entry that bxapi refused for being busy. */
const RETRIES = 5;

/**
 * Builds and caches whole rules catalogs: every full entry of `classes`, `equipment`, `monsters`, `spells`, or
 * `magic-items` in one response. It reads bxapi's list and then each entry through the {@link RulesCache}, a
 * few at a time. After five minutes it reads the list again, and it rebuilds the catalog only when a list page's
 * `ETag` changed, which happens only when bxapi's rules change.
 */
export class FullCatalogCache {
  private readonly built = new Map<FullCatalogName, BuiltCatalog>();
  private readonly building = new Map<FullCatalogName, Promise<BuiltCatalog>>();

  /**
   * @param rules - The rules cache.
   */
  constructor(private readonly rules: RulesCache) {}

  /**
   * Returns a whole catalog, building it on first use.
   *
   * @param name - The catalog.
   * @throws BxapiProblem or BxapiUnreachable when bxapi fails.
   */
  async get(name: FullCatalogName): Promise<BuiltCatalog> {
    const cached = this.built.get(name);
    if (cached !== undefined && Date.now() - cached.checkedAt < FRESH_MS) return cached;
    const running = this.building.get(name);
    if (running !== undefined) return running;
    const task = this.build(name, cached);
    this.building.set(name, task);
    try {
      const result = await task;
      this.built.set(name, result);
      return result;
    } finally {
      this.building.delete(name);
    }
  }

  private async build(name: FullCatalogName, cached: BuiltCatalog | undefined): Promise<BuiltCatalog> {
    const list = await this.rules.list<{ id: string }>(name);
    const source = list.etags.join(',');
    if (cached !== undefined && cached.source === source && source !== '') {
      cached.checkedAt = Date.now();
      return cached;
    }
    const items: unknown[] = new Array<unknown>(list.items.length);
    let next = 0;
    const worker = async () => {
      while (next < list.items.length) {
        const index = next;
        next += 1;
        const id = list.items[index]?.id ?? '';
        items[index] = await this.entry(`${name}/${encodeURIComponent(id)}`);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    const body = JSON.stringify({ catalog: name, total: items.length, items });
    return {
      etag: `"${createHash('sha256').update(body).digest('hex').slice(0, 32)}"`,
      body,
      gzip: gzipSync(body),
      source,
      checkedAt: Date.now(),
    };
  }

  /** Reads one entry, waiting and trying again while bxapi is busy. */
  private async entry(path: string): Promise<unknown> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.rules.json(path);
      } catch (error) {
        const busy = error instanceof BxapiProblem && (error.status === 429 || error.status === 503);
        if (!busy || attempt >= RETRIES) throw error;
        await sleep(Math.min(5000, (error.retryAfter ?? attempt) * 1000));
      }
    }
  }
}

/** Whether a request's `Accept-Encoding` accepts gzip. */
function acceptsGzip(request: FastifyRequest): boolean {
  const header = request.headers['accept-encoding'];
  if (typeof header !== 'string') return false;
  return header.split(',').some((part) => {
    const [coding = '', ...params] = part.trim().split(';');
    if (coding.trim().toLowerCase() !== 'gzip') return false;
    const q = params.map((param) => param.trim()).find((param) => param.startsWith('q='));
    return q === undefined || Number(q.slice(2)) > 0;
  });
}

/** The path parameters of the catalog route. */
const CatalogParams = z.object({ catalog: z.string() });

/**
 * Registers `GET /api/catalogs/{catalog}`, which returns every full entry of one rules catalog.
 *
 * @param app - The Fastify instance.
 * @param ctx - The server's services.
 */
export function registerCatalogRoutes(app: FastifyInstance, ctx: Context): void {
  const catalogs = new FullCatalogCache(ctx.rules);

  app.get('/api/catalogs/:catalog', async (request, reply) => {
    ctx.auth.user(request);
    const { catalog } = CatalogParams.parse(request.params);
    const name = FullCatalogNameSchema.safeParse(catalog);
    if (!name.success) notFound('catalog', catalog);
    let built: BuiltCatalog;
    try {
      built = await catalogs.get(name.data);
    } catch (error) {
      throw toApiError(error);
    }
    reply.header('Cache-Control', 'private, max-age=3600');
    reply.header('ETag', built.etag);
    reply.header('Vary', 'Accept-Encoding');
    if (etagMatches(request.headers['if-none-match'], built.etag)) return reply.status(304).send();
    reply.type('application/json');
    if (acceptsGzip(request)) return reply.header('Content-Encoding', 'gzip').send(built.gzip);
    return reply.send(built.body);
  });
}
