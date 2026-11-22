import Fastify, { LogController } from 'fastify';
import type { FastifyError, FastifyInstance, FastifyReply } from 'fastify';
import websocket from '@fastify/websocket';
import { randomBytes } from 'node:crypto';
import { ZodError } from 'zod';
import { LIMITS } from '@bxvtt/shared/protocol';
import { AdventureCatalog, registerAdventureRoutes } from './adventures';
import { registerAnnotationRoutes } from './annotations';
import { Auth } from './auth';
import { registerCatalogRoutes } from './catalogs';
import { BxapiClient } from './bxapi';
import { CharacterStore, registerCharacterRoutes } from './characters';
import type { Config } from './config';
import type { Context } from './context';
import { Database } from './db';
import { ApiError, sendApiError, toValidationIssues } from './errors';
import { FeedStore, registerFeedRoutes } from './feed';
import { registerBattleRoutes } from './game/battle';
import { registerGameRoutes } from './game/routes';
import { registerSaveRoutes } from './game/saves';
import { GameService } from './game/service';
import { registerHealthRoute } from './health';
import { Hub } from './hub';
import { registerNotesRoutes } from './notes';
import { registerRejoinRoutes, RejoinService } from './rejoin';
import { registerRulesRoutes, RulesCache } from './rules';
import { registerTableRoutes, TableStore } from './tables';
import { registerUserRoutes, UserStore } from './users';
import { RateLimiter } from './util';
import { registerSecurityHeaders, registerWebClient, sendIndex, wantsSpaFallback } from './web';
import { registerWebSocket } from './ws';

/** A built server: the Fastify instance and its services. */
export interface Server {
  app: FastifyInstance;
  ctx: Context;
}

/** The Fastify error codes that mean the request body was malformed. */
const BAD_BODY_CODES = new Set([
  'FST_ERR_CTP_EMPTY_JSON_BODY',
  'FST_ERR_CTP_INVALID_JSON_BODY',
  'FST_ERR_CTP_INVALID_CONTENT_LENGTH',
]);

/** The deepest nesting of arrays and objects a JSON body may have. Adventure documents nest about 15 deep. */
const MAX_JSON_DEPTH = 64;

/**
 * Measures how deeply a parsed JSON value nests, without recursion, stopping once it passes the limit.
 *
 * @param value - The parsed value.
 */
function nestingDepth(value: unknown): number {
  let deepest = 0;
  const stack: [unknown, number][] = [[value, 0]];
  while (stack.length > 0) {
    const [current, depth] = stack.pop() ?? [null, 0];
    if (typeof current !== 'object' || current === null) continue;
    const level = depth + 1;
    if (level > deepest) deepest = level;
    if (deepest > MAX_JSON_DEPTH) return deepest;
    for (const child of Object.values(current)) stack.push([child, level]);
  }
  return deepest;
}

/**
 * Builds the bxvtt server: opens the database, creates the services, and registers every route. Call
 * `app.listen` to start it and `app.close` to stop it, which closes the WebSockets and the database.
 *
 * @param config - The server's settings.
 */
export async function createServer(config: Config): Promise<Server> {
  const app = Fastify({
    logger: { level: config.logLevel, redact: ['req.headers.authorization'] },
    bodyLimit: LIMITS.jsonBodyBytes,
    logController: new LogController({ disableRequestLogging: true }),
    requestIdHeader: false,
    genReqId: () => `req_${randomBytes(16).toString('base64url')}`,
    return503OnClosing: true,
    forceCloseConnections: true,
    // A URL that can't be decoded gets a problem document like every other error.
    frameworkErrors: (_error, _request, reply) => {
      // The framework types the reply with the route's generics, which no route has here.
      const plain = reply as unknown as FastifyReply;
      return sendApiError(plain, new ApiError('bad_request', "The request URL isn't valid."));
    },
  });

  // Only JSON bodies are accepted, so a text body gets 415 instead of reaching a route as a string. The JSON
  // parser refuses `__proto__` and `constructor.prototype` keys, and a body nested deeper than any request
  // needs, which would otherwise overflow the stack when the server serializes it.
  app.removeContentTypeParser('text/plain');
  const parseJson = app.getDefaultJsonParser('error', 'error');
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
    parseJson(request, typeof body === 'string' ? body : body.toString('utf8'), (error, value) => {
      if (error !== null) {
        done(error, undefined);
        return;
      }
      if (nestingDepth(value) > MAX_JSON_DEPTH) {
        done(new ApiError('bad_request', 'The request body nests too deeply.'), undefined);
        return;
      }
      done(null, value);
    });
  });

  const db = new Database(config.dataDir);
  const bxapi = new BxapiClient(config.bxapiUrl, config.bxapiKey, config.bxapiTimeoutMs, app.log);
  const users = new UserStore(db);
  const partial: Partial<Context> = {
    config,
    log: app.log,
    db,
    bxapi,
    users,
    auth: new Auth(
      users,
      new RateLimiter(config.rateLimits.failedAuth),
      new RateLimiter(config.rateLimits.userWrites),
    ),
    limits: {
      createUser: new RateLimiter(config.rateLimits.createUser),
      join: new RateLimiter(config.rateLimits.join),
      failedHostKey: new RateLimiter(config.rateLimits.failedHostKey),
      userPosts: new RateLimiter(config.rateLimits.userPosts),
      characterChecks: new RateLimiter(config.rateLimits.characterChecks),
      rejoin: new RateLimiter(config.rateLimits.rejoin),
      rejoinPolls: new RateLimiter(config.rateLimits.rejoinPolls),
    },
    rules: new RulesCache(bxapi, config.quotas.rulesCacheBytes),
    startedAt: Date.now(),
  };
  // The services refer to each other through the context, so they are created against the same object.
  const ctx = partial as Context;
  ctx.tables = new TableStore(ctx);
  ctx.hub = new Hub(
    (tableId, userId) => ctx.tables.roleOf(tableId, userId),
    (tableId) => ctx.hub.broadcast(tableId, { type: 'presence', presence: ctx.hub.presence(tableId) }),
  );
  ctx.characters = new CharacterStore(ctx);
  ctx.feed = new FeedStore(ctx);
  ctx.adventures = new AdventureCatalog(ctx);
  ctx.game = new GameService(ctx);
  ctx.rejoin = new RejoinService(ctx);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
  });
  ctx.auth.register(app);
  registerSecurityHeaders(app);
  app.addHook('onResponse', async (request, reply) => {
    request.log.info(
      {
        method: request.method,
        path: request.url.split('?')[0],
        status: reply.statusCode,
        ms: Math.round(reply.elapsedTime),
        user: request.user?.id ?? '-',
        ip: request.clientIp,
      },
      'request',
    );
  });

  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    if (error instanceof ApiError) return sendApiError(reply, error);
    if (error instanceof ZodError) {
      return sendApiError(
        reply,
        new ApiError('validation_error', "The request doesn't match the schema.", {
          errors: toValidationIssues(error.issues),
        }),
      );
    }
    const code = 'code' in error ? error.code : undefined;
    if (code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return sendApiError(reply, new ApiError('content_too_large', 'The request body is too large.'));
    }
    if (code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
      return sendApiError(
        reply,
        new ApiError('unsupported_media_type', 'Send the body as application/json.'),
      );
    }
    if ((code !== undefined && BAD_BODY_CODES.has(code)) || error instanceof SyntaxError) {
      return sendApiError(reply, new ApiError('bad_request', "The request body isn't valid JSON."));
    }
    const status = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (status >= 400 && status < 500) {
      return sendApiError(reply, new ApiError('bad_request', error.message, {}, { status }));
    }
    request.log.error({ err: error }, 'unhandled error');
    return sendApiError(
      reply,
      new ApiError('internal_error', 'Something went wrong in bxvtt. The server logged it.'),
    );
  });

  await app.register(websocket, { options: { maxPayload: LIMITS.wsMessageBytes } });
  const webClient = await registerWebClient(app, config);

  app.setNotFoundHandler((request, reply) => {
    if (webClient !== null && wantsSpaFallback(request)) return sendIndex(webClient, request, reply);
    return sendApiError(
      reply,
      new ApiError('not_found', `No route matches ${request.method} ${request.url.split('?')[0] ?? ''}.`),
    );
  });

  registerHealthRoute(app, ctx);
  registerUserRoutes(app, ctx);
  registerTableRoutes(app, ctx);
  registerCharacterRoutes(app, ctx);
  registerRulesRoutes(app, ctx);
  registerCatalogRoutes(app, ctx);
  registerAdventureRoutes(app, ctx);
  registerGameRoutes(app, ctx);
  registerBattleRoutes(app, ctx);
  registerSaveRoutes(app, ctx);
  registerFeedRoutes(app, ctx);
  registerAnnotationRoutes(app, ctx);
  registerNotesRoutes(app, ctx);
  registerRejoinRoutes(app, ctx);
  registerWebSocket(app, ctx);

  app.addHook('preClose', async () => {
    ctx.hub.closeAll();
  });
  app.addHook('onClose', async () => {
    db.close();
  });
  return { app, ctx };
}
