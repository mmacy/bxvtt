import type { FastifyBaseLogger } from 'fastify';
import type { AdventureCatalog } from './adventures';
import type { Auth } from './auth';
import type { BxapiClient } from './bxapi';
import type { CharacterStore } from './characters';
import type { Config } from './config';
import type { Database } from './db';
import type { FeedStore } from './feed';
import type { GameService } from './game/service';
import type { Hub } from './hub';
import type { RejoinService } from './rejoin';
import type { RulesCache } from './rules';
import type { TableStore } from './tables';
import type { UserStore } from './users';
import type { RateLimiter } from './util';

/** The server's services, which every route module receives. */
export interface Context {
  config: Config;
  log: FastifyBaseLogger;
  db: Database;
  bxapi: BxapiClient;
  users: UserStore;
  auth: Auth;
  tables: TableStore;
  characters: CharacterStore;
  feed: FeedStore;
  hub: Hub;
  rules: RulesCache;
  adventures: AdventureCatalog;
  game: GameService;
  rejoin: RejoinService;
  limits: {
    /** New users, by address. */
    createUser: RateLimiter;
    /** Invite code attempts, by address. */
    join: RateLimiter;
    /** Wrong host keys, by address. */
    failedHostKey: RateLimiter;
    /** Feed posts and new annotations, by user. */
    userPosts: RateLimiter;
    /** Character checks, by user. Each check can cost bxapi several requests. */
    characterChecks: RateLimiter;
    /** New rejoin requests, by address. */
    rejoin: RateLimiter;
    /** Polls of a rejoin request's status, by address. */
    rejoinPolls: RateLimiter;
  };
  startedAt: number;
}
