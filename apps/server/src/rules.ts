import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { GeneratorKind } from '@bxvtt/shared/protocol';
import {
  DiceRollRequest,
  GeneratorKind as GeneratorKindSchema,
  MonstersGeneratorRequest,
  NpcPartyGeneratorRequest,
  RoomGeneratorRequest,
  RULES_QUERY_PARAMETERS,
  TreasureGeneratorRequest,
  CharacterRequest,
} from '@bxvtt/shared/protocol';
import type { BxapiClient } from './bxapi';
import { BxapiProblem, callBxapi, toApiError } from './bxapi';
import type { Context } from './context';
import { notFound, parseBody } from './errors';

/** A cached rules response. */
interface CacheEntry {
  etag: string;
  body: string;
  cacheControl: string;
  checkedAt: number;
}

/** How long the server serves a cached rules response before it revalidates it with bxapi. */
const FRESH_MS = 5 * 60_000;
/** The most rules responses the cache holds. */
const MAX_ENTRIES = 2000;

/** The rules paths the proxy serves: a catalog, and optionally one entry of it. */
const RULES_PATH =
  /^(classes|monsters|spells|equipment|magic-items|languages|tables|commands|license)(\/[A-Za-z0-9_.-]{1,100})?$/;

/**
 * An in-memory cache of bxapi's rules catalogs. It serves a response for five minutes, and then revalidates it
 * with `If-None-Match`, so bxapi sends a body only when the rules changed.
 */
export class RulesCache {
  private readonly entries = new Map<string, CacheEntry>();

  /**
   * @param bxapi - The bxapi client.
   */
  constructor(private readonly bxapi: BxapiClient) {}

  /**
   * Reads a rules path, from the cache when it's fresh.
   *
   * @param path - The path under `/v1/rules/`, with its query string.
   * @returns The response body as text, its `ETag`, and its `Cache-Control`.
   * @throws BxapiProblem or BxapiUnreachable when bxapi fails.
   */
  async fetch(path: string): Promise<CacheEntry> {
    const cached = this.entries.get(path);
    if (cached !== undefined && Date.now() - cached.checkedAt < FRESH_MS) return cached;
    const response = await this.bxapi.raw('GET', `/v1/rules/${path}`, {
      headers: cached === undefined ? {} : { 'If-None-Match': cached.etag },
    });
    if (response.status === 304 && cached !== undefined) {
      cached.checkedAt = Date.now();
      return cached;
    }
    if (response.status !== 200) {
      throw new BxapiProblem(
        response.status,
        (response.body as BxapiProblem['body'] | null) ?? {
          code: 'unknown',
          detail: `bxapi answered ${response.status}.`,
          status: response.status,
        },
        null,
      );
    }
    const entry: CacheEntry = {
      etag: response.headers.get('etag') ?? '',
      body: JSON.stringify(response.body),
      cacheControl: response.headers.get('cache-control') ?? 'private, max-age=3600',
      checkedAt: Date.now(),
    };
    this.entries.delete(path);
    this.entries.set(path, entry);
    if (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    return entry;
  }

  /**
   * Reads and parses a rules path.
   *
   * @param path - The path under `/v1/rules/`, with its query string.
   */
  async json<T>(path: string): Promise<T> {
    return JSON.parse((await this.fetch(path)).body) as T;
  }
}

/** Whether an `If-None-Match` header matches an `ETag`, ignoring weak prefixes. */
function etagMatches(header: string | undefined, etag: string): boolean {
  if (header === undefined || etag === '') return false;
  const bare = etag.replace(/^W\//, '');
  return header.split(',').some((tag) => {
    const trimmed = tag.trim();
    return trimmed === '*' || trimmed.replace(/^W\//, '') === bare;
  });
}

/** The schemas of the generator request bodies. */
const GENERATOR_BODIES: Record<GeneratorKind, z.ZodType> = {
  treasure: TreasureGeneratorRequest,
  'npc-party': NpcPartyGeneratorRequest,
  room: RoomGeneratorRequest,
  monsters: MonstersGeneratorRequest,
  character: CharacterRequest,
};

/** The path parameters of a generator route. */
const GeneratorParams = z.object({ tableId: z.string(), kind: GeneratorKindSchema });

/**
 * Registers the rules proxy (`GET /api/rules/*`), the dice roller, and the referee generators.
 *
 * @param app - The Fastify instance.
 * @param ctx - The server's services.
 */
export function registerRulesRoutes(app: FastifyInstance, ctx: Context): void {
  app.get('/api/rules/*', async (request, reply) => {
    ctx.auth.user(request);
    const [rawPath = '', rawQuery = ''] = request.url.slice('/api/rules/'.length).split('?');
    const path = decodeURIComponent(rawPath);
    if (!RULES_PATH.test(path)) notFound('rules path', path);
    const incoming = new URLSearchParams(rawQuery);
    const query = new URLSearchParams();
    for (const name of RULES_QUERY_PARAMETERS) {
      const value = incoming.get(name);
      if (value !== null) query.set(name, value.slice(0, 200));
    }
    query.sort();
    const key = query.size === 0 ? path : `${path}?${query.toString()}`;
    let entry: CacheEntry;
    try {
      entry = await ctx.rules.fetch(key);
    } catch (error) {
      throw toApiError(error, { passNotFound: true });
    }
    reply.header('Cache-Control', entry.cacheControl);
    if (entry.etag !== '') reply.header('ETag', entry.etag);
    if (etagMatches(request.headers['if-none-match'], entry.etag)) return reply.status(304).send();
    return reply.type('application/json').send(entry.body);
  });

  app.post('/api/dice/roll', async (request) => {
    ctx.auth.user(request);
    const body = parseBody(DiceRollRequest, request);
    return callBxapi(() => ctx.bxapi.post('/v1/dice/roll', body, { requestId: request.id }));
  });

  app.post('/api/tables/:tableId/generate/:kind', async (request) => {
    const params = GeneratorParams.safeParse(request.params);
    if (!params.success) notFound('generator', String((request.params as { kind?: unknown }).kind));
    const { tableId, kind } = params.data;
    ctx.tables.requireReferee(tableId, ctx.auth.user(request));
    const body = parseBody(GENERATOR_BODIES[kind], request) as Record<string, unknown>;
    if (kind === 'character') delete body.ability_roll_id;
    return callBxapi(() => ctx.bxapi.post(`/v1/generate/${kind}`, body, { requestId: request.id }));
  });
}
